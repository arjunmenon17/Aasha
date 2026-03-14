from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

import httpx

from app.core.config import settings


def _supabase_key() -> str:
    return settings.SUPABASE_PUBLISHABLE_KEY or settings.SUPABASE_ANON_KEY


def is_configured() -> bool:
    return bool(settings.SUPABASE_URL and _supabase_key())


def _headers() -> dict[str, str]:
    key = _supabase_key()
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }


def _base_url() -> str:
    return settings.SUPABASE_URL.rstrip("/") + "/rest/v1"


async def _get(path: str, params: dict[str, str]) -> list[dict]:
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.get(
            f"{_base_url()}/{path}",
            headers=_headers(),
            params=params,
        )
        response.raise_for_status()
        return response.json()


async def _get_optional(path: str, params: dict[str, str]) -> list[dict]:
    """Best-effort GET for optional tables/columns.
    Returns [] on 4xx so one missing column does not break whole detail endpoint.
    """
    try:
        return await _get(path, params)
    except httpx.HTTPStatusError as exc:
        if 400 <= exc.response.status_code < 500:
            return []
        raise


def _normalize_patient(raw: dict) -> dict:
    p = dict(raw)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Required by PatientResponse in this codebase; some Supabase tables
    # may not include all these columns, so provide conservative defaults.
    p.setdefault("enrollment_date", p.get("created_at") or now_iso)
    p.setdefault("created_at", p.get("enrollment_date") or now_iso)
    p.setdefault("updated_at", now_iso)
    p.setdefault("estimated_due_date", None)
    p.setdefault("delivery_date", None)
    p.setdefault("chw_id", None)
    p.setdefault("consecutive_misses", 0)
    p.setdefault("check_in_frequency", "standard")
    p.setdefault("baseline", {})
    p.setdefault("risk_factors", {})
    return p


def _normalize_escalation(raw: dict) -> dict:
    e = dict(raw)
    now_iso = datetime.now(timezone.utc).isoformat()
    e.setdefault("assessment_id", None)
    e.setdefault("status", "active")
    e.setdefault("primary_concern", None)
    e.setdefault("chw_acknowledged_at", None)
    e.setdefault("transport_confirmed_at", None)
    e.setdefault("resolved_at", None)
    e.setdefault("follow_up_count", 0)
    e.setdefault("created_at", now_iso)
    return e


def _normalize_assessment(raw: dict, patient_id: UUID, fallback_risk_tier: int) -> dict:
    a = dict(raw)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Some Supabase rows are sparse; provide schema-compatible defaults.
    a.setdefault("patient_id", str(patient_id))
    a.setdefault("risk_tier", fallback_risk_tier)
    a.setdefault("primary_concern", None)
    a.setdefault("clinical_reasoning", None)
    a.setdefault("protocol_references", [])
    a.setdefault("full_assessment", None)
    a.setdefault("recommended_actions", [])
    a.setdefault("uncertainty_flags", [])
    a.setdefault("moorcheh_query", None)
    a.setdefault("created_at", now_iso)
    return a


async def list_patients() -> list[dict]:
    rows = await _get(
        "patients",
        {
            "select": "*",
            "order": "current_risk_tier.desc,gestational_age_at_enrollment.asc",
        },
    )
    return [_normalize_patient(r) for r in rows]


async def get_patient_detail(patient_id: UUID) -> dict | None:
    patient_rows = await _get(
        "patients",
        {
            "select": "*",
            "id": f"eq.{patient_id}",
            "limit": "1",
        },
    )
    if not patient_rows:
        return None
    patient = _normalize_patient(patient_rows[0])

    assess_rows = await _get(
        "clinical_assessments",
        {
            "select": "*",
            "patient_id": f"eq.{patient_id}",
            "order": "created_at.desc",
            "limit": "1",
        },
    )
    logs_rows = await _get(
        "symptom_logs",
        {
            "select": "*",
            "patient_id": f"eq.{patient_id}",
            "order": "created_at.desc",
            "limit": "5",
        },
    )
    # Query without status filter to avoid schema-specific 400s.
    # If `status` exists, pick the most recent active row in-memory.
    esc_rows = await _get_optional(
        "escalation_events",
        {
            "select": "*",
            "patient_id": f"eq.{patient_id}",
            "order": "created_at.desc",
            "limit": "10",
        },
    )
    active_escalation_raw = next(
        (
            row
            for row in esc_rows
            if str(row.get("status", "")).lower() == "active"
        ),
        esc_rows[0] if esc_rows else None,
    )

    latest_assessment = (
        _normalize_assessment(
            assess_rows[0],
            patient_id=patient_id,
            fallback_risk_tier=patient.get("current_risk_tier", 0),
        )
        if assess_rows
        else None
    )

    return {
        "patient": patient,
        "latest_assessment": latest_assessment,
        "recent_logs": logs_rows,
        "active_escalation": (
            _normalize_escalation(active_escalation_raw)
            if active_escalation_raw
            else None
        ),
    }

