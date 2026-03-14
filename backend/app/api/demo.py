"""
Demo seed endpoint — populates database with test data for hackathon demo.
"""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.models import (
    HealthZone, CommunityHealthWorker, HealthFacility,
    TransportResource, Patient, ClinicalAssessment, SymptomLog,
    EscalationEvent,
)

demo_router = APIRouter(prefix="/api/demo", tags=["demo"])


@demo_router.post("/seed")
async def seed_demo_data(db: AsyncSession = Depends(get_db)):
    """Seed the database with realistic demo data."""
    now = datetime.utcnow()

    # --- Health Zone ---
    zone = HealthZone(
        id=uuid.uuid4(),
        name="Kibera Zone A",
        region="Nairobi County",
    )
    db.add(zone)
    await db.flush()

    # --- CHW ---
    chw = CommunityHealthWorker(
        id=uuid.uuid4(),
        name="Grace Wanjiku",
        phone_number="+254700111222",
        zone_id=zone.id,
        skills={"maternal_health": True, "neonatal": True},
    )
    chw2 = CommunityHealthWorker(
        id=uuid.uuid4(),
        name="Mary Akinyi",
        phone_number="+254700111333",
        zone_id=zone.id,
        skills={"maternal_health": True},
    )
    db.add_all([chw, chw2])
    await db.flush()

    # --- Facility ---
    facility = HealthFacility(
        id=uuid.uuid4(),
        name="Kibera District Hospital",
        facility_level="district_hospital",
        phone_number="+254700222333",
        zone_id=zone.id,
        capabilities={"emergency_obstetric": True, "blood_transfusion": True, "c_section": True},
    )
    clinic = HealthFacility(
        id=uuid.uuid4(),
        name="Kibera Health Centre",
        facility_level="health_center",
        phone_number="+254700222444",
        zone_id=zone.id,
        capabilities={"antenatal_care": True, "basic_emergency": True},
    )
    db.add_all([facility, clinic])
    await db.flush()

    # --- Transport ---
    transport = TransportResource(
        id=uuid.uuid4(),
        zone_id=zone.id,
        contact_name="James Ochieng",
        phone_number="+254700333444",
        resource_type="ambulance",
        reliability_score=0.95,
    )
    transport2 = TransportResource(
        id=uuid.uuid4(),
        zone_id=zone.id,
        contact_name="Peter Kimani",
        phone_number="+254700333555",
        resource_type="motorcycle",
        reliability_score=0.85,
    )
    db.add_all([transport, transport2])
    await db.flush()

    # --- Patients ---
    patients_data = [
        {
            "name": "Amina Hassan",
            "phone_number": "+254711001001",
            "gestational_age_at_enrollment": 196,  # 28 weeks
            "status": "pregnant",
            "current_risk_tier": 3,
            "risk_factors": {"primigravida": True, "age_over_35": False},
            "baseline": {
                "headache_history": [1, 1, 1, 2, 3],
                "headache_frequency": 0.4,
                "typical_swelling_location": None,
                "wellbeing_scores": [1, 1, 2, 2, 3],
                "response_rate": 1.0,
                "checkins_completed": 5,
                "baseline_established": True,
            },
        },
        {
            "name": "Fatima Osman",
            "phone_number": "+254711002002",
            "gestational_age_at_enrollment": 224,  # 32 weeks
            "status": "pregnant",
            "current_risk_tier": 2,
            "risk_factors": {"prior_preeclampsia": True, "chronic_hypertension": True},
            "baseline": {
                "headache_history": [1, 2, 2, 1, 2, 2],
                "headache_frequency": 0.67,
                "typical_swelling_location": "2",
                "wellbeing_scores": [1, 2, 2, 1, 2, 2],
                "response_rate": 0.9,
                "checkins_completed": 6,
                "baseline_established": True,
            },
        },
        {
            "name": "Sarah Njeri",
            "phone_number": "+254711003003",
            "gestational_age_at_enrollment": 140,  # 20 weeks
            "status": "pregnant",
            "current_risk_tier": 0,
            "risk_factors": {},
            "baseline": {
                "headache_history": [1, 1, 1],
                "headache_frequency": 0.0,
                "typical_swelling_location": None,
                "wellbeing_scores": [1, 1, 1],
                "response_rate": 1.0,
                "checkins_completed": 3,
                "baseline_established": False,
            },
        },
        {
            "name": "Wanjiku Mwangi",
            "phone_number": "+254711004004",
            "gestational_age_at_enrollment": 252,  # 36 weeks
            "status": "pregnant",
            "current_risk_tier": 1,
            "risk_factors": {"multiple_gestation": True},
            "baseline": {
                "headache_history": [1, 1, 1, 1, 2],
                "headache_frequency": 0.2,
                "typical_swelling_location": "2",
                "wellbeing_scores": [1, 1, 1, 2, 2],
                "response_rate": 0.8,
                "checkins_completed": 5,
                "baseline_established": True,
            },
        },
        {
            "name": "Aisha Mohamed",
            "phone_number": "+254711005005",
            "gestational_age_at_enrollment": 266,  # 38 weeks — delivered
            "status": "postpartum",
            "current_risk_tier": 0,
            "delivery_date": now - timedelta(days=3),
            "risk_factors": {},
            "baseline": {
                "headache_history": [1, 1],
                "headache_frequency": 0.0,
                "typical_swelling_location": None,
                "wellbeing_scores": [1, 1],
                "response_rate": 1.0,
                "checkins_completed": 8,
                "baseline_established": True,
            },
        },
        {
            "name": "Zainab Ali",
            "phone_number": "+254711006006",
            "gestational_age_at_enrollment": 266,
            "status": "postpartum",
            "current_risk_tier": 2,
            "delivery_date": now - timedelta(days=5),
            "risk_factors": {"prior_pph": True},
            "baseline": {
                "headache_history": [1, 1, 1, 1],
                "headache_frequency": 0.0,
                "typical_swelling_location": None,
                "wellbeing_scores": [1, 1, 2, 3],
                "response_rate": 1.0,
                "checkins_completed": 10,
                "baseline_established": True,
            },
        },
    ]

    created_patients = []
    for pd in patients_data:
        enrollment_days_ago = 30
        p = Patient(
            id=uuid.uuid4(),
            name=pd["name"],
            phone_number=pd["phone_number"],
            gestational_age_at_enrollment=pd["gestational_age_at_enrollment"],
            enrollment_date=now - timedelta(days=enrollment_days_ago),
            estimated_due_date=now + timedelta(days=280 - pd["gestational_age_at_enrollment"] - enrollment_days_ago),
            status=pd["status"],
            current_risk_tier=pd["current_risk_tier"],
            check_in_frequency="daily" if pd["current_risk_tier"] >= 2 else "standard",
            baseline=pd["baseline"],
            risk_factors=pd["risk_factors"],
            chw_id=chw.id,
            zone_id=zone.id,
            facility_id=facility.id,
            delivery_date=pd.get("delivery_date"),
        )
        db.add(p)
        created_patients.append(p)

    await db.flush()

    # --- Assessments for high-risk patients ---
    # Amina (Tier 3)
    amina = created_patients[0]
    amina_assessment = ClinicalAssessment(
        id=uuid.uuid4(),
        patient_id=amina.id,
        risk_tier=3,
        primary_concern="Possible severe preeclampsia — 4 concurrent danger signs",
        clinical_reasoning=(
            "Primigravida at 32 weeks presents with severe headache (3/3, >2 days), "
            "visual disturbances (seeing spots), facial and hand edema, and epigastric pain. "
            "This constellation of 4 concurrent preeclampsia danger signs in a primigravida "
            "at high-risk gestational age meets WHO criteria for urgent referral."
        ),
        protocol_references=[
            {
                "chunk_id": "figo_hd_2019_003",
                "source": "FIGO Hypertensive Disorders in Pregnancy Guidelines, 2019",
                "relevant_finding": "Visual disturbances, severe headache, epigastric pain, and sudden facial edema together indicate severe preeclampsia requiring urgent evaluation.",
            }
        ],
        full_assessment={
            "risk_tier": 3,
            "escalate_immediately": True,
            "primary_concern": "Possible severe preeclampsia — 4 concurrent danger signs",
            "symptom_analysis": {
                "headache": {"reported": True, "value": "severity 3/3, >2 days", "baseline_deviation": "critical"},
                "vision_disturbance": {"reported": True, "value": "seeing spots", "baseline_deviation": "critical"},
                "swelling": {"reported": True, "value": "face and hands", "baseline_deviation": "critical"},
                "abdominal_pain": {"reported": True, "value": "upper belly pain", "baseline_deviation": "critical"},
            },
        },
        recommended_actions=[
            "Transport patient to Kibera District Hospital immediately",
            "Administer magnesium sulfate 4g IV if within CHW scope",
            "Keep patient lying on left side during transport",
        ],
        uncertainty_flags=["Blood pressure not available via SMS"],
        moorcheh_query="severe headache persistent visual disturbance photopsia facial hand edema preeclampsia epigastric pain third trimester primigravida",
        moorcheh_chunk_ids=["figo_hd_2019_003", "who_pe_2011_007"],
        created_at=now - timedelta(hours=1),
    )
    db.add(amina_assessment)

    # Fatima (Tier 2)
    fatima = created_patients[1]
    fatima_assessment = ClinicalAssessment(
        id=uuid.uuid4(),
        patient_id=fatima.id,
        risk_tier=2,
        primary_concern="Worsening headache pattern in patient with prior preeclampsia history",
        clinical_reasoning=(
            "Patient at 36 weeks with known prior preeclampsia and chronic hypertension "
            "reports recurring mild headaches with increasing frequency. While no severe "
            "signs yet, the trajectory is concerning given her risk factor profile."
        ),
        protocol_references=[
            {
                "chunk_id": "who_anc_2016_012",
                "source": "WHO ANC Recommendations 2016",
                "relevant_finding": "Women with prior preeclampsia should be monitored closely for recurrence, especially in third trimester.",
            }
        ],
        full_assessment={"risk_tier": 2, "escalate_immediately": False},
        recommended_actions=[
            "CHW to visit and check blood pressure",
            "Increase check-in frequency to daily",
            "Prepare for possible facility referral",
        ],
        uncertainty_flags=["BP measurement needed"],
        moorcheh_query="recurring headache chronic hypertension prior preeclampsia third trimester",
        moorcheh_chunk_ids=["who_anc_2016_012"],
        created_at=now - timedelta(hours=3),
    )
    db.add(fatima_assessment)
    await db.flush()

    # --- Symptom logs ---
    for i, p in enumerate(created_patients):
        for day_offset in range(3):
            log = SymptomLog(
                patient_id=p.id,
                gestational_age_days=p.gestational_age_at_enrollment + 30 - day_offset * 2,
                responses={
                    "wellbeing": str(min(p.current_risk_tier + 1, 3)),
                    "headache_severity": "3" if p.current_risk_tier >= 3 and day_offset == 0 else "1",
                    "fetal_movement": "1",
                },
                raw_responses={},
                created_at=now - timedelta(days=day_offset * 2),
            )
            db.add(log)

    # --- Active escalation for Amina ---
    esc = EscalationEvent(
        patient_id=amina.id,
        assessment_id=amina_assessment.id,
        tier=3,
        status="active",
        primary_concern="Possible severe preeclampsia — 4 concurrent danger signs",
        patient_notified_at=now - timedelta(hours=1),
        chw_notified_at=now - timedelta(hours=1),
        transport_notified_at=now - timedelta(hours=1),
        facility_notified_at=now - timedelta(hours=1),
        chw_acknowledged_at=now - timedelta(minutes=45),
        follow_up_count=2,
        created_at=now - timedelta(hours=1),
    )
    db.add(esc)

    await db.commit()

    return {
        "status": "seeded",
        "zone": zone.name,
        "chws": 2,
        "facilities": 2,
        "transport": 2,
        "patients": len(created_patients),
        "assessments": 2,
        "escalations": 1,
    }


@demo_router.post("/reset")
async def reset_demo_data(db: AsyncSession = Depends(get_db)):
    """Reset all demo data (drop and recreate tables)."""
    from app.core.database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    return {"status": "reset"}
