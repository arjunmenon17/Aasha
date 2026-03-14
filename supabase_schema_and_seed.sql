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

-- Health zone (region = area code, rural Ontario N0G)
INSERT INTO health_zones (id, name, region) VALUES
('a1000000-0000-4000-8000-000000000001', 'North Wellington Rural', 'N0G');

-- CHWs
INSERT INTO community_health_workers (id, name, phone_number, zone_id) VALUES
('b2000000-0000-4000-8000-000000000001', 'Marie Lefebvre', '+15195551234', 'a1000000-0000-4000-8000-000000000001'),
('b2000000-0000-4000-8000-000000000002', 'Sarah Chen', '+15195551235', 'a1000000-0000-4000-8000-000000000001');

-- Facilities
INSERT INTO health_facilities (id, name, facility_level, phone_number, zone_id, capabilities) VALUES
('c3000000-0000-4000-8000-000000000001', 'Listowel Memorial Hospital', 'district_hospital', '+15192915555', 'a1000000-0000-4000-8000-000000000001', '{"emergency_obstetric": true, "blood_transfusion": true, "c_section": true}'),
('c3000000-0000-4000-8000-000000000002', 'Palmerston Community Health Centre', 'health_center', '+15195552222', 'a1000000-0000-4000-8000-000000000001', '{"antenatal_care": true, "basic_emergency": true}');

-- Patients (rural Ontario, Canada — N0G area: Listowel, Palmerston, Harriston)
INSERT INTO patients (
    id, name, phone_number, gestational_age_at_enrollment, enrollment_date, estimated_due_date,
    status, current_risk_tier, check_in_frequency, baseline, risk_factors,
    chw_id, health_zone_id, facility_id, delivery_date, address, latitude, longitude
) VALUES
(
    '1673852d-11b6-4fcc-a94f-7d1c3046b32a',
    'Emily Morrison',
    '+15195551001',
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
    '1245 Concession Rd 4, Listowel, ON N4W 2G9',
    43.7320,
    -80.9480
),
(
    'd4000000-0000-4000-8000-000000000002',
    'Jennifer Walsh',
    '+15195551002',
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
    'RR 2, Palmerston, ON N0G 2P0',
    43.8350,
    -80.8510
),
(
    'd4000000-0000-4000-8000-000000000003',
    'Amanda Reid',
    '+15195551003',
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
    '88 Main St E, Harriston, ON N0G 1Z0',
    43.9650,
    -80.5630
),
(
    'd4000000-0000-4000-8000-000000000004',
    'Michelle Thompson',
    '+15195551004',
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
    '2675 Line 86, Listowel, ON N4W 3H2',
    43.7180,
    -80.9620
),
(
    'd4000000-0000-4000-8000-000000000005',
    'Kristen MacLeod',
    '+15195551005',
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
    '412 Wellington Rd 109, Palmerston, ON N0G 2P0',
    43.8280,
    -80.8680
),
(
    'd4000000-0000-4000-8000-000000000006',
    'Nicole Dubois',
    '+15195551006',
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
    '156 Elora St, Harriston, ON N0G 1Z0',
    43.9580,
    -80.5710
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
    '["Transport patient to Listowel Memorial Hospital immediately", "Administer magnesium sulfate 4g IV if within CHW scope", "Keep patient lying on left side during transport"]',
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
