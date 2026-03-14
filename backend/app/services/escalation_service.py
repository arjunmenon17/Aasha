"""
Component 4: Escalation Engine

Risk tier-based dispatch with simultaneous SMS, APScheduler follow-up loops,
and inbound SMS reply routing for CHW/transport acknowledgments.
"""
import asyncio
import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models.models import (
    Patient, CommunityHealthWorker, TransportResource,
    HealthFacility, EscalationEvent
)
from app.services.sms_service import send_sms

logger = logging.getLogger(__name__)


async def trigger_escalation(
    patient: Patient,
    tier: int,
    concern: str,
    assessment_id: UUID | None = None,
    db: AsyncSession = None,
):
    """Trigger escalation based on risk tier."""
    # Create escalation event
    escalation = EscalationEvent(
        patient_id=patient.id,
        assessment_id=assessment_id,
        tier=tier,
        status="active",
        primary_concern=concern,
    )
    db.add(escalation)
    await db.flush()

    if tier == 1:
        await tier_1_escalation(patient, escalation, concern, db)
    elif tier == 2:
        await tier_2_escalation(patient, escalation, concern, db)
    elif tier >= 3:
        await tier_3_escalation(patient, escalation, concern, db)

    logger.info(f"Escalation Tier {tier} triggered for {patient.name}: {concern}")


async def tier_1_escalation(
    patient: Patient,
    escalation: EscalationEvent,
    concern: str,
    db: AsyncSession,
):
    """Tier 1: Soft notification to CHW (awareness only)."""
    chw = await get_patient_chw(patient, db)
    if not chw:
        logger.warning(f"No CHW found for patient {patient.name}")
        return

    days_since = (datetime.now(timezone.utc) - patient.enrollment_date).days
    ga_weeks = (patient.gestational_age_at_enrollment + days_since) // 7

    msg = (
        f"[AASHA WATCH] {patient.name} ({ga_weeks}wks)\n"
        f"Concern: {concern}\n"
        f"No action required — awareness only."
    )
    await send_sms(chw.phone_number, msg, patient_id=patient.id, db=db)
    escalation.chw_notified_at = datetime.now(timezone.utc)


async def tier_2_escalation(
    patient: Patient,
    escalation: EscalationEvent,
    concern: str,
    db: AsyncSession,
):
    """Tier 2: CHW alert with patient details + phone. Set daily check-ins."""
    chw = await get_patient_chw(patient, db)
    if not chw:
        logger.warning(f"No CHW found for patient {patient.name}")
        return

    days_since = (datetime.now(timezone.utc) - patient.enrollment_date).days
    ga_weeks = (patient.gestational_age_at_enrollment + days_since) // 7

    msg = (
        f"[AASHA CONCERN] {patient.name} ({ga_weeks}wks)\n"
        f"Concern: {concern}\n"
        f"Phone: {patient.phone_number}\n"
        f"ACTION: Please call this patient today.\n"
        f"Reply RESPONDING to acknowledge."
    )
    await send_sms(chw.phone_number, msg, patient_id=patient.id, db=db)
    escalation.chw_notified_at = datetime.now(timezone.utc)

    # Set daily check-ins
    patient.check_in_frequency = "daily"


async def tier_3_escalation(
    patient: Patient,
    escalation: EscalationEvent,
    concern: str,
    db: AsyncSession,
):
    """Tier 3: Full emergency — simultaneous SMS to patient, CHW, transport, facility."""
    days_since = (datetime.now(timezone.utc) - patient.enrollment_date).days
    ga_weeks = (patient.gestational_age_at_enrollment + days_since) // 7

    # Get contacts
    chw = await get_patient_chw(patient, db)
    transport = await get_transport_resource(patient, db)
    facility = await get_facility(patient, db)

    # Build messages
    patient_msg = (
        f"{patient.name}, our system has detected a health concern that needs immediate attention. "
        f"Your health worker has been notified and transport is being arranged. "
        f"Please stay calm and prepare to go to the health facility. "
        f"Do NOT ignore this message."
    )

    chw_msg = ""
    if chw:
        chw_msg = (
            f"[AASHA EMERGENCY] {patient.name} ({ga_weeks}wks)\n"
            f"CONCERN: {concern}\n"
            f"Phone: {patient.phone_number}\n"
            f"ACTION REQUIRED: Go to patient immediately.\n"
            f"Reply RESPONDING to acknowledge."
        )

    transport_msg = ""
    if transport:
        transport_msg = (
            f"[AASHA TRANSPORT REQUEST]\n"
            f"Patient: {patient.name}\n"
            f"Emergency: {concern}\n"
            f"Reply YES to confirm or NO if unavailable."
        )

    facility_msg = ""
    if facility:
        facility_msg = (
            f"[AASHA INCOMING REFERRAL]\n"
            f"Patient: {patient.name} ({ga_weeks}wks)\n"
            f"Concern: {concern}\n"
            f"ETA: Transport being arranged.\n"
            f"Please prepare for emergency admission."
        )

    # Send all simultaneously via asyncio.gather (F4.2)
    tasks = [send_sms(patient.phone_number, patient_msg, patient_id=patient.id, db=db)]
    escalation.patient_notified_at = datetime.now(timezone.utc)

    if chw and chw_msg:
        tasks.append(send_sms(chw.phone_number, chw_msg, patient_id=patient.id, db=db))
        escalation.chw_notified_at = datetime.now(timezone.utc)
    if transport and transport_msg:
        tasks.append(send_sms(transport.phone_number, transport_msg, patient_id=patient.id, db=db))
        escalation.transport_notified_at = datetime.now(timezone.utc)
    if facility and facility_msg:
        tasks.append(send_sms(facility.phone_number, facility_msg, patient_id=patient.id, db=db))
        escalation.facility_notified_at = datetime.now(timezone.utc)

    await asyncio.gather(*tasks, return_exceptions=True)

    # Schedule follow-up loop (F4.3)
    from app.services.scheduler_service import scheduler
    scheduler.add_job(
        escalation_followup,
        trigger="interval",
        minutes=10,
        id=f"followup_{escalation.id}",
        args=[str(escalation.id)],
        max_instances=1,
        replace_existing=True,
    )

    logger.info(f"Tier 3 emergency escalation fired for {patient.name}")


async def escalation_followup(escalation_id: str):
    """Follow-up loop: every 10 min, check status and re-alert if needed."""
    async with async_session() as db:
        result = await db.execute(
            select(EscalationEvent).where(EscalationEvent.id == escalation_id)
        )
        escalation = result.scalar_one_or_none()
        if not escalation or escalation.status == "resolved":
            # Remove the job
            from app.services.scheduler_service import scheduler
            try:
                scheduler.remove_job(f"followup_{escalation_id}")
            except Exception:
                pass
            return

        escalation.follow_up_count += 1

        # Stop after 12 attempts (2 hours)
        if escalation.follow_up_count >= 12:
            escalation.status = "timeout"
            from app.services.scheduler_service import scheduler
            try:
                scheduler.remove_job(f"followup_{escalation_id}")
            except Exception:
                pass
            await db.commit()
            return

        patient_result = await db.execute(
            select(Patient).where(Patient.id == escalation.patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if not patient:
            await db.commit()
            return

        # CHW not acknowledged after 20 min → try secondary CHW
        if (
            not escalation.chw_acknowledged_at
            and escalation.follow_up_count >= 2
            and escalation.follow_up_count % 2 == 0
        ):
            secondary_chw = await get_secondary_chw(patient, db)
            if secondary_chw:
                msg = (
                    f"[AASHA EMERGENCY - BACKUP] {patient.name}\n"
                    f"Primary CHW unresponsive. {escalation.primary_concern}\n"
                    f"Phone: {patient.phone_number}\n"
                    f"Reply RESPONDING to acknowledge."
                )
                await send_sms(secondary_chw.phone_number, msg, patient_id=patient.id, db=db)

        # Transport not confirmed after 20 min → try next
        if (
            not escalation.transport_confirmed_at
            and escalation.follow_up_count >= 2
            and escalation.follow_up_count % 2 == 0
        ):
            transport = await get_transport_resource(patient, db, exclude_unconfirmed=True)
            if transport:
                msg = (
                    f"[AASHA TRANSPORT REQUEST - URGENT]\n"
                    f"Patient: {patient.name}\n"
                    f"Emergency: {escalation.primary_concern}\n"
                    f"Reply YES to confirm."
                )
                await send_sms(transport.phone_number, msg, patient_id=patient.id, db=db)

        await db.commit()


async def handle_escalation_reply(from_number: str, body: str, db: AsyncSession) -> bool:
    """Route inbound SMS replies from CHWs and transport contacts."""
    body_upper = body.strip().upper()

    # Check if sender is a CHW
    chw_result = await db.execute(
        select(CommunityHealthWorker).where(CommunityHealthWorker.phone_number == from_number)
    )
    chw = chw_result.scalar_one_or_none()

    if chw:
        if body_upper == "RESPONDING":
            # Find active escalation for this CHW's patients
            patients_result = await db.execute(
                select(Patient).where(Patient.chw_id == chw.id)
            )
            for patient in patients_result.scalars().all():
                esc_result = await db.execute(
                    select(EscalationEvent).where(
                        EscalationEvent.patient_id == patient.id,
                        EscalationEvent.status == "active",
                    )
                )
                esc = esc_result.scalar_one_or_none()
                if esc:
                    esc.chw_acknowledged_at = datetime.now(timezone.utc)
                    await send_sms(chw.phone_number, "Thank you. Stay safe.", db=db)
                    return True

        elif body_upper == "UNAVAILABLE":
            # Try secondary CHW — handled by follow-up loop
            return True

        elif body_upper == "RESOLVED":
            # Find the most recent active escalation across all this CHW's patients
            esc_result = await db.execute(
                select(EscalationEvent)
                .join(Patient, EscalationEvent.patient_id == Patient.id)
                .where(
                    Patient.chw_id == chw.id,
                    EscalationEvent.status == "active",
                )
                .order_by(EscalationEvent.created_at.desc())
                .limit(1)
            )
            esc = esc_result.scalar_one_or_none()
            if esc:
                esc.status = "resolved"
                esc.resolved_at = datetime.now(timezone.utc)

                patient_result = await db.execute(
                    select(Patient).where(Patient.id == esc.patient_id)
                )
                patient = patient_result.scalar_one_or_none()
                if patient:
                    patient.current_risk_tier = 0
                    patient.check_in_frequency = "standard"

                # Remove follow-up job
                from app.services.scheduler_service import scheduler
                try:
                    scheduler.remove_job(f"followup_{esc.id}")
                except Exception:
                    pass

                await send_sms(
                    chw.phone_number,
                    f"Escalation for {patient.name if patient else 'patient'} resolved. Thank you.",
                    db=db,
                )
                return True

    # Check if sender is a transport contact
    transport_result = await db.execute(
        select(TransportResource).where(TransportResource.phone_number == from_number)
    )
    transport = transport_result.scalar_one_or_none()

    if transport:
        if body_upper == "YES":
            # Find active escalation in this zone
            esc_result = await db.execute(
                select(EscalationEvent)
                .where(EscalationEvent.status == "active")
                .order_by(EscalationEvent.created_at.desc())
                .limit(1)
            )
            esc = esc_result.scalar_one_or_none()
            if esc:
                esc.transport_confirmed_at = datetime.now(timezone.utc)
                # Notify patient
                patient_result = await db.execute(
                    select(Patient).where(Patient.id == esc.patient_id)
                )
                patient = patient_result.scalar_one_or_none()
                if patient:
                    await send_sms(
                        patient.phone_number,
                        "Transport has been confirmed and is on the way. Please be ready.",
                        patient_id=patient.id,
                        db=db,
                    )
                return True

        elif body_upper == "NO":
            # Will be handled by follow-up loop trying next transport
            return True

    return False


# --- Helper functions to get contacts ---

async def get_patient_chw(patient: Patient, db: AsyncSession) -> CommunityHealthWorker | None:
    if patient.chw_id:
        result = await db.execute(
            select(CommunityHealthWorker).where(CommunityHealthWorker.id == patient.chw_id)
        )
        return result.scalar_one_or_none()

    # Fall back to any active CHW in the zone
    if patient.zone_id:
        result = await db.execute(
            select(CommunityHealthWorker).where(
                CommunityHealthWorker.zone_id == patient.zone_id,
                CommunityHealthWorker.is_active == True,
            ).limit(1)
        )
        return result.scalar_one_or_none()

    # Fall back to any active CHW
    result = await db.execute(
        select(CommunityHealthWorker).where(CommunityHealthWorker.is_active == True).limit(1)
    )
    return result.scalar_one_or_none()


async def get_secondary_chw(patient: Patient, db: AsyncSession) -> CommunityHealthWorker | None:
    """Get a different CHW than the primary one."""
    result = await db.execute(
        select(CommunityHealthWorker).where(
            CommunityHealthWorker.is_active == True,
            CommunityHealthWorker.id != patient.chw_id,
        ).limit(1)
    )
    return result.scalar_one_or_none()


async def get_transport_resource(
    patient: Patient, db: AsyncSession, exclude_unconfirmed: bool = False
) -> TransportResource | None:
    query = select(TransportResource).where(
        TransportResource.is_active == True
    ).order_by(TransportResource.reliability_score.desc())

    if patient.zone_id:
        query = query.where(TransportResource.zone_id == patient.zone_id)

    result = await db.execute(query.limit(1))
    return result.scalar_one_or_none()


async def get_facility(patient: Patient, db: AsyncSession) -> HealthFacility | None:
    if patient.facility_id:
        result = await db.execute(
            select(HealthFacility).where(HealthFacility.id == patient.facility_id)
        )
        return result.scalar_one_or_none()

    # Fall back to highest-level facility in zone
    query = select(HealthFacility)
    if patient.zone_id:
        query = query.where(HealthFacility.zone_id == patient.zone_id)
    query = query.order_by(HealthFacility.facility_level.desc()).limit(1)

    result = await db.execute(query)
    return result.scalar_one_or_none()
