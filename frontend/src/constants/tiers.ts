import type { RiskTier } from '@/types';

export const TIER_NAMES: Record<RiskTier, string> = {
  0: 'Normal',
  1: 'Watch',
  2: 'Concern',
  3: 'Emergency',
};

export const TIER_BG: Record<RiskTier, string> = {
  0: 'bg-green-600',
  1: 'bg-yellow-600',
  2: 'bg-orange-600',
  3: 'bg-red-600',
};

export const TIER_TEXT: Record<RiskTier, string> = {
  0: 'text-green-500',
  1: 'text-yellow-500',
  2: 'text-orange-500',
  3: 'text-red-500',
};

export const TIER_BORDER: Record<RiskTier, string> = {
  0: 'border-green-600',
  1: 'border-yellow-600',
  2: 'border-orange-600',
  3: 'border-red-600',
};
