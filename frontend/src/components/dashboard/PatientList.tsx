import { TierBadge } from '@/components/ui/TierBadge';
import { timeAgo } from '@/utils/time';
import { gestWeeks } from '@/utils/gestation';
import { TIER_BG } from '@/constants/tiers';
import type { Patient } from '@/types';

interface PatientListProps {
  patients: Patient[];
  onSelect: (id: string) => void;
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

export function PatientList({ patients, onSelect }: PatientListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {patients.map((p) => {
        const weeks = gestWeeks(
          p.gestational_age_at_enrollment,
          p.enrollment_date,
        );
        const hasMisses = (p.consecutive_misses ?? 0) > 0;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden cursor-pointer hover:shadow-md hover:border-slate-300 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-pregnancy/60 focus:ring-offset-2 focus:ring-offset-white flex"
          >
            {/* Tier accent bar */}
            <div className={`w-1 shrink-0 ${TIER_BG[p.current_risk_tier]}`} />

            <div className="flex-1 p-4 flex flex-col gap-2.5 min-w-0">
              {/* Top row: badge + timestamp */}
              <div className="flex items-center justify-between gap-2">
                <TierBadge tier={p.current_risk_tier} />
                <span className="text-[0.68rem] text-slate-400 shrink-0">
                  {timeAgo(p.updated_at)}
                </span>
              </div>

              {/* Name + initials avatar */}
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[0.65rem] font-bold ${TIER_BG[p.current_risk_tier]}`}>
                  {initials(p.name)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 truncate leading-tight">
                    {p.name}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {p.status === 'postpartum' ? 'Postpartum' : `${weeks} weeks gestation`}
                  </div>
                </div>
              </div>

              {/* Missed check-ins warning */}
              {hasMisses && (
                <div className="text-[0.7rem] text-amber-700 bg-amber-50 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 w-fit">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  {p.consecutive_misses} missed check-in{(p.consecutive_misses ?? 0) > 1 ? 's' : ''}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
