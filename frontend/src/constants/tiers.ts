import type { RiskTier } from '@/types';

export const TIER_NAMES: Record<RiskTier, string> = {
  0: 'Normal',
  1: 'Watch',
  2: 'Concern',
  3: 'Emergency',
};

// Dot / accent bar color
export const TIER_BG: Record<RiskTier, string> = {
  0: 'bg-teal-500',
  1: 'bg-amber-500',
  2: 'bg-orange-500',
  3: 'bg-rose-600',
};

// Soft badge (tint bg + coloured text + border)
export const TIER_BADGE: Record<RiskTier, string> = {
  0: 'bg-teal-50 text-teal-700 border border-teal-200',
  1: 'bg-amber-50 text-amber-700 border border-amber-200',
  2: 'bg-orange-50 text-orange-700 border border-orange-200',
  3: 'bg-rose-50 text-rose-700 border border-rose-200',
};

export const TIER_TEXT: Record<RiskTier, string> = {
  0: 'text-teal-600',
  1: 'text-amber-600',
  2: 'text-orange-600',
  3: 'text-rose-700',
};

export const TIER_BORDER: Record<RiskTier, string> = {
  0: 'border-l-teal-400',
  1: 'border-l-amber-400',
  2: 'border-l-orange-400',
  3: 'border-l-rose-500',
};

export const TIER_CARD_BG: Record<RiskTier, string> = {
  0: 'bg-teal-50/60',
  1: 'bg-amber-50/60',
  2: 'bg-orange-50/60',
  3: 'bg-rose-50/60',
};
