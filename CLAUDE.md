# AASHA — AI-Powered Maternal Health Surveillance System

> *Hope in Sanskrit* — Continuous care for women who cannot reach a clinic.

**Version:** 1.0 (Hackathon MVP) | **Stack:** FastAPI · Supabase · Moorcheh AI · Claude API · React · Twilio SMS

---

## Project Overview

Aasha monitors pregnant and postpartum women in low-resource settings via SMS — no smartphone, no app, no internet required on the patient side. The system runs entirely on basic feature phone SMS.

**Core loop:** Check in 3×/week during pregnancy and daily for the first 2 weeks postpartum → build a personalized clinical baseline per patient → detect deviation using Moorcheh AI semantic retrieval + Claude clinical reasoning → autonomously coordinate emergency care via SMS when risk escalates.

**Key differentiator:** Moorcheh AI (serverless semantic search using ITS scoring) replaces the traditional manual RAG pipeline (pgvector + OpenAI embeddings + langchain chunking), dramatically reducing infrastructure complexity and development time.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11 + FastAPI (async) |
| Database | Supabase free tier (PostgreSQL) |
| Semantic Search / RAG | Moorcheh AI (`moorcheh-sdk`) |
| Clinical LLM | `claude-opus-4-5` |
| Free-text classification LLM | `claude-haiku-4-5` |
| SMS | Twilio SMS API |
| Task scheduler | APScheduler (`AsyncIOScheduler`) |
| Frontend | React 18 + TypeScript + Tailwind CSS (npm + PostCSS, Vite) |
| Charts | Recharts |
| ORM | SQLAlchemy async + asyncpg |
| Local tunnel | ngrok (static subdomain) |

### Python Dependencies

```
fastapi
uvicorn
sqlalchemy[asyncio]
asyncpg
apscheduler
anthropic
moorcheh-sdk       # replaces openai + langchain
twilio
python-dotenv
pydantic
httpx
```

**Eliminated by Moorcheh** (do not add back):
- `openai` — was used only for `text-embedding-3-small`
- `langchain` — was used only for `RecursiveCharacterTextSplitter`
- `pdfplumber` / `pymupdf` — Moorcheh handles PDF ingestion server-side

---

## Environment Variables

```bash
# Supabase
DATABASE_URL=postgresql+asyncpg://postgres:[password]@[host]:5432/postgres
SUPABASE_URL=https://[project-id].supabase.co
SUPABASE_ANON_KEY=...

# Moorcheh AI (replaces OPENAI_API_KEY)
MOORCHEH_API_KEY=...

# Twilio
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+14155551234

# Anthropic
ANTHROPIC_API_KEY=...

# App
APP_ENV=development
BASE_URL=https://[ngrok-subdomain].ngrok-free.app
CHW_DEFAULT_ID=uuid-of-demo-chw
DEMO_MODE=true
```

---

## System Architecture

Five components. Components 1, 2, 4, 5 are intentionally simple. **All complexity lives in Component 3 (Clinical Reasoning Agent).**

```
[Twilio SMS API] <---> [Component 1: Messaging Engine]
                              |
                    check-in complete
                              |
                              v
              [Component 3: Clinical Reasoning Agent]
                  1. Pull patient history from Supabase
                  2. Build NL symptom query
                  3. Moorcheh similarity_search → top-5 protocol chunks
                  4. Assemble prompt (context + protocols + log)
                  5. Claude → structured JSON risk assessment
                  6. Persist to clinical_assessments
                  7. Update patient risk tier
                  8. Fire escalation if tier >= 2
                              |
                         tier >= 2
                              |
                              v
              [Component 4: Escalation Engine]
                  Simultaneous SMS: patient + CHW + facility
                  APScheduler follow-up every 10 min until resolved

[Component 5: CHW Dashboard (React)] — polls /api/patients every 30s
[Component 2: Supabase DB] + [Moorcheh AI namespace] — shared data layer
```

---

## Database Schema

> The `clinical_documents` table from prior designs is **eliminated**. Moorcheh owns the clinical protocol corpus.

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| `patients` | Core patient record + baseline | `id`, `name`, `phone_number`, `gestational_age_at_enrollment`, `status`, `current_risk_tier`, `health_zone_id`, `baseline` (JSONB), `risk_factors` (JSONB) |
| `community_health_workers` | CHW contact info | `id`, `name`, `phone_number`, `zone_id` |
| `health_zones` | Geographic zones (region = area code, e.g. `L6Y`) | `id`, `name`, `region` |
| `health_facilities` | Referral facilities | `id`, `name`, `facility_level`, `phone_number`, `capabilities` (JSONB) |
| `check_in_schedules` | Scheduled/completed check-ins | `id`, `patient_id`, `scheduled_for`, `sent_at`, `completed_at`, `missed` |
| `conversation_state` | Active SMS conversation tracking | `id`, `patient_id`, `check_in_id`, `current_node`, `conversation_data` (JSONB), `expires_at` |
| `symptom_logs` | Parsed check-in symptom data | `id`, `patient_id`, `check_in_id`, `gestational_age_days`, `responses` (JSONB), `raw_responses` (JSONB) |
| `clinical_assessments` | AI assessment output + audit trail | `id`, `patient_id`, `risk_tier`, `clinical_reasoning`, `protocol_references` (JSONB), `full_assessment` (JSONB), `moorcheh_query`, `moorcheh_chunk_ids` |
| `escalation_events` | Escalation lifecycle tracking | `id`, `patient_id`, `assessment_id`, `tier`, all notification timestamps, `resolved_at` |
| `sms_log` | Complete SMS audit log | `id`, `patient_id`, `direction`, `body`, `twilio_sid`, `sent_at` |

**Patient baseline** (JSONB, updated after every check-in): headache history (rolling last 10), headache frequency, typical swelling location, wellbeing scores, response rate, checkins completed. Marked established after 4 check-ins.

---

## Component 1: Messaging Engine

**Twilio webhook → FastAPI → conversation state machine → clinical agent**

### Check-in Scheduling
- **Pregnancy (default):** 3×/week — Monday, Wednesday, Friday at 8am local
- **Elevated (Tier 2+):** Daily
- **Postpartum days 1–14:** Daily
- **Postpartum days 15–42:** 3×/week

### Conversation State Machine
Each active conversation is a row in `conversation_state`. On inbound SMS:
1. Look up open conversation by sender phone number
2. Read `current_node` to identify which question was asked
3. Validate and parse response
4. If non-numeric → call Claude Haiku for classification (≤5s)
5. If unclassifiable → send clarification, hold at current node
6. Update `conversation_data`, determine next node
7. Send next question or mark complete
8. On complete → trigger Clinical Reasoning Agent

### Question Tree
- Static Python dictionary; each node has: message template, key, type (`single_number` or `multi_number`), valid options, branch logic
- Symptom follow-up order: headache → vision → swelling → abdominal pain → fetal movement → fever → bleeding
- Up to 12 exchanges for third-trimester with multiple symptoms; 1 exchange for a healthy response
- Separate tree activates when `patient.status == postpartum`

### Missed Check-in Handling
- APScheduler fires `check_missed` 4 hours after check-in sent
- 2 consecutive misses → Tier 1 alert
- 4 consecutive misses → Tier 2 alert

---

## Component 3: Clinical Reasoning Agent (Priority Build)

> **This is where all system complexity lives. Build this rigorously.**

### Clinical Document Corpus (Pre-load into Moorcheh before demo)

| Document | Source | Conditions |
|----------|--------|-----------|
| WHO Recommendations on ANC (2016) | who.int | General antenatal, preeclampsia |
| WHO Recommendations for Prevention and Treatment of PPH (2012) | who.int | Postpartum hemorrhage |
| WHO Recommendations for Pre-eclampsia (2011) | who.int | Preeclampsia, eclampsia |
| FIGO Hypertensive Disorders Guidelines (2019) | figo.org | Preeclampsia, chronic hypertension |
| FIGO Postpartum Hemorrhage Guidelines (2022) | figo.org | PPH, uterine atony |
| WHO MCPC (Managing Complications) | who.int | All complications |
| CDC Severe Maternal Morbidity Indicators | cdc.gov | Risk stratification |
| IMPAC (Integrated Management of Pregnancy and Childbirth) | who.int | CHW protocols |

**Minimum 50 documents required in Moorcheh namespace before demo.**

### Moorcheh Document Ingestion

> **Run this once before the hackathon demo.** Use the context manager pattern (`with` block) for automatic resource cleanup.

```python
import time
import glob
from moorcheh_sdk import MoorchehClient

# Use context manager for automatic cleanup
with MoorchehClient(api_key=os.getenv('MOORCHEH_API_KEY')) as client:

    # Create a text namespace (Moorcheh auto-handles chunking + MIB embedding)
    client.namespaces.create(
        namespace_name='aasha-clinical-protocols',
        type='text'  # 'text' = Moorcheh auto-embeds; 'vector' = bring your own embeddings
    )

    # Option A: Upload pre-extracted text chunks with rich metadata
    # Use this for maximum control over chunk boundaries and metadata
    documents = [
        {
            'id': 'who_pph_2012_diagnosis_003',
            'text': 'Primary PPH is defined as blood loss of 500mL...',
            'metadata': {
                'source': 'WHO PPH Guidelines 2012',
                'section': 'Diagnosis and Clinical Features',
                'condition': 'postpartum_hemorrhage'
            }
        },
        # ... additional chunks
    ]
    client.documents.upload(
        namespace_name='aasha-clinical-protocols',
        documents=documents  # Upload in batches of ≤100 documents
    )

    # Option B: Upload PDF files for server-side ingestion
    # Moorcheh handles PDF parsing, chunking, and embedding automatically
    for pdf_path in glob.glob('clinical_docs/*.pdf'):
        client.documents.upload_file(
            namespace_name='aasha-clinical-protocols',
            file_path=pdf_path  # Max file size: 10MB
        )

    # CRITICAL: Embedding generation is ASYNCHRONOUS.
    # Wait for indexing to complete before running search.
    time.sleep(5)  # Minimum; increase for large batches

    # Verify ingestion worked with a test query
    test = client.similarity_search.query(
        namespaces=['aasha-clinical-protocols'],
        query='postpartum hemorrhage warning signs',
        top_k=3
    )
    print(f"Ingestion check: {len(test.get('matches', []))} results returned")
```

**Namespace naming rules:** only `-` and `_` special characters allowed, no spaces, max 64 characters.

**Batch upload limit:** 100 documents per `documents.upload()` call. For larger corpora, loop in batches of 100.

### Moorcheh Retrieval (Replaces pgvector pipeline)

```python
import time
from moorcheh_sdk import MoorchehClient, MoorchehError, NamespaceNotFound, APIError

async def retrieve_clinical_context(query: str, top_k: int = 5) -> list[dict]:
    """
    Replaces: OpenAI embedding call + pgvector SQL query + fallback logic.
    Single SDK call with ITS scoring — no threshold tuning needed.
    """
    with MoorchehClient(api_key=settings.MOORCHEH_API_KEY) as client:
        try:
            results = client.similarity_search.query(
                namespaces=['aasha-clinical-protocols'],
                query=query,      # Natural language string; Moorcheh auto-embeds
                top_k=top_k       # Returns top_k results sorted by ITS score
                # Optional: threshold=0.5 to filter low-relevance results
                # Optional: kiosk_mode=True requires threshold to be set
            )
        except NamespaceNotFound:
            # Namespace not yet created or corpus not loaded — treat as agent failure
            raise
        except APIError as e:
            # HTTP 429 rate limit, 500 server error, etc.
            raise

    # Response format: {"matches": [...], "total": N}
    return [
        {
            'chunk_id': match['id'],
            'source': match.get('metadata', {}).get('source', 'Unknown'),
            'section': match.get('metadata', {}).get('section', ''),
            'content': match.get('text', ''),
            'similarity': match.get('score', 0.0)
        }
        for match in results.get('matches', [])
    ]
    # ITS scoring handles sparse-signal cases — no fallback broad query needed.
    # Minimum 2 chunks required (F3.2) before passing to Claude.
```

**Metadata filtering** (optional, for targeted retrieval): append `#key:value` tokens directly in the query string.

```python
# Filter to only postpartum hemorrhage guidelines
query = f"bleeding danger signs postpartum #condition:postpartum_hemorrhage"

# Multiple filters
query = f"hypertension headache preeclampsia #condition:preeclampsia #source:figo"
```

Filters only work if metadata was included when uploading documents. Use consistent metadata keys across all uploaded chunks.

### Agent Pipeline Steps

1. **Assemble patient context** — pull patient record, last 10 symptom logs, prior escalations, compute gestational age; build structured dict with patient summary, risk factors, baseline, symptom trajectory, current check-in, escalation history
2. **Build semantic retrieval query** — map symptom codes to clinical NL (e.g., `headache_severity=3` → `"severe headache persistent pregnancy danger sign"`); construct rich NL query
3. **Retrieve via Moorcheh** — `similarity_search.query()` → top-5 protocol chunks with ITS scores
4. **Construct clinical prompt** — patient context (JSON) + protocol chunks → Claude prompt requesting symptom analysis, trajectory assessment, risk tier (0–3), recommended actions, uncertainty flags; **output must be valid JSON**
5. **Execute Claude call** — parse structured JSON response; retry once on parse failure; fall back to conservative Tier 2 on complete failure
6. **Persist** — write to `clinical_assessments` (include `moorcheh_query` and `moorcheh_chunk_ids`), update `patient.current_risk_tier`, update patient baseline, fire escalation if tier ≥ 2

### Expected Latency

| Step | Time |
|------|------|
| Patient context assembly (Supabase read) | 100–200ms |
| Moorcheh similarity_search | 100–300ms |
| Claude clinical reasoning call | 3–8s |
| DB writes | 100–200ms |
| **Total** | **~3.5–9s** |

### Example Claude Output (Tier 3)

```json
{
  "risk_tier": 3,
  "escalate_immediately": true,
  "primary_concern": "Possible severe preeclampsia - 4 concurrent danger signs",
  "clinical_reasoning": "Primigravida at 32 weeks presents with four concurrent features of severe preeclampsia...",
  "protocol_references": [
    {
      "chunk_id": "figo_hd_2019_warning_signs_003",
      "source": "FIGO Hypertensive Disorders in Pregnancy Guidelines, 2019",
      "relevant_finding": "Visual disturbances, severe headache, epigastric pain, and sudden facial edema together indicate severe preeclampsia requiring urgent evaluation regardless of BP reading availability."
    }
  ],
  "symptom_analysis": {
    "headache": {
      "reported": true,
      "value": "severity 3/3, >2 days duration",
      "baseline_deviation": "critical",
      "clinical_significance": "First-ever severe headache with zero prior history."
    },
    "vision_disturbance": { "reported": true, "baseline_deviation": "critical" }
  },
  "recommended_actions": [
    "Transport patient to district hospital immediately",
    "Administer magnesium sulfate 4g IV if within CHW scope",
    "Keep patient lying on left side during transport"
  ],
  "uncertainty_flags": ["Blood pressure not available"]
}
```

---

## Component 4: Escalation Engine

### Risk Tier Definitions

| Tier | Name | Clinical Meaning | System Response |
|------|------|-----------------|----------------|
| 0 | Normal | No concerning findings | Routine check-in logged |
| 1 | Watch | Early single signal, first occurrence | CHW soft notification |
| 2 | Concern | Persistent/worsening pattern or concerning cluster | CHW alert, call patient today, daily check-ins |
| 3 | Emergency | Meets criteria for immediate facility referral | Full escalation workflow fires immediately |

### Escalation Actions

- **Tier 1:** SMS to CHW — patient name, gestational age, primary concern (awareness only)
- **Tier 2:** SMS to CHW with patient details + phone; set `check_in_frequency` to daily
- **Tier 3:** Simultaneous SMS via `asyncio.gather` to patient + CHW + receiving facility; start APScheduler follow-up loop (transport is omitted in this app)

### Follow-up Loop (APScheduler, every 10 min)

- CHW not acknowledged after 20 min → try secondary CHW
- Patient not confirmed but CHW acknowledged → ask CHW to verify
- Stops after 12 attempts (2 hours) or upon resolution

### Inbound SMS Reply Routing

| Reply | From | Action |
|-------|------|--------|
| `RESPONDING` | CHW | Set `chw_acknowledged_at` |
| `UNAVAILABLE` | CHW | Try secondary CHW |
| `RESOLVED` | CHW | Set `resolved_at`, reset patient tier |

---

## Component 5: CHW Dashboard

React SPA built with Vite. Light theme, polled updates every 30s. Designed for usability on mobile and desktop.

### Authentication

CHWs log in via username/password at `/login`. Token stored in memory. `GET /api/auth/me` validates the session on page load; 401 responses auto-logout. The `/login` route also serves as the public-facing marketing landing page (hero + About carousel).

### Design Tokens

The actual implemented UI uses a **light theme** with warm pink/rose accents — not the dark navy originally planned.

| Token | Value | Usage |
|-------|-------|-------|
| `tier-3` (Emergency) | `bg-rose-600` / `#e11d48` | Tier badge, accent bar, initials avatar |
| `tier-2` (Concern) | `bg-orange-500` / `#f97316` | Tier badge, accent bar |
| `tier-1` (Watch) | `bg-amber-500` / `#f59e0b` | Tier badge, accent bar |
| `tier-0` (Normal) | `bg-teal-500` / `#14b8a6` | Tier badge, accent bar |
| Primary accent | `#B85050` | Buttons, checkboxes, focus rings, section badges |
| Hero background | `#fff2f8` | Login hero section background |
| App background | `bg-white` + `FloralBackdrop` | Dashboard shell |
| Card surface | `bg-white` with `border-slate-200` | Patient cards, summary cards |
| Text primary | `text-slate-900` | Headings, names |
| Text secondary | `text-slate-500` | Labels, subtitles |

Tier constants live in `frontend/src/constants/tiers.ts` and export: `TIER_BG`, `TIER_BADGE` (soft tint pill), `TIER_TEXT`, `TIER_BORDER` (`border-l-*`), `TIER_CARD_BG`, `TIER_NAMES`.

### Frontend npm Package

`webgl-fluid-enhanced` — WebGL fluid simulation used on the login hero background. Responds to cursor/touch movement with soft pink trailing fluid effect. Installed via `npm install webgl-fluid-enhanced`.

### Views

**Landing Page (`/` and `/about`):** Hero section with animated orbs, Flower SVGs, cursor parallax, and WebGL fluid background. Subtitle: "Equal Care for All". Login and Join Us buttons. About section is a 3-stop carousel (Problem → Solution → Mission). Join Us opens a contact modal.

**Login Form (`/login`):** Username/password form with same orb/flower animation background (no fluid). Calls `POST /api/auth/login`, stores returned `access_token`.

**Patient List (`/dashboard`):** Glass-morphism header (logo, live/disconnected status badge, last-refresh time, Enroll Patient button, Logout). Tier summary cards (tinted cards with left accent border). Patient card grid (2 columns on desktop): colored left accent bar, initials avatar, tier badge, name, gestational age, missed check-in indicator. Sorted by tier descending then gestational age.

**Patient Detail:** Clinical assessment card (primary concern, reasoning, recommended actions, protocol references, uncertainty flags), Recharts symptom timeline (headache severity + wellbeing score), last 5 check-ins, quick action buttons (Log BP Reading, Mark Visited, Resolve Escalation), patient info (enrollment data, risk factors, care team contacts).

**Enrollment Form:** Accessible via "Enroll Patient" button in the header. 4-section card layout: (1) Patient Details — name, phone, address; (2) Pregnancy Information — gestational age, status (pregnant/postpartum), estimated due date; (3) Personal Risk Factors — checkbox grid (primigravida, prior preeclampsia, chronic hypertension, multiple gestation, prior PPH); (4) Family History — 8 Yes/No/Unknown toggle questions + notes field. Calls `POST /api/patients/enroll`. On success, shows confirmation and returns to dashboard with a data refetch.

---

## Clinical Rules (Implement Exactly As Specified)

### Conditions Monitored

**Preeclampsia / Eclampsia**
- Warning signs: persistent headache, visual disturbances (blurry vision, spots/photopsia), facial and hand edema (NOT normal ankle swelling), epigastric/upper abdominal pain, elevated BP if measurable
- Risk factors: primigravida, prior preeclampsia, chronic hypertension, multiple gestation, age <18 or >35, diabetes
- Most dangerous: third trimester (28+ weeks) and up to 48 hours postpartum
- **Key distinction:** normal edema = ankles only; preeclampsia edema = face + hands + ankles together

**Postpartum Hemorrhage (PPH)**
- Primary PPH (hours 0–24): soaking >1 pad/hour
- Secondary PPH (days 4–14): bright red bleeding persisting or worsening after day 3 (subinvolution or retained products)

**Postpartum Sepsis**
- Window: days 2–10 after delivery
- Warning signs: fever (>38°C), foul/unusual discharge, lower abdominal pain, general malaise
- **Clinical rule: fever + any single additional symptom in a postpartum woman = Tier 2 emergency**

**Reduced Fetal Movement**
- Significant from 28 weeks gestation
- Cannot be confirmed remotely → triggers CHW contact for in-person assessment

---

## Moorcheh SDK Reference

**Install:** `pip install moorcheh-sdk` | **Base URL:** `https://api.moorcheh.ai/v1` | **Auth header:** `x-api-key` (lowercase)

**Always use the context manager:**
```python
from moorcheh_sdk import MoorchehClient
with MoorchehClient(api_key=os.getenv('MOORCHEH_API_KEY')) as client:
    ...
```

### Client Initialization

```python
# Recommended: API key from environment variable
with MoorchehClient() as client:          # reads MOORCHEH_API_KEY env var automatically
    ...

# Explicit (also fine for hackathon)
with MoorchehClient(api_key="your-key") as client:
    ...
```

### Namespace Management

```python
# Create — type must be 'text' (auto-embed) or 'vector' (bring your own)
# Aasha uses 'text'. Only use 'vector' if supplying pre-computed embeddings.
client.namespaces.create(namespace_name='aasha-clinical-protocols', type='text')

# List all namespaces
namespaces = client.list_namespaces()
for ns in namespaces:
    print(ns['namespace_name'], ns['type'], ns['item_count'])

# Delete (permanent — all data lost)
client.namespaces.delete(namespace_name='aasha-clinical-protocols')
```

### Data Operations

```python
# Upload text documents (≤100 per call, ≤10MB per file)
client.documents.upload(
    namespace_name='aasha-clinical-protocols',
    documents=[
        {
            'id': 'unique-id-string',        # required, must be unique
            'text': 'Document content...',   # required
            'metadata': {                    # optional but strongly recommended
                'source': 'WHO PPH Guidelines 2012',
                'section': 'Diagnosis',
                'condition': 'postpartum_hemorrhage'
            }
        }
    ]
)

# Upload file (PDF/DOCX — Moorcheh chunks + embeds server-side)
client.documents.upload_file(
    namespace_name='aasha-clinical-protocols',
    file_path='clinical_docs/who_pph_2012.pdf'  # max 10MB
)

# Retrieve documents by ID
docs = client.documents.get(
    namespace_name='aasha-clinical-protocols',
    ids=['id-1', 'id-2']
)

# Delete documents by ID
client.documents.delete(
    namespace_name='aasha-clinical-protocols',
    ids=['id-1', 'id-2']
)

# ⚠️ ASYNC INDEXING: after upload, always wait before searching
import time
time.sleep(5)  # minimum; use longer for large batches
```

### Search

```python
# Basic semantic search
results = client.similarity_search.query(
    namespaces=['aasha-clinical-protocols'],  # list — can search multiple at once
    query='severe headache persistent pregnancy danger sign',
    top_k=5           # default 10; use 3–5 for focused clinical retrieval
)

# Response format:
# {
#   "matches": [
#     {"id": "chunk-id", "score": 0.95, "text": "...", "metadata": {...}},
#     ...
#   ],
#   "total": 5
# }

# With metadata filters (append #key:value to query string)
results = client.similarity_search.query(
    namespaces=['aasha-clinical-protocols'],
    query='bleeding postpartum warning signs #condition:postpartum_hemorrhage',
    top_k=5
)

# With score threshold (strict filtering for production)
results = client.similarity_search.query(
    namespaces=['aasha-clinical-protocols'],
    query='preeclampsia symptoms',
    top_k=5,
    kiosk_mode=True,   # kiosk_mode=True requires threshold to be set
    threshold=0.7      # only return results with ITS score >= 0.7
)

# Cross-namespace search (search multiple namespaces simultaneously)
results = client.similarity_search.query(
    namespaces=['aasha-clinical-protocols', 'aasha-chw-protocols'],
    query='emergency transport referral criteria',
    top_k=5
)
```

### Error Handling

```python
from moorcheh_sdk import (
    MoorchehClient,
    MoorchehError,        # base class — catch for any Moorcheh error
    AuthenticationError,  # 401 — bad/missing API key
    InvalidInputError,    # 400 — malformed request or bad parameters
    NamespaceNotFound,    # 404 — namespace doesn't exist
    ConflictError,        # 409 — namespace already exists
    APIError              # 429 rate limit, 500 server error, etc.
)

try:
    results = client.similarity_search.query(
        namespaces=['aasha-clinical-protocols'],
        query=query,
        top_k=5
    )
except NamespaceNotFound:
    # Corpus not loaded — critical pre-demo setup failure
    logger.error("Moorcheh namespace missing — run corpus ingestion script")
    raise
except AuthenticationError:
    logger.error("Invalid MOORCHEH_API_KEY")
    raise
except APIError as e:
    # Covers rate limits (429) and server errors (500)
    # Fall back to Tier 2 conservative assessment per F3.8
    logger.warning(f"Moorcheh API error: {e}")
    return []  # empty chunks → agent uses Tier 2 fallback
except MoorchehError as e:
    logger.warning(f"Moorcheh general error: {e}")
    return []
```

### HTTP Status Codes

| Code | Meaning | Common Cause |
|------|---------|-------------|
| 200 | OK | Success |
| 201 | Created | Namespace/document created |
| 400 | Bad Request | Invalid params, malformed JSON |
| 401 | Unauthorized | Invalid/missing `x-api-key` header |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Namespace doesn't exist |
| 409 | Conflict | Namespace already exists |
| 413 | Payload Too Large | File > 10MB |
| 429 | Too Many Requests | Rate limit — add exponential backoff |
| 500 | Internal Server Error | Moorcheh server-side issue |

### Supported AI Models (for `answer.generate` — not used in Aasha's core pipeline)

Aasha calls Claude directly via the Anthropic SDK for clinical reasoning. `answer.generate` is not used. This table is reference only.

| Model ID | Provider |
|----------|---------|
| `anthropic.claude-sonnet-4-20250514-v1:0` | Anthropic |
| `anthropic.claude-sonnet-4-5-20250929-v1:0` | Anthropic |
| `anthropic.claude-opus-4-5-20251101-v1:0` | Anthropic |
| `meta.llama4-maverick-17b-instruct-v1:0` | Meta |
| `meta.llama3-3-70b-instruct-v1:0` | Meta |
| `amazon.nova-pro-v1:0` | Amazon |
| `deepseek.r1-v1:0` | DeepSeek |
| `openai.gpt-oss-120b-1:0` | OpenAI |
| `qwen.qwen3-32b-v1:0` | Qwen |

---

## Functional Requirements Summary

### Critical (must work for demo)
- **F1.4** Welcome SMS within 60s of enrollment
- **F2.1** Check-in SMS within 5 min of scheduler firing
- **F2.5** Free-text classification via Claude Haiku ≤5s
- **F3.1** Clinical reasoning agent completes within 30s of check-in
- **F3.2** Retrieve minimum 2 Moorcheh chunks before Claude call
- **F3.7** Retry once on JSON parse failure; **F3.8** fall back to Tier 2
- **F4.1** Tier 3 escalation fires within 60s of assessment
- **F4.2** All four escalation SMS sent simultaneously (`asyncio.gather`)
- **F4.3** APScheduler follow-up every 10 min after Tier 3
- **F5.2** Dashboard polls `/api/patients` every 30s

### Non-Functional
- Twilio webhook returns HTTP 200 within 3s
- Clinical reasoning agent completes within 30s
- Dashboard patient list loads within 3s
- Handle 50 concurrent enrolled patients
- `conversation_state` rows soft-deleted after 48h
- All `symptom_log` writes are atomic
- Stay within Supabase free tier limits
- ngrok tunnel URL must be static/pinned

---

## 48-Hour Build Order

| Hours | Task | Owner |
|-------|------|-------|
| 0–2 | Setup: Supabase schema, FastAPI structure, ngrok + Twilio, React + Tailwind | All |
| 2–6 | Data foundation: SQLAlchemy models, POST /api/patients, Moorcheh namespace + document upload, verify search with 3 test queries | Backend A + B |
| 6–12 | Messaging engine: Twilio webhook, conversation state machine, question tree, response parser, APScheduler, end-to-end SMS test | Backend A |
| 12–20 | **Clinical reasoning agent (PRIORITY):** patient context assembly, retrieval query builder, Moorcheh search integration, clinical prompt builder, Claude call + JSON parsing, retry/fallback, assessment persistence | Backend B |
| 20–26 | Escalation engine: tier-based dispatch, asyncio.gather SMS, escalation events, APScheduler follow-up loop, inbound SMS routing | Backend A |
| 26–36 | Dashboard: patient list + tier badges, summary cards, polling hook, patient detail view, clinical assessment card, symptom timeline, action buttons | Frontend + Full-stack |
| 36–42 | Integration testing: full loop enrollment through Tier 3 escalation, demo seed endpoint, verify all phones, fix bugs | All |
| 42–48 | Polish + demo rehearsal: 3× run-through with timer, cached fallback, ngrok stability check | All |

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Claude API latency spikes | Medium | High | Pre-warm with test call; have cached demo assessment ready |
| Twilio webhook failure | Low | High | End-to-end test 2h before demo; verify ngrok tunnel |
| Moorcheh returning no results | Low | High | Pre-test all demo symptom combos; verify namespace populated |
| LLM returns malformed JSON | Medium | Medium | Retry logic + Tier 2 fallback already implemented |
| Supabase free tier limits | Low | Medium | Demo uses ≤10 patients; well within limits |
| Moorcheh API unavailable | Low | High | Serverless/managed; monitor status page before demo |
| ngrok URL changes | Low | High | Use static subdomain; test URL pinning before demo |
| Demo phone not receiving SMS | Medium | High | Use Twilio test credentials verified the night before |

---

## Out of Scope (MVP)

Multi-language support, WhatsApp integration, dashboard auth/login, HIPAA compliance infrastructure, BP device integration, ML model training, multi-zone CHW hierarchy, patient self-enrollment, historical data import, PDF/export, offline mode, push notifications, automated CHW daily summaries, production security hardening, rate limiting, API authentication, automated test suite.
