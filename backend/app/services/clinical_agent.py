"""
Component 3: Clinical Reasoning Agent

Pipeline:
1. Assemble patient context (history, baseline, symptom trajectory)
2. Build semantic retrieval query from symptom codes
3. Retrieve via Moorcheh similarity_search → top-5 protocol chunks
4. Construct clinical prompt (context + protocols → Claude)
5. Execute Claude call → parse structured JSON risk assessment
6. Persist assessment, update patient risk tier, fire escalation if tier >= 2
"""
import json
import logging
from datetime import datetime, timezone

import anthropic
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.models.models import (Patient, SymptomLog, ClinicalAssessment,
                               EscalationEvent)

logger = logging.getLogger(__name__)

# --- Symptom code to natural language mapping ---
SYMPTOM_NL_MAP = {
    "headache_severity": {
        "1": "",
        "2": "mild headache",
        "3": "severe headache persistent",
    },
    "headache_duration": {
        "1": "headache less than 1 day",
        "2": "headache 1-2 days duration",
        "3": "headache more than 2 days persistent",
    },
    "vision": {
        "1": "",
        "2": "blurry vision visual disturbance",
        "3":
        "seeing spots flashing lights photopsia visual disturbance severe",
    },
    "swelling": {
        "1": "",
        "2": "ankle swelling edema",
        "3": "facial and hand edema preeclampsia warning",
        "4": "facial hand ankle edema generalized swelling preeclampsia",
    },
    "abdominal_pain": {
        "1": "",
        "2": "mild abdominal discomfort",
        "3": "upper abdominal pain epigastric pain under ribs preeclampsia",
        "4": "severe abdominal pain emergency",
    },
    "fetal_movement": {
        "1": "",
        "2": "reduced fetal movement decreased baby movement",
        "3": "absent fetal movement no baby movement emergency",
    },
    "fever": {
        "1": "",
        "2": "mild fever elevated temperature",
        "3": "high fever severe pyrexia sepsis warning",
    },
    "bleeding": {
        "1": "",
        "2": "light vaginal spotting",
        "3": "heavy vaginal bleeding hemorrhage warning",
    },
    # Postpartum specific
    "discharge": {
        "1": "",
        "2": "abnormal vaginal discharge foul smell infection warning",
        "3": "very foul smelling discharge sepsis warning postpartum",
    },
    "headache_vision": {
        "1": "",
        "2": "postpartum headache",
        "3": "postpartum headache with vision changes preeclampsia eclampsia",
    },
    "baby_feeding": {
        "1": "",
        "2": "baby feeding difficulty",
        "3": "baby not feeding neonatal emergency",
    },
}


async def run_clinical_assessment(
    patient: Patient,
    symptom_log: SymptomLog,
    db: AsyncSession,
):
    """Run the full clinical reasoning pipeline."""
    try:
        # Step 1: Assemble patient context
        context = await assemble_patient_context(patient, symptom_log, db)

        # Step 2: Build semantic retrieval query
        query = build_retrieval_query(symptom_log.responses, patient)

        # Step 3: Retrieve clinical protocols via Moorcheh
        protocol_chunks = await retrieve_clinical_context(query)

        # Step 4 & 5: Build prompt and call Claude
        assessment_data = await call_claude_clinical(context, protocol_chunks,
                                                     query)
        # Step 6: Persist and act on assessment
        await persist_assessment(patient, symptom_log, assessment_data, query,
                                 protocol_chunks, db)
    except Exception as e:
        logger.error(
            f"Clinical assessment failed for patient {patient.id}: {e}")
        # F3.8: Fall back to conservative Tier 2
        await persist_fallback_assessment(patient, symptom_log, str(e), db)


async def assemble_patient_context(
    patient: Patient,
    current_log: SymptomLog,
    db: AsyncSession,
) -> dict:
    """Step 1: Pull patient history, baseline, prior assessments."""
    # Get last 10 symptom logs
    result = await db.execute(
        select(SymptomLog).where(SymptomLog.patient_id == patient.id).order_by(
            desc(SymptomLog.created_at)).limit(10))
    recent_logs = result.scalars().all()

    # Get prior escalations
    esc_result = await db.execute(
        select(EscalationEvent).where(
            EscalationEvent.patient_id == patient.id).order_by(
                desc(EscalationEvent.created_at)).limit(5))
    prior_escalations = esc_result.scalars().all()

    # Calculate current gestational age
    days_since_enrollment = (datetime.now(timezone.utc) -
                             patient.enrollment_date).days
    gestational_age_days = patient.gestational_age_at_enrollment + days_since_enrollment
    gestational_weeks = gestational_age_days // 7

    # Determine postpartum day if applicable
    postpartum_day = None
    if patient.status == "postpartum" and patient.delivery_date:
        postpartum_day = (datetime.now(timezone.utc) -
                          patient.delivery_date).days

    return {
        "patient_summary": {
            "name": patient.name,
            "status": patient.status,
            "gestational_age_weeks": gestational_weeks,
            "gestational_age_days": gestational_age_days,
            "postpartum_day": postpartum_day,
            "current_risk_tier": patient.current_risk_tier,
            "consecutive_missed_checkins": patient.consecutive_misses,
        },
        "risk_factors":
        patient.risk_factors or {},
        "baseline":
        patient.baseline or {},
        "symptom_trajectory": [{
            "date": log.created_at.isoformat(),
            "gestational_age_days": log.gestational_age_days,
            "responses": log.responses,
        } for log in recent_logs],
        "current_checkin": {
            "responses": current_log.responses,
            "gestational_age_days": current_log.gestational_age_days,
        },
        "escalation_history": [{
            "date": esc.created_at.isoformat(),
            "tier": esc.tier,
            "concern": esc.primary_concern,
            "resolved": esc.resolved_at is not None,
        } for esc in prior_escalations],
    }


def build_retrieval_query(responses: dict, patient: Patient) -> str:
    """Step 2: Convert symptom codes to natural language for Moorcheh search."""
    terms = []

    for key, value in responses.items():
        if key in SYMPTOM_NL_MAP and value in SYMPTOM_NL_MAP[key]:
            nl = SYMPTOM_NL_MAP[key][value]
            if nl:
                terms.append(nl)

    # Add pregnancy context
    days_since_enrollment = (datetime.now(timezone.utc) -
                             patient.enrollment_date).days
    ga_days = patient.gestational_age_at_enrollment + days_since_enrollment
    ga_weeks = ga_days // 7

    if patient.status == "postpartum":
        terms.append("postpartum maternal care danger signs")
    elif ga_weeks >= 28:
        terms.append("third trimester pregnancy danger signs")
    elif ga_weeks >= 13:
        terms.append("second trimester pregnancy")
    else:
        terms.append("first trimester pregnancy")

    # Add risk factor context
    risk_factors = patient.risk_factors or {}
    if risk_factors.get("primigravida"):
        terms.append("primigravida first pregnancy")
    if risk_factors.get("prior_preeclampsia"):
        terms.append("prior preeclampsia history")
    if risk_factors.get("chronic_hypertension"):
        terms.append("chronic hypertension")

    query = " ".join(
        terms) if terms else "routine antenatal check normal pregnancy"
    return query


async def retrieve_clinical_context(query: str, top_k: int = 5) -> list[dict]:
    """Step 3: Retrieve clinical protocol chunks from Moorcheh."""
    try:
        from moorcheh_sdk import MoorchehClient, NamespaceNotFound, APIError

        with MoorchehClient(api_key=settings.MOORCHEH_API_KEY) as client:
            results = client.similarity_search.query(
                namespaces=[settings.MOORCHEH_NAMESPACE],
                query=query,
                top_k=top_k,
            )

        # Moorcheh SDK responses may use either "matches" or "results".
        # Support both so valid retrievals are never dropped.
        if isinstance(results, dict):
            matches = results.get("matches") or results.get("results") or []
        else:
            matches = []
            logger.warning(f"Unexpected Moorcheh response type: {type(results).__name__}")

        logger.info(
            "Moorcheh retrieval: namespace=%s query_len=%d chunks=%d",
            settings.MOORCHEH_NAMESPACE,
            len(query or ""),
            len(matches),
        )

        return [{
            "chunk_id": match["id"],
            "source": match.get("metadata", {}).get("source", "Unknown"),
            "section": match.get("metadata", {}).get("section", ""),
            "content": match.get("text", ""),
            "similarity": match.get("score", 0.0),
        } for match in matches]

    except Exception as e:
        logger.warning(f"Moorcheh retrieval failed: {e}")
        return []


async def call_claude_clinical(
    context: dict,
    protocol_chunks: list[dict],
    query: str,
) -> dict:
    """Steps 4 & 5: Build clinical prompt and call Claude for risk assessment."""
    # Format protocol context
    protocol_text = ""
    if protocol_chunks:
        protocol_text = "\n\n".join(
            f"[{chunk['source']} — {chunk['section']}]\n{chunk['content']}"
            for chunk in protocol_chunks)
    else:
        protocol_text = "No specific protocol chunks retrieved. Use general clinical knowledge."

    prompt = f"""You are a clinical decision support system for maternal health surveillance in low-resource settings. Analyze the following patient data and clinical protocols to produce a structured risk assessment.

## Patient Context
```json
{json.dumps(context, indent=2, default=str)}
```

## Relevant Clinical Protocols
{protocol_text}

## Instructions
Analyze the patient's current check-in responses in the context of:
1. Their symptom trajectory over recent check-ins
2. Their established baseline (if any)
3. Their risk factors
4. The relevant clinical protocols above
5. Their gestational age and pregnancy status

Key clinical rules:
- Preeclampsia: persistent headache + visual disturbance + facial/hand edema + epigastric pain = emergency. Most dangerous at 28+ weeks and up to 48h postpartum.
- Normal edema = ankles only. Preeclampsia edema = face + hands.
- PPH: soaking >1 pad/hour (primary, 0-24h) or bright red bleeding persisting after day 3 (secondary, days 4-14).
- Postpartum sepsis: fever + any additional symptom (discharge, pain, malaise) in postpartum woman = Tier 2 minimum.
- Reduced fetal movement from 28 weeks = requires in-person CHW assessment.
- Baseline deviation matters: a first-ever severe headache in someone with no headache history is more concerning than recurring mild headaches in someone who reports them frequently.

Respond with ONLY valid JSON in this exact format:
{{
    "risk_tier": <0|1|2|3>,
    "escalate_immediately": <true|false>,
    "primary_concern": "<one-line summary>",
    "clinical_reasoning": "<detailed clinical reasoning, 2-4 sentences>",
    "protocol_references": [
        {{
            "chunk_id": "<id from protocols above if available>",
            "source": "<document name>",
            "relevant_finding": "<how this protocol applies>"
        }}
    ],
    "symptom_analysis": {{
        "<symptom_key>": {{
            "reported": <true|false>,
            "value": "<description>",
            "baseline_deviation": "<none|mild|significant|critical>",
            "clinical_significance": "<brief note>"
        }}
    }},
    "recommended_actions": ["<action 1>", "<action 2>"],
    "uncertainty_flags": ["<any data gaps or caveats>"]
}}

Risk tier definitions:
- 0 (Normal): No concerning findings
- 1 (Watch): Early single signal, first occurrence
- 2 (Concern): Persistent/worsening pattern or concerning cluster
- 3 (Emergency): Meets criteria for immediate facility referral"""

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    # First attempt
    try:
        response = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=2000,
            messages=[{
                "role": "user",
                "content": prompt
            }],
        )
        result_text = response.content[0].text.strip()

        # Parse JSON — handle markdown code blocks
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
            result_text = result_text.strip()

        return json.loads(result_text)

    except json.JSONDecodeError:
        # F3.7: Retry once on parse failure
        logger.warning("First Claude parse failed, retrying...")
        try:
            response = client.messages.create(
                model="claude-opus-4-5",
                max_tokens=2000,
                messages=[
                    {
                        "role": "user",
                        "content": prompt
                    },
                    {
                        "role": "assistant",
                        "content": '{"risk_tier":'
                    },
                ],
            )
            result_text = '{"risk_tier":' + response.content[0].text.strip()
            return json.loads(result_text)
        except Exception as e:
            logger.error(f"Claude retry also failed: {e}")
            raise

    except Exception as e:
        logger.error(f"Claude clinical call failed: {e}")
        raise


async def persist_assessment(
    patient: Patient,
    symptom_log: SymptomLog,
    assessment_data: dict,
    query: str,
    protocol_chunks: list[dict],
    db: AsyncSession,
):
    """Step 6: Save assessment, update patient, trigger escalation if needed."""
    risk_tier = assessment_data.get("risk_tier", 2)

    assessment = ClinicalAssessment(
        patient_id=patient.id,
        symptom_log_id=symptom_log.id,
        risk_tier=risk_tier,
        primary_concern=assessment_data.get("primary_concern"),
        clinical_reasoning=assessment_data.get("clinical_reasoning"),
        protocol_references=assessment_data.get("protocol_references"),
        full_assessment=assessment_data,
        recommended_actions=assessment_data.get("recommended_actions"),
        uncertainty_flags=assessment_data.get("uncertainty_flags"),
        moorcheh_query=query,
        moorcheh_chunk_ids=[c["chunk_id"] for c in protocol_chunks]
        if protocol_chunks else [],
    )
    db.add(assessment)
    await db.flush()

    # Update patient risk tier
    patient.current_risk_tier = risk_tier
    try:
        flag_modified(patient, "baseline")
    except Exception:
        pass

    # Fire escalation if tier >= 2
    if risk_tier >= 2:
        from app.services.escalation_service import trigger_escalation
        concern = assessment_data.get("primary_concern",
                                      "Clinical concern detected")
        await trigger_escalation(
            patient,
            tier=risk_tier,
            concern=concern,
            assessment_id=assessment.id,
            db=db,
        )

    # Update check-in frequency for elevated risk
    if risk_tier >= 2:
        patient.check_in_frequency = "daily"
    elif risk_tier == 0:
        patient.check_in_frequency = "standard"

    logger.info(f"Assessment complete for {patient.name}: Tier {risk_tier} — "
                f"{assessment_data.get('primary_concern', 'No concerns')}")


async def persist_fallback_assessment(
    patient: Patient,
    symptom_log: SymptomLog,
    error_msg: str,
    db: AsyncSession,
):
    """F3.8: Conservative Tier 2 fallback when clinical agent fails."""
    assessment = ClinicalAssessment(
        patient_id=patient.id,
        symptom_log_id=symptom_log.id,
        risk_tier=2,
        primary_concern=
        "Clinical assessment system error — conservative escalation applied",
        clinical_reasoning=
        f"Automated Tier 2 fallback due to system error: {error_msg}",
        full_assessment={
            "fallback": True,
            "error": error_msg
        },
        recommended_actions=[
            "CHW should contact patient for manual assessment"
        ],
        uncertainty_flags=[
            "Automated assessment failed — manual review required"
        ],
    )
    db.add(assessment)

    patient.current_risk_tier = 2
    patient.check_in_frequency = "daily"

    from app.services.escalation_service import trigger_escalation
    await trigger_escalation(
        patient,
        tier=2,
        concern="System fallback — manual assessment needed",
        assessment_id=assessment.id,
        db=db,
    )

    logger.warning(f"Fallback Tier 2 assessment for patient {patient.name}")
