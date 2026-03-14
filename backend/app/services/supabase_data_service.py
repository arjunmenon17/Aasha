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


def _coerce_float(value) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _hash_u32(text: str) -> int:
    # Stable FNV-1a hash for deterministic demo jitter.
    h = 2166136261
    for ch in text:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _unit_rand(text: str, salt: int) -> float:
    return ((_hash_u32(f"{text}:{salt}") % 1_000_000) / 999_999.0)


def _infer_location_for_demo(p: dict) -> tuple[float, float, str]:
    """
    Produce realistic Nairobi-area fallback coordinates when DB rows
    don't include location fields yet.
    """
    tier = int(p.get("current_risk_tier", 0) or 0)
    status = str(p.get("status", "pregnant"))
    seed = str(p.get("id", p.get("phone_number", p.get("name", "patient"))))

    # Approximate neighborhoods around Kibera / Nairobi for demo realism.
    centers = [
        ("Kibera - Laini Saba", -1.3148, 36.7840),
        ("Kibera - Gatwekera", -1.3166, 36.7811),
        ("Kibera - Soweto East", -1.3117, 36.7882),
        ("Kibera - Kambi Muru", -1.3094, 36.7785),
        ("Kawangware", -1.2865, 36.7499),
        ("Dagoretti", -1.2920, 36.7362),
    ]

    # Keep higher-risk patients clustered closer to core referral corridor.
    if tier >= 3:
        base = centers[0]
    elif tier == 2:
        base = centers[1 + (_hash_u32(seed) % 2)]
    elif status == "postpartum":
        base = centers[2 + (_hash_u32(seed) % 2)]
    else:
        base = centers[(_hash_u32(seed) % len(centers))]

    label, lat0, lng0 = base
    jitter_lat = (_unit_rand(seed, 11) - 0.5) * 0.010
    jitter_lng = (_unit_rand(seed, 29) - 0.5) * 0.012

    lat = lat0 + jitter_lat
    lng = lng0 + jitter_lng
    return (lat, lng, label)


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
    p.setdefault("location_label", None)
    p.setdefault("location_lat", None)
    p.setdefault("location_lng", None)
    # Guard against legacy/invalid JSON shapes (e.g. [] instead of {}).
    if not isinstance(p.get("baseline"), dict):
        p["baseline"] = {}
    if not isinstance(p.get("risk_factors"), dict):
        p["risk_factors"] = {}

    # Accept a few possible upstream column names if they already exist.
    lat = _coerce_float(
        p.get("location_lat")
        or p.get("latitude")
        or p.get("lat")
    )
    lng = _coerce_float(
        p.get("location_lng")
        or p.get("longitude")
        or p.get("lng")
    )
    label = (
        p.get("location_label")
        or p.get("village")
        or p.get("locality")
    )

    # If no location in DB yet, generate deterministic demo-safe fallback.
    if lat is None or lng is None:
        lat, lng, inferred_label = _infer_location_for_demo(p)
        label = label or inferred_label

    p["location_lat"] = lat
    p["location_lng"] = lng
    p["location_label"] = label or "Community catchment"
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


def _normalize_log(raw: dict) -> dict:
    l = dict(raw)
    # Ensure schema-compatible types for Pydantic validation.
    if not isinstance(l.get("responses"), dict):
        l["responses"] = {}
    if not isinstance(l.get("raw_responses"), dict):
        l["raw_responses"] = {}
    return l


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
        "recent_logs": [_normalize_log(r) for r in logs_rows],
        "active_escalation": (
            _normalize_escalation(active_escalation_raw)
            if active_escalation_raw
            else None
        ),
    }

