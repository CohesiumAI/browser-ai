/**
 * BrowserAIConfig — main configuration interface.
 * CDC v2026.8 §4.2.1
 */

import type { ProviderId, PrivacyMode, ModelTier } from './common.js';
import type { RuntimeStateName } from './runtime-state.js';

export interface TimeoutsConfig {
  timeoutMultiplier?: number;
  overrides?: Partial<Record<RuntimeStateName, number>>;
}

export type DevSourcemaps = 'inline' | 'none';

export interface ProviderConstraints {
  minTier?: ModelTier;
  requireWebGPU?: boolean;
}

export interface ProviderPolicy {
  order: ProviderId[];
  constraints?: ProviderConstraints;
}

/**
 * Model tiering rule for device capability-based selection.
 */
export interface ModelTieringRule {
  minDeviceMemoryGB?: number;
  minHardwareConcurrency?: number;
  requireCacheStorage?: boolean;
}

/**
 * Model policy for a specific provider.
 * Defines which models are available and selection rules.
 */
export interface ProviderModelPolicy {
  providerId: ProviderId;
  candidateModelIds: string[];
  rules?: {
    tierA?: ModelTieringRule;
    tierB?: ModelTieringRule;
  };
}

/**
 * Global model policy configuration.
 * Allows per-provider model selection rules.
 */
export interface ModelPolicy {
  byProvider?: Partial<Record<ProviderId, ProviderModelPolicy>>;
  onNoCompatibleModel?: 'throw' | 'fallback_to_next_provider';
}

/**
 * SmolLM/Transformers.js provider options.
 */
export interface SmolLMProviderOptions {
  cacheMode?: 'best-effort' | 'required';
  modelOverrideHfRepo?: string;
}

export interface BrowserAIConfig {
  privacyMode?: PrivacyMode;
  providerPolicy: ProviderPolicy;
  publicBaseUrl?: string;
  providerOptions?: Record<string, unknown>;
  timeouts?: TimeoutsConfig;
  devSourcemaps?: DevSourcemaps;

  /**
   * Model selection policy per provider.
   * Allows different model catalogs for different providers.
   */
  modelPolicy?: ModelPolicy;

  /**
   * Override automatic tier detection.
   * V0.2: Exposed as public config option (CDC §20.3)
   * - 1: nano model (mobile/low-end)
   * - 2: standard model (desktop)
   * - 3: high-end model
   */
  tierOverride?: ModelTier;
}

/**
 * Default configuration values.
 */
export const DEFAULT_CONFIG: Required<Pick<BrowserAIConfig, 'privacyMode' | 'devSourcemaps'>> & {
  timeouts: Required<Pick<TimeoutsConfig, 'timeoutMultiplier'>>;
} = {
  privacyMode: 'any',
  devSourcemaps: 'none',
  timeouts: {
    timeoutMultiplier: 1.0,
  },
};

/**
 * Default deadlines per state (ms). CDC v2026.8 §5.4
 */
export const DEFAULT_DEADLINES: Partial<Record<RuntimeStateName, number>> = {
  BOOTING: 10_000,
  SELECTING_PROVIDER: 5_000,
  PREFLIGHT_QUOTA: 3_000,
  CHECKING_CACHE: 5_000,
  DOWNLOADING: 15 * 60 * 1000,
  WARMING_UP: 30_000,
  // GENERATING: removed - use token silence check instead (prefill can be slow)
  REHYDRATING: 15_000,
  TEARING_DOWN: 10_000,
};

/**
 * Indeterminate download stuck watchdog (5 min). CDC v2026.8 §5.4
 */
export const INDETERMINATE_STUCK_WATCHDOG_MS = 5 * 60 * 1000;
