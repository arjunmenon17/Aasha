import { TIER_NAMES, TIER_BG } from '@/constants/tiers';
import type { RiskTier } from '@/types';

interface TierBadgeProps {
  tier: RiskTier;
}

export function TierBadge({ tier }: TierBadgeProps) {
  return (
    <span
      className={
        TIER_BG[tier] +
        ' text-white text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-wide'
      }
    >
      {TIER_NAMES[tier]}
    </span>
  );
}
