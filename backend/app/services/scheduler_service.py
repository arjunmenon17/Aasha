"""
APScheduler-based check-in scheduling and missed check-in detection.
"""
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.models.models import Patient, CheckInSchedule

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def schedule_patient_checkins(patient: Patient, db: AsyncSession):
    """Schedule check-ins for a patient based on their status and frequency."""
    # For MVP: schedule the next check-in
    now = datetime.utcnow()

    if patient.check_in_frequency == "daily" or patient.status == "postpartum":
        next_checkin = now + timedelta(days=1)
    else:
        # Standard: next MWF at 8am
        days_ahead = {0: 0, 1: 0, 2: 0, 3: 2, 4: 1, 5: 2, 6: 1}  # Mon=0
        weekday = now.weekday()
        # Find next MWF
        if weekday in (0, 2, 4):  # Mon, Wed, Fri
            next_checkin = now + timedelta(days=2)
        elif weekday == 1:  # Tue -> Wed
            next_checkin = now + timedelta(days=1)
        elif weekday == 3:  # Thu -> Fri
            next_checkin = now + timedelta(days=1)
        elif weekday == 5:  # Sat -> Mon
            next_checkin = now + timedelta(days=2)
        else:  # Sun -> Mon
            next_checkin = now + timedelta(days=1)

    next_checkin = next_checkin.replace(hour=8, minute=0, second=0, microsecond=0)

    check_in = CheckInSchedule(
        patient_id=patient.id,
        scheduled_for=next_checkin,
    )
    db.add(check_in)
    await db.flush()

    # Schedule the APScheduler job
    scheduler.add_job(
        fire_checkin,
        trigger=DateTrigger(run_date=next_checkin),
        id=f"checkin_{check_in.id}",
        args=[str(patient.id), str(check_in.id)],
        replace_existing=True,
    )

    # Schedule missed check-in detection (4 hours after)
    scheduler.add_job(
        check_missed,
        trigger=DateTrigger(run_date=next_checkin + timedelta(hours=4)),
        id=f"missed_{check_in.id}",
        args=[str(patient.id), str(check_in.id)],
        replace_existing=True,
    )

    logger.info(f"Scheduled check-in for {patient.name} at {next_checkin}")


async def fire_checkin(patient_id: str, check_in_id: str):
    """Fire a scheduled check-in — sends the first SMS."""
    async with async_session() as db:
        result = await db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        patient = result.scalar_one_or_none()
        if not patient or patient.status == "discharged":
            return

        from app.services.messaging_service import start_checkin
        await start_checkin(patient, db, check_in_id=check_in_id)
        await db.commit()

        # Schedule next check-in
        await schedule_patient_checkins(patient, db)
        await db.commit()


async def check_missed(patient_id: str, check_in_id: str):
    """Check if a check-in was missed (4 hours after sending)."""
    async with async_session() as db:
        result = await db.execute(
            select(CheckInSchedule).where(CheckInSchedule.id == check_in_id)
        )
        check_in = result.scalar_one_or_none()
        if not check_in or check_in.completed_at:
            return

        # Mark as missed
        check_in.missed = True

        # Update patient consecutive misses
        patient_result = await db.execute(
            select(Patient).where(Patient.id == patient_id)
        )
        patient = patient_result.scalar_one_or_none()
        if not patient:
            return

        patient.consecutive_misses += 1
        logger.warning(
            f"Patient {patient.name} missed check-in. "
            f"Consecutive misses: {patient.consecutive_misses}"
        )

        # Trigger alerts based on consecutive misses
        if patient.consecutive_misses >= 4:
            # Tier 2 alert
            from app.services.escalation_service import trigger_escalation
            await trigger_escalation(patient, tier=2, concern="4 consecutive missed check-ins", db=db)
        elif patient.consecutive_misses >= 2:
            # Tier 1 alert
            from app.services.escalation_service import trigger_escalation
            await trigger_escalation(patient, tier=1, concern="2 consecutive missed check-ins", db=db)

        await db.commit()


def start_scheduler():
    """Start the APScheduler."""
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")


def stop_scheduler():
    """Stop the APScheduler."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("APScheduler stopped")
