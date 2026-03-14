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

  const riskFactorKeys =
    detail.risk_factors &&
    Object.entries(detail.risk_factors)
      .filter(([, v]) => v)
      .map(([k]) => k);

  const riskFactorLabels: Record<string, string> = {
    primigravida: 'First pregnancy',
    age_over_35: 'Age 35+',
    prior_preeclampsia: 'Prior preeclampsia',
    chronic_hypertension: 'Chronic hypertension',
    multiple_gestation: 'Multiple gestation',
    prior_pph: 'Prior postpartum hemorrhage',
  };
  const getRiskLabel = (key: string) =>
    riskFactorLabels[key] ?? key.replace(/_/g, ' ');

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

  const formatDate = (dateStr: string | null | undefined) =>
    dateStr ? new Date(dateStr).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—';

  const baseline = detail.baseline && typeof detail.baseline === 'object' ? detail.baseline : {};
  const checkinsCompleted = typeof baseline.checkins_completed === 'number' ? baseline.checkins_completed : null;
  const baselineEstablished = baseline.baseline_established === true;

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 tracking-tight">
            {detail.name}
          </h1>
          <TierBadge tier={detail.current_risk_tier} />
          <button
            onClick={handleTriggerCheckIn}
            className="px-4 py-2 rounded-lg border border-pregnancy text-pregnancy text-sm font-medium hover:bg-pregnancy/5 shrink-0"
          >
            Trigger Check-in
          </button>
        </div>
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 shrink-0"
        >
          ← Back to patients
        </button>
      </div>

      {escalation && (
        <div className="bg-white border border-red-200 rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-sm text-red-600">
                Active escalation · Tier {escalation.tier}
              </h3>
              <p className="text-sm text-slate-800 mt-1">{escalation.primary_concern}</p>
              <div className="flex gap-4 mt-2 text-xs text-slate-500">
                <span>CHW: {escalation.chw_acknowledged_at ? 'Acknowledged' : 'Pending'}</span>
                <span>Follow-ups: {escalation.follow_up_count}</span>
                <span>{timeAgo(escalation.created_at)}</span>
              </div>
            </div>
            <button
              onClick={handleResolve}
              className="px-3 py-1.5 rounded-full border border-emerald-500 text-emerald-600 text-sm hover:bg-emerald-50 shrink-0"
            >
              Resolve
            </button>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col min-h-0">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Patient details
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Status</div>
              <div className="text-slate-900 capitalize font-medium">{detail.status}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Gestational age</div>
              <div className="text-slate-900 font-medium">{weeks} weeks</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Check-in freq</div>
              <div className="text-slate-900 capitalize font-medium">{detail.check_in_frequency}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Phone</div>
              <div className="text-slate-900 font-medium">{detail.phone_number}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Enrollment date</div>
              <div className="text-slate-900 font-medium">{formatDate(detail.enrollment_date)}</div>
            </div>
            <div>
              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Estimated due date</div>
              <div className="text-slate-900 font-medium">{formatDate(detail.estimated_due_date)}</div>
            </div>
            {detail.status === 'postpartum' && detail.delivery_date && (
              <div>
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Delivery date</div>
                <div className="text-slate-900 font-medium">{formatDate(detail.delivery_date)}</div>
              </div>
            )}
            {(detail.consecutive_misses ?? 0) > 0 && (
              <div>
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Consecutive misses</div>
                <div className="text-slate-900 font-medium">{detail.consecutive_misses}</div>
              </div>
            )}
            <div>
              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Last updated</div>
              <div className="text-slate-900 font-medium">{timeAgo(detail.updated_at)}</div>
            </div>
            {checkinsCompleted != null && (
              <div>
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Check-ins completed</div>
                <div className="text-slate-900 font-medium">{checkinsCompleted}</div>
              </div>
            )}
            {baselineEstablished && (
              <div>
                <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Baseline</div>
                <div className="text-slate-900 font-medium">Established</div>
              </div>
            )}
          </div>
          {detail.address && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="text-slate-500 text-xs font-medium uppercase tracking-wide mb-0.5">Address</div>
              <div className="text-slate-900 text-sm leading-snug">{detail.address}</div>
            </div>
          )}
          {riskFactorKeys && riskFactorKeys.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-600 text-base" aria-hidden>◇</span>
                <span className="text-slate-600 text-xs font-semibold uppercase tracking-wide">Risk profile</span>
              </div>
              <ul className="space-y-1.5">
                {riskFactorKeys.map((key) => (
                  <li
                    key={key}
                    className="flex items-center gap-2 text-sm text-slate-800 pl-1 border-l-2 border-amber-300/70"
                  >
                    <span className="text-amber-600/80 text-[10px]">●</span>
                    {getRiskLabel(key)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm min-h-[280px] flex flex-col">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
            Symptom trend
          </h2>
          <div className="flex-1 min-h-0">
            <SymptomChart chartData={chartData} />
          </div>
        </div>
      </div>

      {assessment && (() => {
        const tierColors = [
          'border-l-emerald-500 bg-emerald-50/30',
          'border-l-amber-500 bg-amber-50/30',
          'border-l-orange-500 bg-orange-50/30',
          'border-l-red-500 bg-red-50/30',
        ];
        const tierAccent = tierColors[Math.min(assessment.risk_tier, 3)] ?? tierColors[0];
        return (
          <section className="rounded-2xl border border-slate-200/80 bg-white shadow-md overflow-hidden">
            <div className={`pl-4 sm:pl-5 pr-4 sm:pr-5 pt-4 pb-1 border-l-4 ${tierAccent}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">
                  Latest clinical assessment
                </span>
                <span className="text-slate-400 text-xs tabular-nums">
                  {timeAgo(assessment.created_at)}
                </span>
              </div>
              <h3 className="text-lg sm:text-xl font-semibold text-slate-900 leading-snug mb-4">
                {assessment.primary_concern ?? 'No primary concern identified'}
              </h3>
              <p className="text-slate-700 text-[15px] leading-relaxed mb-5">
                {assessment.clinical_reasoning}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-0 border-t border-slate-100">
              <div className="p-4 sm:p-5 border-b sm:border-b-0 sm:border-r border-slate-100 bg-slate-50/50">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" aria-hidden />
                  Recommended actions
                </h4>
                {actionItems.length > 0 ? (
                  <ol className="space-y-2.5 text-sm text-slate-800">
                    {actionItems.map((a, i) => (
                      <li key={i} className="flex gap-2.5">
                        <span className="text-emerald-600 font-semibold shrink-0">{i + 1}</span>
                        <span className="leading-snug">{a}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-slate-400 italic">No specific actions for this assessment.</p>
                )}
              </div>

              <div className="p-4 sm:p-5 space-y-4">
                {protocolRefs.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" aria-hidden />
                      Guidelines cited
                    </h4>
                    <div className="space-y-2">
                      {protocolRefs.map((ref, i) => (
                        <blockquote
                          key={i}
                          className="pl-2.5 border-l-2 border-indigo-200 text-sm text-slate-700 bg-indigo-50/60 rounded-r py-1.5 pr-2"
                          title={ref.relevant_finding}
                        >
                          <cite className="not-italic font-medium text-slate-800 text-xs block mb-0.5">{ref.source}</cite>
                          <span className="line-clamp-2">{ref.relevant_finding}</span>
                        </blockquote>
                      ))}
                    </div>
                  </div>
                )}
                {uncertaintyItems.length > 0 && (
                  <div className="rounded-lg bg-amber-50/90 border border-amber-200/90 p-3">
                    <h4 className="text-xs font-semibold text-amber-800/90 uppercase tracking-wider mb-1.5 flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />
                      Information gaps
                    </h4>
                    <ul className="space-y-1 text-sm text-amber-900">
                      {uncertaintyItems.map((f, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-amber-500 shrink-0 mt-0.5">–</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {protocolRefs.length === 0 && uncertaintyItems.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No guidelines or gaps noted.</p>
                )}
              </div>
            </div>
          </section>
        );
      })()}
    </div>
  );
}
