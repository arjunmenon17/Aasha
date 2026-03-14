import type {
  PatientsResponse,
  PatientDetail,
  RiskTier,
} from '@/types';

const mkPatient = (
  id: string,
  name: string,
  tier: RiskTier,
  status: 'pregnant' | 'postpartum',
): PatientDetail => {
  const now = new Date().toISOString();
  return {
    id,
    name,
    phone_number: '+1555000' + id.slice(-3),
    status,
    gestational_age_at_enrollment: 28 * 7,
    enrollment_date: now,
    check_in_frequency: 'routine',
    current_risk_tier: tier,
    risk_factors: { primigravida: true },
    consecutive_misses: tier >= 2 ? 2 : 0,
    updated_at: now,
    latest_assessment: {
      id: `${id}-assess`,
      risk_tier: tier,
      primary_concern:
        tier === 3
          ? 'Severe headache + visual changes'
          : tier === 2
          ? 'Persistent swelling and reduced movement'
          : 'Routine follow-up',
      clinical_reasoning:
        'Mock assessment for UI only. Replace with real data when backend is connected.',
      recommended_actions: [
        'Review patient in person',
        'Confirm blood pressure if available',
      ],
      protocol_references: [],
      uncertainty_flags: [],
      created_at: now,
    },
    recent_symptom_logs: [],
    active_escalation: null,
  };
};

export const MOCK_PATIENTS: PatientDetail[] = [
  mkPatient('p1', 'Amina K.', 3, 'pregnant'),
  mkPatient('p2', 'Lila M.', 2, 'pregnant'),
  mkPatient('p3', 'Sara T.', 2, 'postpartum'),
  mkPatient('p4', 'Nala R.', 1, 'pregnant'),
  mkPatient('p5', 'Grace C.', 0, 'pregnant'),
];

export const MOCK_PATIENTS_RESPONSE: PatientsResponse = {
  summary: {
    total: MOCK_PATIENTS.length,
    tier_3: MOCK_PATIENTS.filter((p) => p.current_risk_tier === 3).length,
    tier_2: MOCK_PATIENTS.filter((p) => p.current_risk_tier === 2).length,
    tier_1: MOCK_PATIENTS.filter((p) => p.current_risk_tier === 1).length,
    tier_0: MOCK_PATIENTS.filter((p) => p.current_risk_tier === 0).length,
  },
  patients: MOCK_PATIENTS.map(
    ({ latest_assessment, recent_symptom_logs, active_escalation, ...p }) => p,
  ),
};

export const MOCK_PATIENT_DETAIL_BY_ID: Record<string, PatientDetail> =
  Object.fromEntries(MOCK_PATIENTS.map((p) => [p.id, p]));

