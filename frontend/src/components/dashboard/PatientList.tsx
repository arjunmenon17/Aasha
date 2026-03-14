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
    <div className="space-y-2">
      {patients.map((p) => {
        const weeks = gestWeeks(p.gestational_age_at_enrollment, p.enrollment_date);
        return (
          <div
            key={p.id}
            onClick={() => onSelect(p.id)}
            className="bg-slate-800 rounded-xl p-4 cursor-pointer hover:bg-slate-700 transition-colors flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <TierBadge tier={p.current_risk_tier} />
              <div>
                <div className="font-semibold text-slate-100">{p.name}</div>
                <div className="text-sm text-gray-400">
                  {p.status === 'postpartum' ? 'Postpartum' : `${weeks} weeks`}
                  {(p.consecutive_misses ?? 0) > 0 && (
                    <span className="text-yellow-500 ml-2">
                      ({p.consecutive_misses} missed)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-500">{timeAgo(p.updated_at)}</div>
          </div>
        );
      })}
    </div>
  );
}
