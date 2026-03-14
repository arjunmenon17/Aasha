import { TierBadge } from '@/components/ui/TierBadge';
import { SymptomChart, type ChartPoint } from '@/components/patient/SymptomChart';
import { timeAgo } from '@/utils/time';
import { gestWeeks } from '@/utils/gestation';
import { patientsApi } from '@/api';
import type { PatientDetail as PatientDetailType, SymptomLog } from '@/types';

interface PatientDetailProps {
  patientId: string;
  detail: PatientDetailType | null;
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onResolved: () => void;
}

function buildChartData(logs: SymptomLog[]): ChartPoint[] {
  return [...logs]
    .reverse()
    .map((log, i) => ({
      name: `Check-in ${logs.length - i}`,
      wellbeing: parseInt(
        (log.responses?.wellbeing as string) ?? '1',
        10
      ),
      headache: parseInt(
        (log.responses?.headache_severity as string) ?? '0',
        10
      ),
    }));
}

export function PatientDetail({
  patientId,
  detail,
  loading,
  error,
  onBack,
  onResolved,
}: PatientDetailProps) {
  if (loading)
    return (
      <div className="text-center py-8 text-gray-400">Loading...</div>
    );
  if (error)
    return (
      <div className="text-center py-8 text-red-400">Error: {error}</div>
    );
  if (!detail)
    return (
      <div className="text-center py-8 text-gray-400">Patient not found</div>
    );

  const weeks = gestWeeks(
    detail.gestational_age_at_enrollment,
    detail.enrollment_date
  );
  const assessment = detail.latest_assessment;
  const logs = detail.recent_symptom_logs ?? [];
  const escalation = detail.active_escalation;
  const chartData = buildChartData(logs);

  const riskFactorBadges =
    detail.risk_factors &&
    Object.entries(detail.risk_factors)
      .filter(([, v]) => v)
      .map(([k]) => (
        <span
          key={k}
          className="bg-slate-700 text-yellow-500 text-xs px-2 py-1 rounded"
        >
          {k.replace(/_/g, ' ')}
        </span>
      ));

  const actionItems =
    assessment?.recommended_actions && Array.isArray(assessment.recommended_actions)
      ? assessment.recommended_actions
      : [];
  const protocolRefs =
    assessment?.protocol_references &&
    Array.isArray(assessment.protocol_references)
      ? assessment.protocol_references
      : [];
  const uncertaintyItems =
    assessment?.uncertainty_flags && Array.isArray(assessment.uncertainty_flags)
      ? assessment.uncertainty_flags
      : [];

  const handleResolve = () => {
    patientsApi.resolveEscalation(patientId).then(onResolved);
  };

  const handleTriggerCheckIn = () => {
    patientsApi.triggerCheckIn(patientId).then(() => alert('Check-in triggered'));
  };

  return (
    <div>
      <button
        onClick={onBack}
        className="text-blue-400 mb-4 flex items-center gap-1 hover:underline text-sm"
      >
        ← Back to patients
      </button>

      <div className="bg-slate-800 rounded-xl p-6 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl font-bold text-slate-100">{detail.name}</h2>
          <TierBadge tier={detail.current_risk_tier} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Status</div>
            <div className="text-slate-200 capitalize">{detail.status}</div>
          </div>
          <div>
            <div className="text-gray-500">Gestational Age</div>
            <div className="text-slate-200">{weeks} weeks</div>
          </div>
          <div>
            <div className="text-gray-500">Check-in Freq</div>
            <div className="text-slate-200 capitalize">
              {detail.check_in_frequency}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Phone</div>
            <div className="text-slate-200">{detail.phone_number}</div>
          </div>
        </div>
        {riskFactorBadges && riskFactorBadges.length > 0 && (
          <div className="mt-3">
            <div className="text-gray-500 text-sm mb-1">Risk Factors</div>
            <div className="flex gap-2 flex-wrap">{riskFactorBadges}</div>
          </div>
        )}
      </div>

      {escalation && (
        <div className="bg-slate-800 border-l-4 border-red-600 rounded-xl p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-red-500">
              Active Escalation - Tier {escalation.tier}
            </h3>
            <button
              onClick={handleResolve}
              className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:opacity-80"
            >
              Resolve
            </button>
          </div>
          <p className="text-sm text-gray-300">{escalation.primary_concern}</p>
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-gray-400">
            <div>
              CHW Acknowledged:{' '}
              {escalation.chw_acknowledged_at ? 'Yes' : 'Pending'}
            </div>
            <div>
              Transport:{' '}
              {escalation.transport_confirmed_at ? 'Confirmed' : 'Pending'}
            </div>
            <div>Follow-ups: {escalation.follow_up_count}</div>
            <div>Created: {timeAgo(escalation.created_at)}</div>
          </div>
        </div>
      )}

      {assessment && (
        <div className="bg-slate-800 rounded-xl p-4 mb-4">
          <h3 className="font-bold text-lg mb-3 text-slate-100">
            Latest Clinical Assessment
          </h3>
          <div className="mb-3">
            <div className="text-sm text-gray-500">Primary Concern</div>
            <div className="text-slate-200">
              {assessment.primary_concern ?? 'None'}
            </div>
          </div>
          <div className="mb-3">
            <div className="text-sm text-gray-500">Clinical Reasoning</div>
            <div className="text-sm text-gray-300">
              {assessment.clinical_reasoning}
            </div>
          </div>
          {actionItems.length > 0 && (
            <div className="mb-3">
              <div className="text-sm text-gray-500">Recommended Actions</div>
              <ul className="list-disc list-inside text-sm text-gray-300 mt-1">
                {actionItems.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
          {protocolRefs.length > 0 && (
            <div className="mb-3">
              <div className="text-sm text-gray-500">Protocol References</div>
              {protocolRefs.map((ref, i) => (
                <div
                  key={i}
                  className="bg-slate-700 rounded-lg p-2 mt-1 text-sm"
                >
                  <div className="font-medium text-blue-400">{ref.source}</div>
                  <div className="text-gray-400 text-xs">
                    {ref.relevant_finding}
                  </div>
                </div>
              ))}
            </div>
          )}
          {uncertaintyItems.length > 0 && (
            <div>
              <div className="text-sm text-gray-500">Uncertainty Flags</div>
              <div className="flex gap-2 flex-wrap mt-1">
                {uncertaintyItems.map((f, i) => (
                  <span
                    key={i}
                    className="bg-slate-700 text-yellow-500 text-xs px-2 py-1 rounded"
                  >
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="text-xs text-gray-500 mt-3">
            Assessment: {timeAgo(assessment.created_at)}
          </div>
        </div>
      )}

      <SymptomChart chartData={chartData} />

      <div className="flex gap-3 mb-6">
        <button
          onClick={handleTriggerCheckIn}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:opacity-80 text-sm"
        >
          Trigger Check-in
        </button>
      </div>
    </div>
  );
}
