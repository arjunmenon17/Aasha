from datetime import datetime
from typing import Any
from uuid import UUID
from pydantic import BaseModel


# --- Patient ---
class PatientCreate(BaseModel):
    name: str
    phone_number: str
    gestational_age_at_enrollment: int  # days
    estimated_due_date: datetime | None = None
    status: str = "pregnant"
    risk_factors: dict | None = None
    chw_id: UUID | None = None
    zone_id: UUID | None = None
    facility_id: UUID | None = None


class PatientResponse(BaseModel):
    id: UUID
    name: str
    phone_number: str
    gestational_age_at_enrollment: int
    enrollment_date: datetime
    estimated_due_date: datetime | None
    status: str
    current_risk_tier: int
    check_in_frequency: str
    baseline: dict | None
    risk_factors: dict | None
    chw_id: UUID | None
    consecutive_misses: int
    delivery_date: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PatientDetail(PatientResponse):
    latest_assessment: "AssessmentResponse | None" = None
    recent_symptom_logs: list["SymptomLogResponse"] = []
    active_escalation: "EscalationResponse | None" = None

    class Config:
        from_attributes = True


# --- Assessment ---
class AssessmentResponse(BaseModel):
    id: UUID
    patient_id: UUID
    risk_tier: int
    primary_concern: str | None
    clinical_reasoning: str | None
    protocol_references: Any | None
    full_assessment: Any | None
    recommended_actions: Any | None
    uncertainty_flags: Any | None
    moorcheh_query: str | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Symptom Log ---
class SymptomLogResponse(BaseModel):
    id: UUID
    patient_id: UUID
    gestational_age_days: int | None
    responses: dict
    created_at: datetime

    class Config:
        from_attributes = True


# --- Escalation ---
class EscalationResponse(BaseModel):
    id: UUID
    patient_id: UUID
    assessment_id: UUID | None
    tier: int
    status: str
    primary_concern: str | None
    chw_acknowledged_at: datetime | None
    transport_confirmed_at: datetime | None
    resolved_at: datetime | None
    follow_up_count: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- CHW ---
class CHWResponse(BaseModel):
    id: UUID
    name: str
    phone_number: str
    is_active: bool

    class Config:
        from_attributes = True


# --- Dashboard summary ---
class TierSummary(BaseModel):
    tier_0: int = 0
    tier_1: int = 0
    tier_2: int = 0
    tier_3: int = 0
    total: int = 0


class DashboardResponse(BaseModel):
    summary: TierSummary
    patients: list[PatientResponse]


# --- Enroll response ---
class EnrollResponse(BaseModel):
    patient: PatientResponse
    message: str
