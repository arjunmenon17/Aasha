import { TIER_TEXT, TIER_BORDER, TIER_CARD_BG } from '@/constants/tiers';
import type { PatientsSummary, RiskTier } from '@/types';

const CARDS: {
  label: string;
  sub: string;
  key: keyof Pick<PatientsSummary, 'tier_0' | 'tier_1' | 'tier_2' | 'tier_3'>;
  tier: RiskTier;
}[] = [
  { label: 'Emergency', sub: 'Immediate referral', key: 'tier_3', tier: 3 },
  { label: 'Concern',   sub: 'Daily follow-up',    key: 'tier_2', tier: 2 },
  { label: 'Watch',     sub: 'Monitor closely',    key: 'tier_1', tier: 1 },
  { label: 'Normal',    sub: 'Routine care',        key: 'tier_0', tier: 0 },
];

export function SummaryCards({ summary }: { summary: PatientsSummary }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      {CARDS.map((c) => (
        <div
          key={c.label}
          className={`${TIER_CARD_BG[c.tier]} rounded-xl p-4 border border-slate-200/70 border-l-4 ${TIER_BORDER[c.tier]}`}
        >
          <div className={`text-3xl font-bold ${TIER_TEXT[c.tier]}`}>
            {summary[c.key]}
          </div>
          <div className="text-sm font-medium text-slate-700 mt-1">{c.label}</div>
          <div className="text-xs text-slate-400 mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}
