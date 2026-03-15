# Aasha — AI-Powered Maternal Health Surveillance System

> *Hope* (Sanskrit) — Continuous care for women who cannot reach a clinic.

Aasha monitors pregnant and postpartum women in low-resource settings **via SMS only**. No smartphone, no app, and no internet are required on the patient side. The system runs entirely on basic feature-phone SMS.

**Core loop:** Check in 3×/week during pregnancy and daily for the first 2 weeks postpartum → build a personalized clinical baseline per patient → detect deviation using **Moorcheh AI** semantic retrieval + **Claude** clinical reasoning → autonomously coordinate emergency care via SMS when risk escalates.

---

## Table of Contents

- [What It Does](#what-it-does)
- [Tech Stack](#tech-stack)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [Key Components](#key-components)
- [Environment Variables](#environment-variables)
- [Demo Mode](#demo-mode)

---

## What It Does

- **SMS check-ins** — Patients receive scheduled check-in questions (headache, vision, swelling, abdominal pain, fetal movement, fever, bleeding, etc.) and reply with numbers or short text.
- **Clinical reasoning** — After each check-in, the system assembles patient context, retrieves relevant clinical protocol chunks from Moorcheh AI, and uses Claude to produce a structured risk assessment (Tier 0–3).
- **Risk tiers** — **Tier 0** (Normal), **Tier 1** (Watch), **Tier 2** (Concern — CHW alert, daily check-ins), **Tier 3** (Emergency — simultaneous SMS to patient, CHW, transport, and facility + follow-up loop).
- **Escalation** — Tier 3 triggers immediate multi-party SMS and an APScheduler follow-up loop (e.g. every 10 min) until the event is resolved or timeout.
- **CHW dashboard** — React SPA for community health workers: patient list by tier, clinical assessment details, symptom timeline, and quick actions.
- **Patient enrollment** — CHWs can enroll new patients directly from the dashboard (name, phone, gestational age, personal risk factors, family history). Triggers a welcome SMS and first check-in schedule.
- **Authentication** — CHW login with username/password credentials. Session token persisted in-memory; 401 responses auto-logout.
- **Marketing landing page** — Public-facing home page with animated fluid background, About section (Problem → Solution → Mission carousel), and a Join Us contact modal.

Conditions monitored include preeclampsia/eclampsia, postpartum hemorrhage (PPH), postpartum sepsis, and reduced fetal movement, following WHO/FIGO-style guidance ingested into Moorcheh.

---

## Tech Stack

| Layer              | Technology                          |
|--------------------|-------------------------------------|
| Backend            | Python 3.11, FastAPI (async)         |
| Database            | Supabase (PostgreSQL)               |
| Semantic search/RAG| Moorcheh AI (`moorcheh-sdk`)        |
| Clinical LLM       | Claude Opus 4.5                     |
| Free-text classify | Claude Haiku 4.5                   |
| SMS                | Twilio SMS API                      |
| Scheduler          | APScheduler (AsyncIOScheduler)      |
| Frontend           | React 18, TypeScript, Tailwind CSS (npm + PostCSS) |
| Charts              | Recharts                            |
| ORM                 | SQLAlchemy async + asyncpg          |
| Local tunnel        | ngrok (for Twilio webhooks)         |

---

## Architecture Overview

```
[Twilio SMS] ←→ [Messaging Engine] → check-in complete
                      ↓
            [Clinical Reasoning Agent]
             • Patient context (Supabase)
             • NL symptom query → Moorcheh similarity_search → top-5 chunks
             • Claude → structured JSON risk assessment
             • Persist assessment, update risk tier, fire escalation if tier ≥ 2
                      ↓
            [Escalation Engine] — Tier 3: SMS to patient + CHW + transport + facility
                                  APScheduler follow-up every 10 min

[CHW Dashboard (React)] — polls /api/patients every 30s
[Supabase DB] + [Moorcheh namespace] — shared data
```

---

## Prerequisites

- **Python 3.11+**
- **Node.js** (for frontend)
- **Supabase** account (free tier is sufficient)
- **Moorcheh AI** API key
- **Twilio** account (SMS)
- **Anthropic** API key (Claude)
- **ngrok** (or similar) for a stable public URL for Twilio webhooks

---

## Setup

### 1. Clone and enter the repo

```bash
git clone <repo-url>
cd Aasha
```

### 2. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
```

### 3. Environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase, Moorcheh, Twilio, Anthropic, and app settings (see [Environment Variables](#environment-variables)).

### 4. Database

Create and run migrations (or apply the schema from your Supabase project). Ensure tables such as `patients`, `community_health_workers`, `health_zones`, `health_facilities`, `transport_resources`, `check_in_schedules`, `conversation_state`, `symptom_logs`, `clinical_assessments`, `escalation_events`, and `sms_log` exist as described in the project spec.

### 5. Moorcheh clinical corpus

Before using the clinical agent, create the Moorcheh namespace and ingest clinical protocol documents (WHO/FIGO guidelines, etc.):

```bash
python scripts/ingest_corpus.py
```

Use the pattern shown in CLAUDE.md: create namespace `aasha-clinical-protocols` (type `text`), upload documents (batches of ≤100), then wait a few seconds for indexing before running searches.

### 6. Frontend

```bash
cd frontend
npm install
```

### 7. Ngrok (for Twilio webhooks)

Start ngrok with a static subdomain if available, and set `BASE_URL` in `.env` to the ngrok URL. Configure your Twilio phone number webhook to `BASE_URL/api/webhooks/twilio`.

---

## Running the Application

**Backend (from repo root):**

```bash
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Frontend:**

```bash
cd frontend
npm run dev
```

- API: typically `http://localhost:8000`
- Dashboard: typically `http://localhost:5173` (or the port shown by Vite)

Ensure `BASE_URL` in `.env` points to your public URL (e.g. ngrok) so Twilio can reach your webhooks.

---

## Project Structure

```
Aasha/
├── backend/
│   ├── app/
│   │   ├── api/           # Routes (patients, auth, webhooks, demo, etc.)
│   │   ├── core/          # Config, database
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas
│   │   └── services/      # Messaging, clinical agent, escalation, scheduler, SMS, classifier
│   ├── scripts/
│   │   └── ingest_corpus.py   # Moorcheh namespace + document ingestion
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── api/           # client.ts, patients.ts, auth.ts
│       ├── components/
│       │   ├── dashboard/ # PatientList, SummaryCards, RiskRouteMap, Severity3DGraph
│       │   ├── enrollment/ # EnrollmentForm (4-section patient enrollment)
│       │   ├── login/     # FluidBackground (WebGL fluid), Flower (animated SVG)
│       │   ├── patient/   # PatientDetail, SymptomChart
│       │   └── ui/        # TierBadge, FloralBackdrop
│       ├── constants/     # tiers.ts (TIER_BG, TIER_BADGE, TIER_TEXT, etc.)
│       ├── hooks/         # usePatients, usePatientDetail
│       ├── pages/         # Login (landing + auth), Dashboard, PatientDetailPage
│       ├── types/         # patient.ts, auth.ts (TypeScript interfaces)
│       └── utils/         # gestation.ts, time.ts
├── CLAUDE.md              # Full system specification and build order
└── README.md
```

---

## Key Components

- **Messaging engine** — Twilio webhook handler, conversation state machine, question tree, response parsing (including Claude Haiku for free-text classification), and check-in scheduling (APScheduler).
- **Clinical reasoning agent** — Builds patient context, builds NL query, runs Moorcheh `similarity_search`, builds prompt with protocol chunks, calls Claude for structured JSON risk assessment, persists to `clinical_assessments`, updates patient risk tier and baseline, triggers escalation if tier ≥ 2.
- **Escalation engine** — Tier-based SMS (CHW only for Tier 1–2; patient + CHW + transport + facility for Tier 3), escalation event tracking, and APScheduler follow-up loop with inbound SMS reply handling (e.g. RESPONDING, UNAVAILABLE, RESOLVED, YES/NO).
- **CHW dashboard** — Patient list with tier badges and summary cards, patient detail with assessment, symptom timeline (Recharts), and quick actions; polls `/api/patients` every 30s.
- **Enrollment form** — 4-section form (patient details, pregnancy info, personal risk factors, family history) accessible from the dashboard header. Calls `POST /api/patients/enroll`.
- **Authentication flow** — `/login` route with username/password form; token stored in memory; auto-logout on 401; session validated via `GET /api/auth/me` on page load.

---

## Environment Variables

| Variable            | Description |
|---------------------|-------------|
| `DATABASE_URL`      | PostgreSQL connection string (e.g. `postgresql+asyncpg://...`) |
| `SUPABASE_URL`      | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `MOORCHEH_API_KEY`  | Moorcheh AI API key |
| `TWILIO_ACCOUNT_SID`| Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Twilio phone number (e.g. +14155551234) |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `APP_ENV`           | e.g. `development` |
| `BASE_URL`          | Public base URL for webhooks (e.g. ngrok) |
| `CHW_DEFAULT_ID`    | Default CHW UUID for demo/fallback |
| `DEMO_MODE`         | Set to `true` for demo behavior |

---

## Demo Mode

With `DEMO_MODE=true`, the app can use a default CHW and streamlined behavior for demos. Use the demo seed endpoint (if implemented) to load sample patients and run through enrollment → check-in → assessment → escalation. Ensure the Moorcheh namespace is populated and that Twilio and ngrok are configured so SMS and webhooks work end-to-end.

---

For detailed clinical rules, risk tier definitions, Moorcheh usage, and 48-hour build order, see **CLAUDE.md**.
