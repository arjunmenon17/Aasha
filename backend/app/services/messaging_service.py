"""
Component 1: Messaging Engine — Conversation state machine.

Handles inbound SMS responses, walks through question tree,
and triggers clinical reasoning on check-in completion.
"""
import logging
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Patient, ConversationState, CheckInSchedule, SymptomLog
from app.services.sms_service import send_sms
from app.services.question_trees import get_tree
from app.services.classifier_service import classify_free_text

logger = logging.getLogger(__name__)


async def start_checkin(patient: Patient, db: AsyncSession, check_in_id=None):
    """Initiate a new check-in conversation with a patient."""
    # Expire any active conversations
    result = await db.execute(
        select(ConversationState).where(
            ConversationState.patient_id == patient.id,
            ConversationState.is_active == True,
        )
    )
    for conv in result.scalars().all():
        conv.is_active = False

    tree = get_tree(patient.status)
    start_node = tree["start"]

    # Create conversation state
    conversation = ConversationState(
        patient_id=patient.id,
        check_in_id=check_in_id,
        current_node="start",
        conversation_data={},
        is_active=True,
        expires_at=datetime.utcnow() + timedelta(hours=48),
    )
    db.add(conversation)
    await db.flush()

    # Send first question
    message = start_node["message"].format(name=patient.name)
    await send_sms(patient.phone_number, message, patient_id=patient.id, db=db)

    # Update check-in sent_at if we have one
    if check_in_id:
        ci_result = await db.execute(
            select(CheckInSchedule).where(CheckInSchedule.id == check_in_id)
        )
        check_in = ci_result.scalar_one_or_none()
        if check_in:
            check_in.sent_at = datetime.utcnow()

    logger.info(f"Check-in started for patient {patient.name} ({patient.id})")


async def process_inbound_message(patient: Patient, body: str, db: AsyncSession):
    """Process an inbound SMS through the conversation state machine."""
    # Find active conversation
    result = await db.execute(
        select(ConversationState).where(
            ConversationState.patient_id == patient.id,
            ConversationState.is_active == True,
        )
    )
    conversation = result.scalar_one_or_none()

    if not conversation:
        # No active conversation — send a gentle message
        await send_sms(
            patient.phone_number,
            "Thank you for your message. We will check in with you at your next scheduled time. "
            "If you feel unwell, please contact your health worker.",
            patient_id=patient.id,
            db=db,
        )
        return

    tree = get_tree(patient.status)
    current_node_key = conversation.current_node
    current_node = tree.get(current_node_key)

    if not current_node:
        logger.error(f"Invalid conversation node: {current_node_key}")
        conversation.is_active = False
        return

    # Parse response
    response = body.strip()
    valid_options = current_node.get("options", [])

    # Try direct numeric match first
    if response in valid_options:
        parsed_response = response
    else:
        # Try free-text classification via Claude Haiku
        parsed_response = await classify_free_text(response, current_node, valid_options)

        if parsed_response is None:
            # Unclassifiable — ask for clarification, stay at current node
            clarification = (
                "I didn't quite understand your response. "
                "Please reply with just the number:\n"
            )
            for opt in valid_options:
                # Find the option text from the message
                clarification += f"{opt} "
            clarification += "\n" + current_node["message"].format(name=patient.name)
            await send_sms(patient.phone_number, clarification, patient_id=patient.id, db=db)
            return

    # Store response
    data = conversation.conversation_data or {}
    data[current_node["key"]] = parsed_response
    # Store raw response too
    raw_key = f"raw_{current_node['key']}"
    data[raw_key] = body
    conversation.conversation_data = data

    # Determine next node
    next_node_key = current_node["next"](parsed_response)

    if next_node_key is None:
        # Conversation complete
        await complete_checkin(patient, conversation, db)
    else:
        # Move to next question
        conversation.current_node = next_node_key
        next_node = tree.get(next_node_key)
        if next_node:
            message = next_node["message"].format(name=patient.name)
            await send_sms(patient.phone_number, message, patient_id=patient.id, db=db)
        else:
            logger.error(f"Next node {next_node_key} not found in tree")
            await complete_checkin(patient, conversation, db)

    # Mark conversation data as modified for SQLAlchemy JSON tracking
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(conversation, "conversation_data")


async def complete_checkin(patient: Patient, conversation: ConversationState, db: AsyncSession):
    """Complete a check-in: save symptom log, update baseline, trigger clinical agent."""
    conversation.is_active = False

    # Calculate gestational age
    days_since_enrollment = (datetime.utcnow() - patient.enrollment_date).days
    gestational_age_days = patient.gestational_age_at_enrollment + days_since_enrollment

    # Create symptom log
    data = conversation.conversation_data or {}
    responses = {k: v for k, v in data.items() if not k.startswith("raw_")}
    raw_responses = {k: v for k, v in data.items() if k.startswith("raw_")}

    symptom_log = SymptomLog(
        patient_id=patient.id,
        check_in_id=conversation.check_in_id,
        gestational_age_days=gestational_age_days,
        responses=responses,
        raw_responses=raw_responses,
    )
    db.add(symptom_log)
    await db.flush()

    # Update check-in as completed
    if conversation.check_in_id:
        ci_result = await db.execute(
            select(CheckInSchedule).where(CheckInSchedule.id == conversation.check_in_id)
        )
        check_in = ci_result.scalar_one_or_none()
        if check_in:
            check_in.completed_at = datetime.utcnow()
            check_in.missed = False

    # Reset consecutive misses
    patient.consecutive_misses = 0

    # Update baseline
    await update_patient_baseline(patient, responses, db)

    # Send thank you
    await send_sms(
        patient.phone_number,
        "Thank you for completing your check-in! Your health worker has been updated. "
        "Take care of yourself and your baby.",
        patient_id=patient.id,
        db=db,
    )

    # Trigger clinical reasoning agent
    from app.services.clinical_agent import run_clinical_assessment
    await run_clinical_assessment(patient, symptom_log, db)

    logger.info(f"Check-in completed for patient {patient.name} ({patient.id})")


async def update_patient_baseline(patient: Patient, responses: dict, db: AsyncSession):
    """Update patient baseline after each check-in."""
    baseline = patient.baseline or {
        "headache_history": [],
        "headache_frequency": 0,
        "typical_swelling_location": None,
        "wellbeing_scores": [],
        "response_rate": 1.0,
        "checkins_completed": 0,
        "baseline_established": False,
    }

    # Update headache history (rolling last 10)
    headache_val = responses.get("headache_severity", "1")
    baseline["headache_history"] = (baseline.get("headache_history", []) + [int(headache_val)])[-10:]
    baseline["headache_frequency"] = sum(1 for h in baseline["headache_history"] if h > 1) / max(len(baseline["headache_history"]), 1)

    # Update wellbeing scores
    wellbeing_val = responses.get("wellbeing", "1")
    baseline["wellbeing_scores"] = (baseline.get("wellbeing_scores", []) + [int(wellbeing_val)])[-10:]

    # Update swelling pattern
    swelling_val = responses.get("swelling")
    if swelling_val and swelling_val != "1":
        baseline["typical_swelling_location"] = swelling_val

    # Increment completed count
    baseline["checkins_completed"] = baseline.get("checkins_completed", 0) + 1

    # Mark baseline as established after 4 check-ins
    if baseline["checkins_completed"] >= 4:
        baseline["baseline_established"] = True

    patient.baseline = baseline

    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(patient, "baseline")
