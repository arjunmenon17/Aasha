import logging
from uuid import UUID

from twilio.rest import Client
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import SmsLog

logger = logging.getLogger(__name__)

_twilio_client: Client | None = None


def get_twilio_client() -> Client:
    global _twilio_client
    if _twilio_client is None:
        _twilio_client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _twilio_client


async def send_sms(
    to_number: str,
    body: str,
    patient_id: UUID | None = None,
    db: AsyncSession | None = None,
) -> str | None:
    """Send an SMS via Twilio and log it."""
    twilio_sid = None

    if settings.DEMO_MODE:
        logger.info(f"[DEMO SMS] To: {to_number} | Body: {body}")
        twilio_sid = "DEMO_SID"
    else:
        try:
            client = get_twilio_client()
            message = client.messages.create(
                body=body,
                from_=settings.TWILIO_PHONE_NUMBER,
                to=to_number,
            )
            twilio_sid = message.sid
            logger.info(f"SMS sent to {to_number}: SID={twilio_sid}")
        except Exception as e:
            logger.error(f"Failed to send SMS to {to_number}: {e}")
            return None

    # Log outbound SMS
    if db:
        sms_entry = SmsLog(
            patient_id=patient_id,
            direction="outbound",
            from_number=settings.TWILIO_PHONE_NUMBER,
            to_number=to_number,
            body=body,
            twilio_sid=twilio_sid,
        )
        db.add(sms_entry)

    return twilio_sid
