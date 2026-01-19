/**
 * Common types used across browser-ai packages.
 * V0.2: Added webnn + wasm providers
 */

export type ProviderId = 'native' | 'webllm' | 'webnn' | 'wasm' | 'mock' | 'smollm';

export type PrivacyMode = 'any' | 'fully-local-managed';

export type PrivacySnapshotMode =
  | 'fully-local-managed'
  | 'browser-delegated-unknown'
  | 'browser-delegated-on-device-claimed';

export type ModelTier = 1 | 2 | 3;

export type Recoverability = 'recoverable' | 'non-recoverable';

export type SelectionReason =
  | 'ORDER_POLICY'
  | 'PRIVACY_MODE'
  | 'UNSUPPORTED'
  | 'DISABLED_BY_POLICY'
  | 'PROBE_FAILED'
  | 'QUOTA_PREFLIGHT_FAIL'
  | 'CACHE_HIT'
  | 'CACHE_MISS'
  | 'FORCED_BY_USER'
  | 'FALLBACK';

export type DownloadVariant = 'determinate' | 'indeterminate';

export type Role = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: Role;
  content: string;
}

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}
