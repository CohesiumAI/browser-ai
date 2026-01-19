/**
 * Tier detection heuristic.
 * CDC v2026.8 §20.2 + Complément §2.5
 * V0.2: tierOverride support (CDC §20.3)
 */

import type { ModelTier } from '../types/common.js';
import { DEFAULT_MODELS } from '../types/models.js';

/**
 * Detect device tier using heuristics.
 * CDC v2026.8 §20.2
 */
export function detectTier(): ModelTier {
  const cores = navigator.hardwareConcurrency || 4;
  const ua = navigator.userAgent || '';
  const mobile = /Mobi|Android/i.test(ua);

  if (mobile) return 1;
  if (cores >= 8) return 3;
  return 2;
}

/**
 * Get effective tier, respecting override if provided.
 * V0.2: tierOverride public config (CDC §20.3)
 */
export function getEffectiveTier(tierOverride?: ModelTier): ModelTier {
  if (tierOverride !== undefined) {
    return tierOverride;
  }
  return detectTier();
}

/**
 * Pick default model ID based on detected or overridden tier.
 * V0.2: supports tierOverride parameter
 */
export function pickDefaultModelId(tierOverride?: ModelTier): string {
  const tier = getEffectiveTier(tierOverride);
  return tier === 1 ? DEFAULT_MODELS.nano.id : DEFAULT_MODELS.standard.id;
}

/**
 * Get model size category based on tier.
 */
export function getTierModelCategory(tier: ModelTier): 'nano' | 'standard' | 'large' {
  switch (tier) {
    case 1: return 'nano';
    case 2: return 'standard';
    case 3: return 'large';
  }
}
