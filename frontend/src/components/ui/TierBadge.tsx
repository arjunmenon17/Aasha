import { TIER_NAMES, TIER_BADGE } from '@/constants/tiers';
import type { RiskTier } from '@/types';

export function TierBadge({ tier }: { tier: RiskTier }) {
  return (
    <span className={`${TIER_BADGE[tier]} text-xs font-semibold px-2.5 py-0.5 rounded-full tracking-wide`}>
      {TIER_NAMES[tier]}
    </span>
  );
}
