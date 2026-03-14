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
      <div className="text-center py-8 text-slate-400 text-sm">Loading…</div>
    );
  if (error)
    return (
      <div className="text-center py-8 text-red-500 text-sm">
        Error: {error}
      </div>
    );
  if (!detail)
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        Patient not found
      </div>
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
          className="bg-amber-50 text-amber-800 text-xs px-2.5 py-1 rounded-full border border-amber-200"
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
    <div className="space-y-4 max-w-6xl">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        ← Back to patients
      </button>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* Left: text content */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
                {detail.name}
              </h2>
              <TierBadge tier={detail.current_risk_tier} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 text-sm">
              <div>
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">
                  Status
                </div>
                <div className="text-slate-900 capitalize font-medium">
                  {detail.status}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">
                  Gestational age
                </div>
                <div className="text-slate-900 font-medium">{weeks} weeks</div>
              </div>
              <div>
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">
                  Check-in freq
                </div>
                <div className="text-slate-900 capitalize font-medium">
                  {detail.check_in_frequency}
                </div>
              </div>
              <div>
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">
                  Phone
                </div>
                <div className="text-slate-900 font-medium">
                  {detail.phone_number}
                </div>
              </div>
            </div>
            {riskFactorBadges && riskFactorBadges.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-2">
                  Risk factors
                </div>
                <div className="flex gap-2 flex-wrap">
                  {riskFactorBadges}
                </div>
              </div>
            )}
          </div>

          {escalation && (
            <div className="bg-white border border-red-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-base text-red-600">
                  Active escalation · Tier {escalation.tier}
                </h3>
                <button
                  onClick={handleResolve}
                  className="px-3 py-1.5 rounded-full border border-emerald-500 text-emerald-600 text-sm hover:bg-emerald-50"
                >
                  Resolve
                </button>
              </div>
              <p className="text-base text-slate-800 leading-relaxed">
                {escalation.primary_concern}
              </p>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs text-slate-500">
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
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <h3 className="font-semibold text-base text-slate-900 mb-4">
                Latest clinical assessment
              </h3>
              <div className="mb-4">
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">
                  Primary concern
                </div>
                <div className="text-base text-slate-900 leading-relaxed">
                  {assessment.primary_concern ?? 'None'}
                </div>
              </div>
              <div className="mb-4">
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">
                  Clinical reasoning
                </div>
                <div className="text-base text-slate-800 leading-relaxed">
                  {assessment.clinical_reasoning}
                </div>
              </div>
              {actionItems.length > 0 && (
                <div className="mb-4">
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">
                    Recommended actions
                  </div>
                  <ul className="list-disc list-inside text-base text-slate-800 leading-relaxed space-y-1">
                    {actionItems.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              {protocolRefs.length > 0 && (
                <div className="mb-4">
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">
                    Protocol references
                  </div>
                  {protocolRefs.map((ref, i) => (
                    <div
                      key={i}
                      className="bg-slate-50 rounded-lg p-3 mt-2 text-sm border border-slate-100"
                    >
                      <div className="font-medium text-pregnancy-dark text-base">
                        {ref.source}
                      </div>
                      <div className="text-slate-600 text-sm mt-0.5 leading-relaxed">
                        {ref.relevant_finding}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {uncertaintyItems.length > 0 && (
                <div>
                  <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-1">
                    Uncertainty flags
                  </div>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {uncertaintyItems.map((f, i) => (
                      <span
                        key={i}
                        className="bg-amber-50 text-amber-800 text-sm px-2.5 py-1 rounded-full border border-amber-200"
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="text-sm text-slate-400 mt-4 pt-3 border-t border-slate-100">
                Assessment: {timeAgo(assessment.created_at)}
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-2">
            <button
              onClick={handleTriggerCheckIn}
              className="px-5 py-2.5 rounded-lg border border-pregnancy text-pregnancy text-base font-medium hover:bg-pregnancy/5"
            >
              Trigger Check-in
            </button>
          </div>
        </div>

        {/* Right: charts / time-series */}
        <div className="space-y-4">
          <SymptomChart chartData={chartData} />
        </div>
      </div>
    </div>
  );
}
