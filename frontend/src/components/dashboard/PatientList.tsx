import { TierBadge } from '@/components/ui/TierBadge';
import { timeAgo } from '@/utils/time';
import { gestWeeks } from '@/utils/gestation';
import type { Patient } from '@/types';

interface PatientListProps {
  patients: Patient[];
  onSelect: (id: string) => void;
}

export function PatientList({ patients, onSelect }: PatientListProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {patients.map((p) => {
        const weeks = gestWeeks(
          p.gestational_age_at_enrollment,
          p.enrollment_date,
        );
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className="text-left bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:border-pregnancy-dark/60 hover:shadow-md transition flex flex-col gap-2 focus:outline-none focus:ring-2 focus:ring-pregnancy/60 focus:ring-offset-2 focus:ring-offset-white"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <TierBadge tier={p.current_risk_tier} />
                <span className="text-xs rounded-full px-2 py-0.5 bg-slate-50 text-slate-500 border border-slate-200">
                  {p.status === 'postpartum' ? 'Postpartum' : `${weeks} weeks`}
                </span>
              </div>
              <div className="text-[0.7rem] text-slate-400">
                {timeAgo(p.updated_at)}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-900 truncate">
                  {p.name}
                </div>
                {(p.consecutive_misses ?? 0) > 0 && (
                  <div className="mt-1 text-[0.7rem] text-amber-700 bg-amber-50 inline-flex px-2 py-0.5 rounded-full border border-amber-200">
                    {p.consecutive_misses} missed check-ins
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
