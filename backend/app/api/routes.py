import logging
import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Header
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.limiter import limiter
from app.models.models import (
    Patient, ClinicalAssessment, SymptomLog, EscalationEvent, SmsLog,
    CommunityHealthWorker, ConversationState
)
from app.schemas.schemas import (
    PatientCreate, PatientResponse, PatientDetail, DashboardResponse,
    TierSummary, AssessmentResponse, SymptomLogResponse, EscalationResponse,
    EnrollResponse, LoginRequest, LoginResponse, AuthUserResponse
)
from app.services.supabase_data_service import (
    is_configured as supabase_configured,
    list_patients as supabase_list_patients,
    get_patient_detail as supabase_get_patient_detail,
    get_dashboard_user_by_username,
    get_dashboard_user_by_id,
)
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _hash_password(password: str, salt: str, iterations: int = 120000) -> str:
    raw = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations)
    return _b64url_encode(raw)


def _verify_password(password: str, stored_hash: str) -> bool:
    # Format: pbkdf2_sha256$<iterations>$<salt>$<hash>
    try:
        algo, iter_s, salt, digest = stored_hash.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        expected = _hash_password(password, salt, int(iter_s))
        return hmac.compare_digest(expected, digest)
    except Exception:
        return False


def _sign_token(payload: dict) -> str:
    payload_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload_b64 = _b64url_encode(payload_json)
    sig = hmac.new(settings.AUTH_SECRET_KEY.encode("utf-8"), payload_b64.encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig)
    return f"{payload_b64}.{sig_b64}"


def _decode_token(token: str) -> dict | None:
    try:
        payload_b64, sig_b64 = token.split(".", 1)
        expected_sig = hmac.new(
            settings.AUTH_SECRET_KEY.encode("utf-8"),
            payload_b64.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(_b64url_encode(expected_sig), sig_b64):
            return None
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        exp = int(payload.get("exp", 0))
        if exp < int(datetime.now(timezone.utc).timestamp()):
            return None
        return payload
    except Exception:
        return None


async def require_auth_user(authorization: str | None = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    payload = _decode_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    try:
        user_id = UUID(payload["sub"])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token subject")
    user = await get_dashboard_user_by_id(user_id)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def _is_admin(user: dict) -> bool:
    return str(user.get("role", "")).lower() == "admin"


def _assert_patient_scope(patient_chw_id, auth_user: dict):
    if _is_admin(auth_user):
        return
    chw_id = auth_user.get("chw_id")
    if not chw_id:
        raise HTTPException(status_code=403, detail="CHW account missing chw_id mapping")
    if str(patient_chw_id) != str(chw_id):
        raise HTTPException(status_code=403, detail="Not allowed to access this patient")


@router.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit("10/minute")
async def login(request: Request, credentials: LoginRequest):
    user = await get_dashboard_user_by_username(credentials.username)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not _verify_password(credentials.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    exp = int((datetime.now(timezone.utc) + timedelta(hours=12)).timestamp())
    token = _sign_token(
        {
            "sub": str(user["id"]),
            "username": user["username"],
            "role": user.get("role", "chw"),
            "exp": exp,
        }
    )
    return LoginResponse(
        access_token=token,
        user=AuthUserResponse(
            id=user["id"],
            username=user["username"],
            display_name=user.get("display_name", user["username"]),
            role=user.get("role", "chw"),
        ),
    )


@router.post("/api/auth/demo-login", response_model=LoginResponse)
@limiter.limit("30/minute")
async def demo_login(request: Request):
    """Credential-free admin login for demos. Finds the first admin account and issues a token."""
    user = await get_dashboard_user_by_username("admin")
    if not user:
        raise HTTPException(status_code=404, detail="No admin user found")
    exp = int((datetime.now(timezone.utc) + timedelta(hours=12)).timestamp())
    token = _sign_token(
        {
            "sub": str(user["id"]),
            "username": user["username"],
            "role": user.get("role", "admin"),
            "exp": exp,
        }
    )
    return LoginResponse(
        access_token=token,
        user=AuthUserResponse(
            id=user["id"],
            username=user["username"],
            display_name=user.get("display_name", user["username"]),
            role=user.get("role", "admin"),
        ),
    )


@router.get("/api/auth/me", response_model=AuthUserResponse)
async def auth_me(user: dict = Depends(require_auth_user)):
    return AuthUserResponse(
        id=user["id"],
        username=user["username"],
        display_name=user.get("display_name", user["username"]),
        role=user.get("role", "chw"),
    )


# --- Patient Endpoints ---

@router.post("/api/patients", response_model=EnrollResponse)
@limiter.limit("20/minute")
async def enroll_patient(
    request: Request,
    patient_data: PatientCreate,
    db: AsyncSession = Depends(get_db),
    _auth_user: dict = Depends(require_auth_user),
):
    """Enroll a new patient and send welcome SMS."""
    # Check for duplicate phone
    existing = await db.execute(
        select(Patient).where(Patient.phone_number == patient_data.phone_number)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Phone number already enrolled")

    # Fall back to the enrolling CHW's own ID, then to the system default CHW
    resolved_chw_id = (
        patient_data.chw_id
        or _auth_user.get("chw_id")
        or (UUID(settings.CHW_DEFAULT_ID) if settings.CHW_DEFAULT_ID else None)
    )

    now = datetime.now(timezone.utc)
    patient = Patient(
        name=patient_data.name,
        phone_number=patient_data.phone_number,
        gestational_age_at_enrollment=patient_data.gestational_age_at_enrollment,
        estimated_due_date=patient_data.estimated_due_date,
        status=patient_data.status or "pregnant",
        risk_factors=patient_data.risk_factors,
        chw_id=resolved_chw_id,
        health_zone_id=patient_data.health_zone_id,
        facility_id=patient_data.facility_id,
        enrollment_date=now,
        current_risk_tier=0,
        check_in_frequency="standard",
        consecutive_misses=0,
        created_at=now,
        updated_at=now,
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
async def list_patients(_auth_user: dict = Depends(require_auth_user)):
    """List all patients sorted by risk tier (desc) for dashboard."""
    if not supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase REST is not configured (need SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY).",
        )

    if _is_admin(_auth_user):
        scoped_chw_id = None
    else:
        scoped_chw_id = _auth_user.get("chw_id")
        if not scoped_chw_id:
            raise HTTPException(status_code=403, detail="CHW account missing chw_id mapping")
    raw_patients = await supabase_list_patients(chw_id=scoped_chw_id)
    patients = [PatientResponse.model_validate(p) for p in raw_patients]

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
        patients=patients
    )


@router.get("/api/patients/{patient_id}", response_model=PatientDetail)
async def get_patient(patient_id: UUID, _auth_user: dict = Depends(require_auth_user)):
    """Get detailed patient info including latest assessment and symptom logs."""
    if not supabase_configured():
        raise HTTPException(
            status_code=503,
            detail="Supabase REST is not configured (need SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY).",
        )

    data = await supabase_get_patient_detail(patient_id)
    if not data:
        raise HTTPException(status_code=404, detail="Patient not found")
    _assert_patient_scope(data["patient"].get("chw_id"), _auth_user)
    detail = PatientDetail.model_validate(data["patient"])
    detail.latest_assessment = (
        AssessmentResponse.model_validate(data["latest_assessment"])
        if data["latest_assessment"]
        else None
    )
    detail.recent_symptom_logs = [
        SymptomLogResponse.model_validate(l) for l in data["recent_logs"]
    ]
    detail.active_escalation = (
        EscalationResponse.model_validate(data["active_escalation"])
        if data["active_escalation"]
        else None
    )
    return detail


@router.post("/api/patients/{patient_id}/resolve")
async def resolve_escalation(
    patient_id: UUID,
    db: AsyncSession = Depends(get_db),
    _auth_user: dict = Depends(require_auth_user),
):
    """Resolve active escalation for a patient (idempotent)."""
    patient_result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    _assert_patient_scope(patient.chw_id, _auth_user)

    result = await db.execute(
        select(EscalationEvent)
        .where(EscalationEvent.patient_id == patient_id, EscalationEvent.status == "active")
        .order_by(EscalationEvent.created_at.desc())
        .limit(1)
    )
    escalation = result.scalar_one_or_none()
    if not escalation:
        # Keep endpoint idempotent so UI can safely click Resolve even if
        # the escalation was already auto-resolved by de-escalation logic.
        patient.current_risk_tier = 0
        patient.check_in_frequency = "standard"
        await db.commit()
        return {"status": "already_resolved", "escalation_id": None}

    escalation.status = "resolved"
    escalation.resolved_at = datetime.utcnow()

    # Reset patient tier
    patient.current_risk_tier = 0
    patient.check_in_frequency = "standard"

    await db.commit()
    return {"status": "resolved", "escalation_id": str(escalation.id)}


# --- Twilio Webhook ---


def _normalize_phone(phone: str) -> str:
    """Normalize to E.164-ish for matching (e.g. +16477740844)."""
    if not phone:
        return phone
    s = phone.strip()
    if s and not s.startswith("+"):
        s = "+" + s.lstrip("0")
    return s


@router.post("/api/webhooks/twilio")
@limiter.limit("120/minute")
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

    # Normalize phone for matching (Twilio sends E.164)
    normalized = _normalize_phone(from_number)

    # Find patient(s) by phone; if multiple, prefer the one with an active conversation
    result = await db.execute(select(Patient).where(Patient.phone_number == from_number))
    patients = list(result.scalars().all())
    if not patients:
        # Try normalized in case DB has different format
        result = await db.execute(select(Patient).where(Patient.phone_number == normalized))
        patients = list(result.scalars().all())

    patient = None
    if len(patients) == 1:
        patient = patients[0]
    elif len(patients) > 1:
        # Prefer patient who has an active conversation (reply belongs to that check-in)
        for p in patients:
            conv_result = await db.execute(
                select(ConversationState).where(
                    ConversationState.patient_id == p.id,
                    ConversationState.is_active == True,
                )
            )
            if conv_result.scalar_one_or_none():
                patient = p
                break
        if patient is None:
            patient = patients[0]

    if patient:
        sms_entry.patient_id = patient.id

    db.add(sms_entry)

    # Check if this is an escalation reply from CHW
    from app.services.escalation_service import handle_escalation_reply
    escalation_handled = await handle_escalation_reply(from_number, body, db)

    if not escalation_handled and patient:
        try:
            from app.services.messaging_service import process_inbound_message
            await process_inbound_message(patient, body, db)
        except Exception as e:
            logger.exception("Error processing inbound message: %s", e)

    await db.commit()

    # Return empty TwiML so Twilio accepts the delivery
    return Response(
        content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml"
    )


# --- Trigger check-in manually ---

@router.post("/api/check-in/{patient_id}")
async def trigger_checkin(
    patient_id: UUID,
    db: AsyncSession = Depends(get_db),
    _auth_user: dict = Depends(require_auth_user),
):
    """Manually trigger a check-in for a patient."""
    result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    _assert_patient_scope(patient.chw_id, _auth_user)

    from app.services.messaging_service import start_checkin
    await start_checkin(patient, db)
    await db.commit()

    return {"status": "check-in started", "patient_id": str(patient_id)}


# --- Assessments ---

@router.get("/api/patients/{patient_id}/assessments", response_model=list[AssessmentResponse])
async def get_assessments(
    patient_id: UUID,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    _auth_user: dict = Depends(require_auth_user),
):
    patient_result = await db.execute(select(Patient).where(Patient.id == patient_id))
    patient = patient_result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    _assert_patient_scope(patient.chw_id, _auth_user)

    result = await db.execute(
        select(ClinicalAssessment)
        .where(ClinicalAssessment.patient_id == patient_id)
        .order_by(desc(ClinicalAssessment.created_at))
        .limit(limit)
    )
    assessments = result.scalars().all()
    return [AssessmentResponse.model_validate(a) for a in assessments]
