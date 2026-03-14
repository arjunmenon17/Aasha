export type RiskTier = 0 | 1 | 2 | 3;

export interface ProtocolReference {
  chunk_id?: string;
  source: string;
  relevant_finding?: string;
}

export interface ClinicalAssessment {
  id: string;
  risk_tier: RiskTier;
  primary_concern?: string;
  clinical_reasoning?: string;
  recommended_actions?: string[];
  protocol_references?: ProtocolReference[];
  uncertainty_flags?: string[];
  created_at: string;
}

export interface SymptomLog {
  id: string;
  check_in_id: string;
  gestational_age_days: number;
  responses?: Record<string, unknown>;
  raw_responses?: Record<string, unknown>;
  created_at: string;
}

export interface EscalationEvent {
  id: string;
  patient_id: string;
  assessment_id: string;
  tier: RiskTier;
  primary_concern?: string;
  chw_acknowledged_at?: string | null;
  transport_confirmed_at?: string | null;
  follow_up_count: number;
  created_at: string;
  resolved_at?: string | null;
}

export interface Patient {
  id: string;
  name: string;
  phone_number: string;
  status: 'pregnant' | 'postpartum';
  gestational_age_at_enrollment: number;
  enrollment_date: string;
  check_in_frequency: string;
  current_risk_tier: RiskTier;
  risk_factors?: Record<string, boolean>;
  location_label?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  consecutive_misses?: number;
  updated_at: string;
  /** Patient's health zone (references health_zones.id) */
  health_zone_id?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface PatientDetail extends Patient {
  latest_assessment?: ClinicalAssessment | null;
  recent_symptom_logs?: SymptomLog[];
  active_escalation?: EscalationEvent | null;
}

export interface PatientsSummary {
  total: number;
  tier_0: number;
  tier_1: number;
  tier_2: number;
  tier_3: number;
}

export interface PatientsResponse {
  summary: PatientsSummary;
  patients: Patient[];
}
