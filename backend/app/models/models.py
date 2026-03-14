import uuid
from datetime import datetime

from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime, ForeignKey, JSON, TypeDecorator, CHAR
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UUIDType(TypeDecorator):
    """Platform-independent UUID type. Uses CHAR(36) for SQLite, native UUID for PostgreSQL."""
    impl = CHAR
    cache_ok = True

    def __init__(self):
        super().__init__(length=36)

    def process_bind_param(self, value, dialect):
        if value is not None:
            return str(value)
        return value

    def process_result_value(self, value, dialect):
        if value is not None:
            return uuid.UUID(value)
        return value


def gen_uuid():
    return uuid.uuid4()


class HealthZone(Base):
    __tablename__ = "health_zones"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    region: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    chws: Mapped[list["CommunityHealthWorker"]] = relationship(back_populates="zone")
    facilities: Mapped[list["HealthFacility"]] = relationship(back_populates="zone")
    transport_resources: Mapped[list["TransportResource"]] = relationship(back_populates="zone")


class CommunityHealthWorker(Base):
    __tablename__ = "community_health_workers"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), ForeignKey("health_zones.id"), nullable=True)
    skills: Mapped[dict | None] = mapped_column(JSON, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    zone: Mapped[HealthZone | None] = relationship(back_populates="chws")
    patients: Mapped[list["Patient"]] = relationship(back_populates="chw")


class HealthFacility(Base):
    __tablename__ = "health_facilities"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    facility_level: Mapped[str] = mapped_column(String(50), nullable=False)  # clinic, health_center, district_hospital
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), ForeignKey("health_zones.id"), nullable=True)
    capabilities: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    zone: Mapped[HealthZone | None] = relationship(back_populates="facilities")


class TransportResource(Base):
    __tablename__ = "transport_resources"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    zone_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), ForeignKey("health_zones.id"), nullable=True)
    contact_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)  # ambulance, motorcycle, vehicle
    reliability_score: Mapped[float] = mapped_column(Float, default=1.0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    zone: Mapped[HealthZone | None] = relationship(back_populates="transport_resources")


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    gestational_age_at_enrollment: Mapped[int] = mapped_column(Integer, nullable=False)  # days
    enrollment_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    estimated_due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pregnant")  # pregnant, postpartum, discharged
    current_risk_tier: Mapped[int] = mapped_column(Integer, default=0)
    check_in_frequency: Mapped[str] = mapped_column(String(20), default="standard")  # standard, daily, elevated
    baseline: Mapped[dict | None] = mapped_column(JSON, default=None)
    risk_factors: Mapped[dict | None] = mapped_column(JSON, default=None)
    chw_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), ForeignKey("community_health_workers.id"), nullable=True)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), ForeignKey("health_zones.id"), nullable=True)
    facility_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), ForeignKey("health_facilities.id"), nullable=True)
    delivery_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    consecutive_misses: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    chw: Mapped[CommunityHealthWorker | None] = relationship(back_populates="patients")
    check_ins: Mapped[list["CheckInSchedule"]] = relationship(back_populates="patient")
    symptom_logs: Mapped[list["SymptomLog"]] = relationship(back_populates="patient")
    assessments: Mapped[list["ClinicalAssessment"]] = relationship(back_populates="patient")
    escalation_events: Mapped[list["EscalationEvent"]] = relationship(back_populates="patient")
    sms_logs: Mapped[list["SmsLog"]] = relationship(back_populates="patient")
    conversations: Mapped[list["ConversationState"]] = relationship(back_populates="patient")


class CheckInSchedule(Base):
    __tablename__ = "check_in_schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    patient_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), ForeignKey("patients.id"), nullable=False)
    scheduled_for: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    missed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patient: Mapped[Patient] = relationship(back_populates="check_ins")


class ConversationState(Base):
    __tablename__ = "conversation_state"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    patient_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), ForeignKey("patients.id"), nullable=False)
    check_in_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), ForeignKey("check_in_schedules.id"), nullable=True)
    current_node: Mapped[str] = mapped_column(String(100), nullable=False)
    conversation_data: Mapped[dict] = mapped_column(JSON, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient: Mapped[Patient] = relationship(back_populates="conversations")


class SymptomLog(Base):
    __tablename__ = "symptom_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    patient_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), ForeignKey("patients.id"), nullable=False)
    check_in_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), ForeignKey("check_in_schedules.id"), nullable=True)
    gestational_age_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    responses: Mapped[dict] = mapped_column(JSON, default=dict)
    raw_responses: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patient: Mapped[Patient] = relationship(back_populates="symptom_logs")


class ClinicalAssessment(Base):
    __tablename__ = "clinical_assessments"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    patient_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), ForeignKey("patients.id"), nullable=False)
    symptom_log_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), ForeignKey("symptom_logs.id"), nullable=True)
    risk_tier: Mapped[int] = mapped_column(Integer, nullable=False)
    primary_concern: Mapped[str | None] = mapped_column(Text, nullable=True)
    clinical_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    protocol_references: Mapped[dict | None] = mapped_column(JSON, default=None)
    full_assessment: Mapped[dict | None] = mapped_column(JSON, default=None)
    recommended_actions: Mapped[dict | None] = mapped_column(JSON, default=None)
    uncertainty_flags: Mapped[dict | None] = mapped_column(JSON, default=None)
    moorcheh_query: Mapped[str | None] = mapped_column(Text, nullable=True)
    moorcheh_chunk_ids: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patient: Mapped[Patient] = relationship(back_populates="assessments")
    escalation_events: Mapped[list["EscalationEvent"]] = relationship(back_populates="assessment")


class EscalationEvent(Base):
    __tablename__ = "escalation_events"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    patient_id: Mapped[uuid.UUID] = mapped_column(UUIDType(), ForeignKey("patients.id"), nullable=False)
    assessment_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), ForeignKey("clinical_assessments.id"), nullable=True)
    tier: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, acknowledged, resolved
    primary_concern: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Notification timestamps
    patient_notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    chw_notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    chw_acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    transport_notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    transport_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    facility_notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    follow_up_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient: Mapped[Patient] = relationship(back_populates="escalation_events")
    assessment: Mapped[ClinicalAssessment | None] = relationship(back_populates="escalation_events")


class SmsLog(Base):
    __tablename__ = "sms_log"

    id: Mapped[uuid.UUID] = mapped_column(UUIDType(), primary_key=True, default=gen_uuid)
    patient_id: Mapped[uuid.UUID | None] = mapped_column(UUIDType(), ForeignKey("patients.id"), nullable=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # inbound, outbound
    from_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    to_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    twilio_sid: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patient: Mapped[Patient | None] = relationship(back_populates="sms_logs")
