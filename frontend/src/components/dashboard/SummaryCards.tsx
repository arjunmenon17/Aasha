import { TIER_BORDER, TIER_TEXT } from '@/constants/tiers';
import type { PatientsSummary } from '@/types';
import type { RiskTier } from '@/types';

const CARDS: { label: string; key: keyof Pick<PatientsSummary, 'tier_0' | 'tier_1' | 'tier_2' | 'tier_3'>; tier: RiskTier }[] = [
  { label: 'Emergency', key: 'tier_3', tier: 3 },
  { label: 'Concern', key: 'tier_2', tier: 2 },
  { label: 'Watch', key: 'tier_1', tier: 1 },
  { label: 'Normal', key: 'tier_0', tier: 0 },
];

interface SummaryCardsProps {
  summary: PatientsSummary;
}

export function SummaryCards({ summary }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {CARDS.map((c) => (
        <div
          key={c.label}
          className={`bg-slate-800 rounded-xl p-4 border-l-4 ${TIER_BORDER[c.tier]}`}
        >
          <div className={`text-3xl font-bold ${TIER_TEXT[c.tier]}`}>
            {summary[c.key]}
          </div>
          <div className="text-sm text-gray-400 mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
