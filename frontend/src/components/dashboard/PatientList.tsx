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
    <div className="space-y-3">
      {patients.map((p) => {
        const weeks = gestWeeks(p.gestational_age_at_enrollment, p.enrollment_date);
        return (
          <div
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:border-pregnancy-dark/60 hover:shadow-sm transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <TierBadge tier={p.current_risk_tier} />
              <div>
                <div className="font-medium text-slate-900">{p.name}</div>
                <div className="text-sm text-slate-500">
                  {p.status === 'postpartum' ? 'Postpartum' : `${weeks} weeks`}
                  {(p.consecutive_misses ?? 0) > 0 && (
                    <span className="text-yellow-600 ml-2">
                      ({p.consecutive_misses} missed)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-400">{timeAgo(p.updated_at)}</div>
          </div>
        );
      })}
    </div>
  );
}
