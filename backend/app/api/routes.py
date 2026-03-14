import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.models import (
    Patient, ClinicalAssessment, SymptomLog, EscalationEvent, SmsLog,
    CommunityHealthWorker, ConversationState
)
from app.schemas.schemas import (
    PatientCreate, PatientResponse, PatientDetail, DashboardResponse,
    TierSummary, AssessmentResponse, SymptomLogResponse, EscalationResponse,
    EnrollResponse
)

logger = logging.getLogger(__name__)

router = APIRouter()


# --- Patient Endpoints ---

@router.post("/api/patients", response_model=EnrollResponse)
async def enroll_patient(patient_data: PatientCreate, db: AsyncSession = Depends(get_db)):
    """Enroll a new patient and send welcome SMS."""
    # Check for duplicate phone
    existing = await db.execute(
        select(Patient).where(Patient.phone_number == patient_data.phone_number)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone number already enrolled")

    patient = Patient(
        name=patient_data.name,
        phone_number=patient_data.phone_number,
        gestational_age_at_enrollment=patient_data.gestational_age_at_enrollment,
        estimated_due_date=patient_data.estimated_due_date,
        status=patient_data.status,
        risk_factors=patient_data.risk_factors,
        chw_id=patient_data.chw_id,
        zone_id=patient_data.zone_id,
        facility_id=patient_data.facility_id,
        baseline={
            "headache_history": [],
            "headache_frequency": 0,
            "typical_swelling_location": None,
            "wellbeing_scores": [],
            "response_rate": 1.0,
            "checkins_completed": 0,
            "baseline_established": False,
        },
    )
    db.add(patient)
    await db.flush()

    # Send welcome SMS (imported lazily to avoid circular imports)
    from app.services.sms_service import send_sms
    welcome_msg = (
        f"Welcome to Aasha, {patient.name}! "
        "We will check in with you regularly to help keep you and your baby healthy. "
        "Reply to our messages with the number that matches your answer. "
        "If you ever feel unwell, text us anytime."
    )
    await send_sms(patient.phone_number, welcome_msg, patient_id=patient.id, db=db)

    # Schedule first check-in
    from app.services.scheduler_service import schedule_patient_checkins
    await schedule_patient_checkins(patient, db)

    await db.commit()

    return EnrollResponse(
        patient=PatientResponse.model_validate(patient),
        message="Patient enrolled and welcome SMS sent"
    )


@router.get("/api/patients", response_model=DashboardResponse)
async def list_patients(db: AsyncSession = Depends(get_db)):
    """List all patients sorted by risk tier (desc) for dashboard."""
    result = await db.execute(
        select(Patient).order_by(desc(Patient.current_risk_tier), Patient.gestational_age_at_enrollment)
    )
    patients = result.scalars().all()

    # Build tier summary
    summary = TierSummary(total=len(patients))
    for p in patients:
        if p.current_risk_tier == 0:
            summary.tier_0 += 1
        elif p.current_risk_tier == 1:
            summary.tier_1 += 1
        elif p.current_risk_tier == 2:
            summary.tier_2 += 1
        elif p.current_risk_tier >= 3:
            summary.tier_3 += 1

    return DashboardResponse(
        summary=summary,
        patients=[PatientResponse.model_validate(p) for p in patients]
    )


@router.get("/api/patients/{patient_id}", response_model=PatientDetail)
async def get_patient(patient_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get detailed patient info including latest assessment and symptom logs."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # Latest assessment
    assess_result = await db.execute(
        select(ClinicalAssessment)
        .where(ClinicalAssessment.patient_id == patient_id)
        .order_by(desc(ClinicalAssessment.created_at))
        .limit(1)
    )
    latest_assessment = assess_result.scalar_one_or_none()

    # Recent symptom logs
    logs_result = await db.execute(
        select(SymptomLog)
        .where(SymptomLog.patient_id == patient_id)
        .order_by(desc(SymptomLog.created_at))
        .limit(5)
    )
    recent_logs = logs_result.scalars().all()

    # Active escalation
    esc_result = await db.execute(
        select(EscalationEvent)
        .where(EscalationEvent.patient_id == patient_id, EscalationEvent.status == "active")
        .order_by(desc(EscalationEvent.created_at))
        .limit(1)
    )
    active_escalation = esc_result.scalar_one_or_none()

    detail = PatientDetail.model_validate(patient)
    detail.latest_assessment = AssessmentResponse.model_validate(latest_assessment) if latest_assessment else None
    detail.recent_symptom_logs = [SymptomLogResponse.model_validate(l) for l in recent_logs]
    detail.active_escalation = EscalationResponse.model_validate(active_escalation) if active_escalation else None

    return detail


@router.post("/api/patients/{patient_id}/resolve")
async def resolve_escalation(patient_id: UUID, db: AsyncSession = Depends(get_db)):
    """Resolve active escalation for a patient."""
    result = await db.execute(
        select(EscalationEvent)
        .where(EscalationEvent.patient_id == patient_id, EscalationEvent.status == "active")
    )
    escalation = result.scalar_one_or_none()
    if not escalation:
        raise HTTPException(status_code=404, detail="No active escalation found")

    escalation.status = "resolved"
    escalation.resolved_at = datetime.utcnow()

    # Reset patient tier
    patient_result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = patient_result.scalar_one_or_none()
    if patient:
        patient.current_risk_tier = 0
        patient.check_in_frequency = "standard"

    await db.commit()
    return {"status": "resolved", "escalation_id": str(escalation.id)}


# --- Twilio Webhook ---

@router.post("/api/webhooks/twilio")
async def twilio_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle inbound SMS from Twilio."""
    form_data = await request.form()
    from_number = form_data.get("From", "")
    body = form_data.get("Body", "").strip()
    twilio_sid = form_data.get("MessageSid", "")

    logger.info(f"Inbound SMS from {from_number}: {body}")

    # Log inbound SMS
    sms_entry = SmsLog(
        direction="inbound",
        from_number=from_number,
        to_number=form_data.get("To", ""),
        body=body,
        twilio_sid=twilio_sid,
    )

    # Find patient by phone number
    result = await db.execute(select(Patient).where(Patient.phone_number == from_number))
    patient = result.scalar_one_or_none()

    if patient:
        sms_entry.patient_id = patient.id

    db.add(sms_entry)

    # Check if this is an escalation reply from CHW/transport
    from app.services.escalation_service import handle_escalation_reply
    escalation_handled = await handle_escalation_reply(from_number, body, db)

    if not escalation_handled and patient:
        # Process through conversation state machine
        from app.services.messaging_service import process_inbound_message
        await process_inbound_message(patient, body, db)

    await db.commit()

    # Return empty TwiML to acknowledge
    return Response(
        content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml"
    )


# --- Trigger check-in manually ---

@router.post("/api/check-in/{patient_id}")
async def trigger_checkin(patient_id: UUID, db: AsyncSession = Depends(get_db)):
    """Manually trigger a check-in for a patient."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    from app.services.messaging_service import start_checkin
    await start_checkin(patient, db)
    await db.commit()

    return {"status": "check-in started", "patient_id": str(patient_id)}


# --- Assessments ---

@router.get("/api/patients/{patient_id}/assessments", response_model=list[AssessmentResponse])
async def get_assessments(patient_id: UUID, limit: int = 10, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ClinicalAssessment)
        .where(ClinicalAssessment.patient_id == patient_id)
        .order_by(desc(ClinicalAssessment.created_at))
        .limit(limit)
    )
    assessments = result.scalars().all()
    return [AssessmentResponse.model_validate(a) for a in assessments]
