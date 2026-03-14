-- =============================================================================
-- DROP ALL TABLES (run first to remove old tables; order avoids FK errors)
-- =============================================================================
DROP TABLE IF EXISTS sms_log CASCADE;
DROP TABLE IF EXISTS escalation_events CASCADE;
DROP TABLE IF EXISTS clinical_assessments CASCADE;
DROP TABLE IF EXISTS symptom_logs CASCADE;
DROP TABLE IF EXISTS conversation_state CASCADE;
DROP TABLE IF EXISTS check_in_schedules CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS health_facilities CASCADE;
DROP TABLE IF EXISTS community_health_workers CASCADE;
DROP TABLE IF EXISTS health_zones CASCADE;

-- =============================================================================
-- TABLES (order respects foreign keys)
-- =============================================================================

CREATE TABLE health_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    region VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE community_health_workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    zone_id UUID REFERENCES health_zones(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE health_facilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(300) NOT NULL,
    facility_level VARCHAR(50) NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    zone_id UUID REFERENCES health_zones(id),
    capabilities JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    gestational_age_at_enrollment INTEGER NOT NULL,
    enrollment_date TIMESTAMPTZ DEFAULT now(),
    estimated_due_date TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'pregnant',
    current_risk_tier INTEGER DEFAULT 0,
    check_in_frequency VARCHAR(20) DEFAULT 'standard',
    baseline JSONB,
    risk_factors JSONB,
    chw_id UUID REFERENCES community_health_workers(id),
    health_zone_id UUID REFERENCES health_zones(id),
    facility_id UUID REFERENCES health_facilities(id),
    delivery_date TIMESTAMPTZ,
    consecutive_misses INTEGER DEFAULT 0,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes to support dashboard queries
CREATE INDEX IF NOT EXISTS idx_patients_risk_ga
    ON patients (current_risk_tier DESC, gestational_age_at_enrollment ASC);

CREATE INDEX IF NOT EXISTS idx_patients_zone_risk
    ON patients (health_zone_id, current_risk_tier DESC);

CREATE TABLE check_in_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    missed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversation_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    check_in_id UUID REFERENCES check_in_schedules(id),
    current_node VARCHAR(100) NOT NULL,
    conversation_data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE symptom_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    check_in_id UUID REFERENCES check_in_schedules(id),
    gestational_age_days INTEGER,
    responses JSONB DEFAULT '{}',
    raw_responses JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE clinical_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    symptom_log_id UUID REFERENCES symptom_logs(id),
    risk_tier INTEGER NOT NULL,
    primary_concern TEXT,
    clinical_reasoning TEXT,
    protocol_references JSONB,
    full_assessment JSONB,
    recommended_actions JSONB,
    uncertainty_flags JSONB,
    moorcheh_query TEXT,
    moorcheh_chunk_ids JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE escalation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id),
    assessment_id UUID REFERENCES clinical_assessments(id),
    tier INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    primary_concern TEXT,
    patient_notified_at TIMESTAMPTZ,
    chw_notified_at TIMESTAMPTZ,
    chw_acknowledged_at TIMESTAMPTZ,
    transport_notified_at TIMESTAMPTZ,
    transport_confirmed_at TIMESTAMPTZ,
    facility_notified_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    follow_up_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sms_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
    direction VARCHAR(10) NOT NULL,
    from_number VARCHAR(20),
    to_number VARCHAR(20),
    body TEXT NOT NULL,
    twilio_sid VARCHAR(50),
    sent_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- SEED DATA (fixed UUIDs for reproducibility)
-- =============================================================================

-- Health zone: one small area only — Hay River town + bush/rural nearby (walk/drive minutes)
INSERT INTO health_zones (id, name, region) VALUES
('a1000000-0000-4000-8000-000000000001', 'Hay River & Bush, NT', 'X0E');

-- CHWs (both cover same zone — town and nearby bush/trails)
INSERT INTO community_health_workers (id, name, phone_number, zone_id) VALUES
('b2000000-0000-4000-8000-000000000001', 'Marie Lefebvre', '+18675551234', 'a1000000-0000-4000-8000-000000000001'),
('b2000000-0000-4000-8000-000000000002', 'Sarah Chen', '+18675551235', 'a1000000-0000-4000-8000-000000000001');

-- Facilities: local health centre + territorial referral hospital
INSERT INTO health_facilities (id, name, facility_level, phone_number, zone_id, capabilities) VALUES
('c3000000-0000-4000-8000-000000000001', 'Stanton Territorial Hospital', 'district_hospital', '+18676731234', 'a1000000-0000-4000-8000-000000000001', '{"emergency_obstetric": true, "blood_transfusion": true, "c_section": true}'),
('c3000000-0000-4000-8000-000000000002', 'Hay River Community Health Centre', 'health_center', '+18678751234', 'a1000000-0000-4000-8000-000000000001', '{"antenatal_care": true, "basic_emergency": true}');

-- Patients (one region only: Hay River town + KFN + some in the woods/rural nearby)
INSERT INTO patients (
    id, name, phone_number, gestational_age_at_enrollment, enrollment_date, estimated_due_date,
    status, current_risk_tier, check_in_frequency, baseline, risk_factors,
    chw_id, health_zone_id, facility_id, delivery_date, address, latitude, longitude
) VALUES
(
    '1673852d-11b6-4fcc-a94f-7d1c3046b32a',
    'Emily Morrison',
    '+18675551001',
    196,
    now() - interval '30 days',
    now() + interval '54 days',
    'pregnant',
    3,
    'daily',
    '{"headache_history": [1, 1, 1, 2, 3], "headache_frequency": 0.4, "typical_swelling_location": null, "wellbeing_scores": [1, 1, 2, 2, 3], "response_rate": 1.0, "checkins_completed": 5, "baseline_established": true}',
    '{"primigravida": true, "age_over_35": false}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    NULL,
    '42 Woodland Dr, Hay River, NT X0E 1G2',
    60.8153,
    -115.7992
),
(
    'd4000000-0000-4000-8000-000000000002',
    'Jennifer Walsh',
    '+18675551002',
    224,
    now() - interval '30 days',
    now() + interval '26 days',
    'pregnant',
    2,
    'daily',
    '{"headache_history": [1, 2, 2, 1, 2, 2], "headache_frequency": 0.67, "typical_swelling_location": "2", "wellbeing_scores": [1, 2, 2, 1, 2, 2], "response_rate": 0.9, "checkins_completed": 6, "baseline_established": true}',
    '{"prior_preeclampsia": true, "chronic_hypertension": true}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    NULL,
    'Trail off Poplar Rd (bush), Hay River, NT X0E 1G2',
    60.8125,
    -115.8020
),
(
    'd4000000-0000-4000-8000-000000000003',
    'Amanda Reid',
    '+18675551003',
    140,
    now() - interval '30 days',
    now() + interval '110 days',
    'pregnant',
    0,
    'standard',
    '{"headache_history": [1, 1, 1], "headache_frequency": 0.0, "typical_swelling_location": null, "wellbeing_scores": [1, 1, 1], "response_rate": 1.0, "checkins_completed": 3, "baseline_established": false}',
    '{}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    NULL,
    'Kátł''odeeche First Nation, Hay River, NT X0E 1G4',
    60.8240,
    -115.7720
),
(
    'd4000000-0000-4000-8000-000000000004',
    'Michelle Thompson',
    '+18675551004',
    252,
    now() - interval '30 days',
    now() - interval '2 days',
    'pregnant',
    1,
    'standard',
    '{"headache_history": [1, 1, 1, 1, 2], "headache_frequency": 0.2, "typical_swelling_location": "2", "wellbeing_scores": [1, 1, 1, 2, 2], "response_rate": 0.8, "checkins_completed": 5, "baseline_established": true}',
    '{"multiple_gestation": true}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    NULL,
    'Cabin off Mackenzie Hwy (woods), Hay River, NT X0E 1G2',
    60.8170,
    -115.8060
),
(
    'd4000000-0000-4000-8000-000000000005',
    'Kristen MacLeod',
    '+18675551005',
    266,
    now() - interval '30 days',
    now() - interval '5 days',
    'postpartum',
    0,
    'standard',
    '{"headache_history": [1, 1], "headache_frequency": 0.0, "typical_swelling_location": null, "wellbeing_scores": [1, 1], "response_rate": 1.0, "checkins_completed": 8, "baseline_established": true}',
    '{}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    now() - interval '3 days',
    '15 McDougal Rd, Hay River, NT X0E 1G2',
    60.8180,
    -115.7950
),
(
    'd4000000-0000-4000-8000-000000000006',
    'Nicole Dubois',
    '+18675551006',
    266,
    now() - interval '30 days',
    now() - interval '5 days',
    'postpartum',
    2,
    'daily',
    '{"headache_history": [1, 1, 1, 1], "headache_frequency": 0.0, "typical_swelling_location": null, "wellbeing_scores": [1, 1, 2, 3], "response_rate": 1.0, "checkins_completed": 10, "baseline_established": true}',
    '{"prior_pph": true}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    now() - interval '5 days',
    'Trail 4 (bush), Kátł''odeeche First Nation, Hay River, NT X0E 1G4',
    60.8210,
    -115.7680
),
(
    'd4000000-0000-4000-8000-000000000007',
    'Catherine Nitsiza',
    '+18675551007',
    168,
    now() - interval '45 days',
    now() + interval '102 days',
    'pregnant',
    0,
    'standard',
    '{"headache_history": [1, 1, 1, 1], "headache_frequency": 0.0, "typical_swelling_location": null, "wellbeing_scores": [1, 1, 1, 2], "response_rate": 0.95, "checkins_completed": 4, "baseline_established": true}',
    '{}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    NULL,
    'Off Woodland Dr (rural), Hay River, NT X0E 1G2',
    60.8140,
    -115.8010
),
(
    'd4000000-0000-4000-8000-000000000008',
    'Laura Tatti',
    '+18675551008',
    210,
    now() - interval '20 days',
    now() + interval '60 days',
    'pregnant',
    1,
    'standard',
    '{"headache_history": [1, 1, 2, 1, 1], "headache_frequency": 0.2, "typical_swelling_location": "1", "wellbeing_scores": [1, 2, 2, 1, 1], "response_rate": 0.9, "checkins_completed": 5, "baseline_established": true}',
    '{"age_over_35": true}',
    'b2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    NULL,
    '22 Riverview Dr, Hay River, NT X0E 1G2',
    60.8165,
    -115.7970
),
(
    'd4000000-0000-4000-8000-000000000009',
    'Diane Migwi',
    '+18675551009',
    98,
    now() - interval '60 days',
    now() + interval '182 days',
    'pregnant',
    0,
    'standard',
    '{"headache_history": [1, 1], "headache_frequency": 0.0, "typical_swelling_location": null, "wellbeing_scores": [1, 1], "response_rate": 1.0, "checkins_completed": 2, "baseline_established": false}',
    '{}',
    'b2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    NULL,
    'Bush road off reserve (woods), KFN, Hay River, NT X0E 1G4',
    60.8260,
    -115.7650
),
(
    'd4000000-0000-4000-8000-00000000000a',
    'Angela Kotchea',
    '+18675551010',
    238,
    now() - interval '25 days',
    now() + interval '12 days',
    'pregnant',
    0,
    'standard',
    '{"headache_history": [1, 1, 1, 1, 1], "headache_frequency": 0.0, "typical_swelling_location": null, "wellbeing_scores": [1, 1, 1, 2, 1], "response_rate": 0.85, "checkins_completed": 6, "baseline_established": true}',
    '{"primigravida": true}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    NULL,
    '8 Poplar Rd, Hay River, NT X0E 1G2',
    60.8120,
    -115.8010
),
(
    'd4000000-0000-4000-8000-00000000000b',
    'Melanie Yukon',
    '+18675551011',
    266,
    now() - interval '35 days',
    now() - interval '8 days',
    'postpartum',
    0,
    'standard',
    '{"headache_history": [1, 1, 1], "headache_frequency": 0.0, "typical_swelling_location": null, "wellbeing_scores": [1, 1, 1], "response_rate": 1.0, "checkins_completed": 12, "baseline_established": true}',
    '{}',
    'b2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    now() - interval '6 days',
    '31 Mackenzie Dr, Hay River, NT X0E 1G2',
    60.8110,
    -115.8030
),
(
    'd4000000-0000-4000-8000-00000000000c',
    'Beth Norman',
    '+18675551012',
    182,
    now() - interval '40 days',
    now() + interval '88 days',
    'pregnant',
    2,
    'daily',
    '{"headache_history": [1, 2, 2, 2, 1], "headache_frequency": 0.6, "typical_swelling_location": "2", "wellbeing_scores": [2, 2, 1, 2, 2], "response_rate": 0.9, "checkins_completed": 5, "baseline_established": true}',
    '{"chronic_hypertension": true}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    NULL,
    'RR1 Hay River (back road), NT X0E 1G2',
    60.8195,
    -115.7910
),
(
    'd4000000-0000-4000-8000-00000000000d',
    'Patricia Simba',
    '+18675551013',
    252,
    now() - interval '28 days',
    now() - interval '1 day',
    'pregnant',
    0,
    'standard',
    '{"headache_history": [1, 1, 1, 1], "headache_frequency": 0.0, "typical_swelling_location": null, "wellbeing_scores": [1, 1, 2, 1], "response_rate": 0.95, "checkins_completed": 5, "baseline_established": true}',
    '{}',
    'b2000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000001',
    NULL,
    'Hay River, NT X0E 1G2',
    60.8190,
    -115.7920
),
(
    'd4000000-0000-4000-8000-00000000000e',
    'Rachel Koe',
    '+18675551014',
    126,
    now() - interval '50 days',
    now() + interval '144 days',
    'pregnant',
    0,
    'standard',
    '{"headache_history": [1, 1, 1], "headache_frequency": 0.0, "typical_swelling_location": null, "wellbeing_scores": [1, 1, 1], "response_rate": 1.0, "checkins_completed": 3, "baseline_established": false}',
    '{"primigravida": true}',
    'b2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    NULL,
    'Cabin in woods off reserve, KFN, Hay River, NT X0E 1G4',
    60.8220,
    -115.7700
);

-- Clinical assessments (Amina Tier 3, Fatima Tier 2)
INSERT INTO clinical_assessments (
    id, patient_id, risk_tier, primary_concern, clinical_reasoning, protocol_references,
    full_assessment, recommended_actions, uncertainty_flags, moorcheh_query, moorcheh_chunk_ids, created_at
) VALUES
(
    '3daeedc4-8051-4890-8a1e-123456789001',
    '1673852d-11b6-4fcc-a94f-7d1c3046b32a',
    3,
    'Possible severe preeclampsia — 4 concurrent danger signs',
    'Primigravida at 32 weeks presents with severe headache (3/3, >2 days), visual disturbances (seeing spots), facial and hand edema, and epigastric pain. This constellation of 4 concurrent preeclampsia danger signs in a primigravida at high-risk gestational age meets WHO criteria for urgent referral.',
    '[{"chunk_id": "figo_hd_2019_003", "source": "FIGO Hypertensive Disorders in Pregnancy Guidelines, 2019", "relevant_finding": "Visual disturbances, severe headache, epigastric pain, and sudden facial edema together indicate severe preeclampsia requiring urgent evaluation."}]',
    '{"risk_tier": 3, "escalate_immediately": true, "primary_concern": "Possible severe preeclampsia — 4 concurrent danger signs", "symptom_analysis": {"headache": {"reported": true, "value": "severity 3/3, >2 days", "baseline_deviation": "critical"}, "vision_disturbance": {"reported": true, "value": "seeing spots", "baseline_deviation": "critical"}, "swelling": {"reported": true, "value": "face and hands", "baseline_deviation": "critical"}, "abdominal_pain": {"reported": true, "value": "upper belly pain", "baseline_deviation": "critical"}}}',
    '["Transport patient to Stanton Territorial Hospital immediately", "Administer magnesium sulfate 4g IV if within CHW scope", "Keep patient lying on left side during transport"]',
    '["Blood pressure not available via SMS"]',
    'severe headache persistent visual disturbance photopsia facial hand edema preeclampsia epigastric pain third trimester primigravida',
    '["figo_hd_2019_003", "who_pe_2011_007"]',
    now() - interval '1 hour'
),
(
    '3daeedc4-8051-4890-8a1e-123456789002',
    'd4000000-0000-4000-8000-000000000002',
    2,
    'Worsening headache pattern in patient with prior preeclampsia history',
    'Patient at 36 weeks with known prior preeclampsia and chronic hypertension reports recurring mild headaches with increasing frequency. While no severe signs yet, the trajectory is concerning given her risk factor profile.',
    '[{"chunk_id": "who_anc_2016_012", "source": "WHO ANC Recommendations 2016", "relevant_finding": "Women with prior preeclampsia should be monitored closely for recurrence, especially in third trimester."}]',
    '{"risk_tier": 2, "escalate_immediately": false}',
    '["CHW to visit and check blood pressure", "Increase check-in frequency to daily", "Prepare for possible facility referral"]',
    '["BP measurement needed"]',
    'recurring headache chronic hypertension prior preeclampsia third trimester',
    '["who_anc_2016_012"]',
    now() - interval '3 hours'
);

-- Symptom logs (a few per patient)
INSERT INTO symptom_logs (patient_id, gestational_age_days, responses, created_at)
SELECT p.id, p.gestational_age_at_enrollment + 30 - (d * 2),
       jsonb_build_object(
           'wellbeing', (least(p.current_risk_tier + 1, 3))::text,
           'headache_severity', case when p.current_risk_tier >= 3 and d = 0 then '3' else '1' end,
           'fetal_movement', '1'
       ),
       now() - (d * 2 || ' days')::interval
FROM patients p
CROSS JOIN generate_series(0, 2) AS d;

-- Active escalation for Amina
INSERT INTO escalation_events (
    id, patient_id, assessment_id, tier, status, primary_concern,
    patient_notified_at, chw_notified_at, facility_notified_at, chw_acknowledged_at,
    follow_up_count, created_at
) VALUES (
    'e5000000-0000-4000-8000-000000000001',
    '1673852d-11b6-4fcc-a94f-7d1c3046b32a',
    '3daeedc4-8051-4890-8a1e-123456789001',
    3,
    'active',
    'Possible severe preeclampsia — 4 concurrent danger signs',
    now() - interval '1 hour',
    now() - interval '1 hour',
    now() - interval '1 hour',
    now() - interval '45 minutes',
    2,
    now() - interval '1 hour'
);
