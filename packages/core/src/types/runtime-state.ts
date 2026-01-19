/**
 * FSM RuntimeState types — 12 states + DISABLED.
 * Sub-states use metadata (variant, isAborting, etc.) to avoid state explosion.
 */

import type { ProviderId, DownloadVariant } from './common.js';
import type { BrowserAIError } from './errors.js';

export type RuntimeStateName =
  | 'IDLE'
  | 'BOOTING'
  | 'SELECTING_PROVIDER'
  | 'PREFLIGHT_QUOTA'
  | 'CHECKING_CACHE'
  | 'DOWNLOADING'
  | 'WARMING_UP'
  | 'READY'
  | 'GENERATING'
  | 'ERROR'
  | 'DISABLED'
  | 'REHYDRATING'
  | 'TEARING_DOWN';

export interface BaseState {
  name: RuntimeStateName;
  sinceMs: number;
  deadlineMs?: number;
  deadlineAtMs?: number;
  selectionReportId?: string;
  providerId?: ProviderId;
}

export type IdleState = BaseState & {
  name: 'IDLE';
};

export type BootingState = BaseState & {
  name: 'BOOTING';
  step: 'init' | 'worker' | 'deps';
};

export type SelectingProviderState = BaseState & {
  name: 'SELECTING_PROVIDER';
  policyOrder: ProviderId[];
  tried: Array<{ providerId: ProviderId; ok: boolean; reason?: string }>;
};

export type PreflightQuotaState = BaseState & {
  name: 'PREFLIGHT_QUOTA';
  modelId?: string;
  requiredBytes?: number;
  availableBytes?: number;
  estimateSupported: boolean;
};

export type CheckingCacheState = BaseState & {
  name: 'CHECKING_CACHE';
  modelId?: string;
  cacheHit?: boolean;
};

export type DownloadingState = BaseState & {
  name: 'DOWNLOADING';
  variant: DownloadVariant;
  totalBytes?: number;
  downloadedBytes?: number;
  spinnerLabel?: string;
};

export type WarmingUpState = BaseState & {
  name: 'WARMING_UP';
  phase: 'model-load' | 'compile' | 'first-run';
};

export type ReadyState = BaseState & {
  name: 'READY';
  modelId?: string;
};

export type GeneratingState = BaseState & {
  name: 'GENERATING';
  requestSeq: number;
  epoch: number;
  isAborting: boolean;
  tokensEmitted: number;
  lastTokenAtMs?: number;
};

export type ErrorState = BaseState & {
  name: 'ERROR';
  error: BrowserAIError;
  canRehydrate: boolean;
};

export type DisabledState = BaseState & {
  name: 'DISABLED';
  reason:
    | 'POLICY_FORBIDS_ALL'
    | 'PRIVACY_MODE_FORBIDS_AVAILABLE_PROVIDERS'
    | 'ENVIRONMENT_UNSUPPORTED'
    | 'USER_DISABLED';
};

export type RehydratingState = BaseState & {
  name: 'REHYDRATING';
  reason: 'WORKER_CRASH' | 'DEVICE_LOST' | 'USER_REQUEST' | 'RECOVERABLE_ERROR';
  attempt: number;
};

export type TearingDownState = BaseState & {
  name: 'TEARING_DOWN';
  reason: 'USER_REQUEST' | 'DISPOSE' | 'HARD_RESET' | 'RECOVERY';
};

export type RuntimeState =
  | IdleState
  | BootingState
  | SelectingProviderState
  | PreflightQuotaState
  | CheckingCacheState
  | DownloadingState
  | WarmingUpState
  | ReadyState
  | GeneratingState
  | ErrorState
  | DisabledState
  | RehydratingState
  | TearingDownState;

/**
 * Create initial IDLE state.
 */
export function createIdleState(): IdleState {
  return {
    name: 'IDLE',
    sinceMs: Date.now(),
  };
}
