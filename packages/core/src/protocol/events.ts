/**
 * Worker event types.
 * Responses from worker to main thread.
 */

import type { RuntimeStateName } from '../types/runtime-state.js';
import type { ProviderId, Usage } from '../types/common.js';
import type { BrowserAIErrorCode } from '../types/errors.js';
import type { SelectionReportEntry } from '../types/diagnostics.js';

export type EventType =
  | 'EVENT_STATE_CHANGE'
  | 'EVENT_PROVIDER_SELECTED'
  | 'EVENT_QUOTA_RESULT'
  | 'EVENT_CACHE_RESULT'
  | 'EVENT_DOWNLOAD_PROGRESS'
  | 'EVENT_WARMUP_COMPLETE'
  | 'EVENT_TOKEN'
  | 'EVENT_GENERATION_COMPLETE'
  | 'EVENT_ERROR'
  | 'EVENT_HEALTHCHECK_RESPONSE'
  | 'EVENT_TEARDOWN_COMPLETE';

export interface EvtStateChange {
  type: 'EVENT_STATE_CHANGE';
  state: RuntimeStateName;
  metadata?: Record<string, unknown>;
}

export interface EvtProviderSelected {
  type: 'EVENT_PROVIDER_SELECTED';
  providerId: ProviderId;
  selectionReportId: string;
  reasons: SelectionReportEntry[];
}

export interface EvtQuotaResult {
  type: 'EVENT_QUOTA_RESULT';
  ok: boolean;
  availableBytes?: number;
  requiredBytes?: number;
}

export interface EvtCacheResult {
  type: 'EVENT_CACHE_RESULT';
  hit: boolean;
  modelId: string;
}

export interface EvtDownloadProgress {
  type: 'EVENT_DOWNLOAD_PROGRESS';
  downloadedBytes: number;
  totalBytes?: number;
  variant: 'determinate' | 'indeterminate';
}

export interface EvtWarmupComplete {
  type: 'EVENT_WARMUP_COMPLETE';
  modelId: string;
}

export interface EvtToken {
  type: 'EVENT_TOKEN';
  token: string;
}

export interface EvtGenerationComplete {
  type: 'EVENT_GENERATION_COMPLETE';
  text: string;
  usage?: Usage;
  providerId: ProviderId;
  modelId?: string;
}

export interface EvtError {
  type: 'EVENT_ERROR';
  code: BrowserAIErrorCode;
  message: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface EvtHealthcheckResponse {
  type: 'EVENT_HEALTHCHECK_RESPONSE';
  ok: boolean;
  now: number;
  state: RuntimeStateName;
}

export interface EvtTeardownComplete {
  type: 'EVENT_TEARDOWN_COMPLETE';
}

export type WorkerEvent =
  | EvtStateChange
  | EvtProviderSelected
  | EvtQuotaResult
  | EvtCacheResult
  | EvtDownloadProgress
  | EvtWarmupComplete
  | EvtToken
  | EvtGenerationComplete
  | EvtError
  | EvtHealthcheckResponse
  | EvtTeardownComplete;
