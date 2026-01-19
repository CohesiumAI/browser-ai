/**
 * DiagnosticsSnapshot — export JSON actionable for support + debug.
 * No vendor types leak here.
 */

import type { ProviderId, PrivacyMode, PrivacySnapshotMode, SelectionReason } from './common.js';
import type { RuntimeState } from './runtime-state.js';
import type { BrowserAIError } from './errors.js';

export interface EnvironmentFingerprint {
  userAgent: string;
  platform?: string;
  language?: string;
  hardwareConcurrency?: number;
  deviceMemoryGB?: number;
  isSecureContext: boolean;
  crossOriginIsolated: boolean;
}

export interface CapabilitySnapshot {
  hasWindowAI: boolean;
  hasWebGPU: boolean;
  hasWebNN: boolean;
  hasStorageEstimate: boolean;
  hasCacheStorage: boolean;
  hasIndexedDB: boolean;
}

export interface StorageEstimateSnapshot {
  supported: boolean;
  quotaBytes?: number;
  usageBytes?: number;
  availableBytes?: number;
}

export interface CacheSnapshot {
  modelId?: string;
  cacheHit?: boolean;
  cacheStorageBytesApprox?: number;
  idbBytesApprox?: number;
  lastAutoRepairAtMs?: number;
  lastAutoRepairResult?: 'none' | 'repaired' | 'failed';
}

export interface PrivacySnapshot {
  privacyMode: PrivacyMode;
  runtimeMode: PrivacySnapshotMode;
  note: string;
}

export interface TimingSnapshot {
  bootMs?: number;
  selectingProviderMs?: number;
  downloadMs?: number;
  warmupMs?: number;
  firstTokenMs?: number;
  tokensPerSecond?: number;
  lastStateChangeAtMs: number;
}

export interface SLOSnapshot {
  feedbackUiP95TargetMs: number;
  abortUiP95TargetMs: number;
  bootingP95TargetMs: number;
  workerChunkGzipMaxBytes: number;
  lastFeedbackUiMs?: number;
  lastAbortUiMs?: number;
  lastBootMs?: number;
  workerChunkGzipBytes?: number;
  longTasksOver50msDuringBootP95?: number;
}

export interface SelectionReportEntry {
  providerId: ProviderId;
  ok: boolean;
  reason: SelectionReason;
  details?: Record<string, unknown>;
}

export interface SelectionReport {
  id: string;
  createdAtMs: number;
  policyOrder: ProviderId[];
  selected?: ProviderId;
  reasons: SelectionReportEntry[];
}

export interface AdaptersSnapshot {
  messageFlattened: boolean;
  systemPromptLocation?: 'native' | 'flattened-to-user';
}

export interface ModulesSnapshot {
  audio?: {
    enabled: boolean;
    asr?: { model?: string; backend?: 'wasm' | 'webgpu' };
    tts?: { voice?: string; backend?: 'wasm' };
    vad?: { enabled: boolean };
    latencyP95Ms?: number;
  };
  ocr?: {
    enabled: boolean;
    backend?: 'tesseract-wasm';
    language?: string;
  };
  memory?: {
    enabled: boolean;
    conversationId?: string;
    turnsCount?: number;
    hasSummary?: boolean;
  };
  vlm?: {
    enabled: boolean;
    tierRequired: 3;
    tierDetected?: 1 | 2 | 3;
  };
}

/**
 * Quota preflight attempt for diagnostics (Option C spec §7).
 */
export interface QuotaAttemptSnapshot {
  modelId: string;
  sizeBytes: number;
  marginBytes: number;
  requiredBytes: number;
  ok: boolean;
  estimateSupported: boolean;
  availableBytes?: number;
  quotaBytes?: number;
  usageBytes?: number;
}

/**
 * Quota preflight report for diagnostics (Option C spec §7).
 */
export interface QuotaPreflightReportSnapshot {
  providerId: string;
  attempts: QuotaAttemptSnapshot[];
  selectedModelId?: string;
}

export interface DiagnosticsSnapshot {
  schemaVersion: '1';
  generatedAtMs: number;
  libVersion: string;
  selectionReport?: SelectionReport;
  quotaPreflightReport?: QuotaPreflightReportSnapshot;
  state: RuntimeState;
  privacy: PrivacySnapshot;
  env: EnvironmentFingerprint;
  capabilities: CapabilitySnapshot;
  storage: StorageEstimateSnapshot;
  cache: CacheSnapshot;
  timings: TimingSnapshot;
  slo: SLOSnapshot;
  adapters: AdaptersSnapshot;
  modules?: ModulesSnapshot;
  recentErrors: BrowserAIError[];
  extra?: Record<string, unknown>;
}

/**
 * Default SLO targets per CDC v2026.8 §19.
 */
export const DEFAULT_SLO: Omit<SLOSnapshot, 'lastFeedbackUiMs' | 'lastAbortUiMs' | 'lastBootMs' | 'workerChunkGzipBytes' | 'longTasksOver50msDuringBootP95'> = {
  feedbackUiP95TargetMs: 200,
  abortUiP95TargetMs: 500,
  bootingP95TargetMs: 2000,
  workerChunkGzipMaxBytes: 10 * 1024 * 1024,
};
