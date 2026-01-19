/**
 * Error catalog for browser-ai.
 * Each error MUST have a stable code, cause, state, user/dev actions.
 */

import type { ProviderId, Recoverability } from './common.js';
import type { RuntimeStateName } from './runtime-state.js';

export type BrowserAIErrorCode =
  // Core errors
  | 'ERROR_INVALID_CONFIG'
  | 'ERROR_INVALID_STATE'
  | 'ERROR_INVALID_INPUT_EMPTY_MESSAGES'
  | 'ERROR_TEMPLATE_FORMAT_UNSUPPORTED'
  | 'ERROR_PROMPT_BUDGET_OVERFLOW'
  // Native provider errors
  | 'ERROR_NATIVE_UNAVAILABLE'
  | 'ERROR_NATIVE_API_CHANGED'
  | 'ERROR_NATIVE_DOWNLOAD_STUCK'
  | 'ERROR_NATIVE_SESSION_FAILED'
  // WebLLM provider errors
  | 'ERROR_WEBLLM_INIT_FAILED'
  | 'ERROR_WEBLLM_INCOMPATIBLE_MODEL'
  // WASM/WebGPU errors
  | 'ERROR_WASM_MIME_INVALID'
  | 'ERROR_WEBGPU_DEVICE_LOST'
  // Worker errors
  | 'ERROR_WORKER_CRASH'
  | 'ERROR_TIMEOUT'
  | 'ERROR_ABORTED'
  // Storage/quota errors
  | 'ERROR_QUOTA_PREFLIGHT_FAIL'
  | 'ERROR_QUOTA_EXCEEDED'
  | 'ERROR_CACHE_DESYNC_REPAIRED'
  | 'ERROR_CACHE_CORRUPT'
  // Network errors
  | 'ERROR_NETWORK'
  // Generation errors
  | 'ERROR_GENERATION_STALLED'
  | 'ERROR_HEALTHCHECK_TIMEOUT_DURING_GENERATION'
  | 'ERROR_PROMPT_TOO_LARGE_AFTER_RETRIES'
  | 'ERROR_UNSUPPORTED_TEMPLATE_FORMAT'
  | 'ERROR_PUBLIC_BASE_URL_REQUIRED'
  // Audio module errors (v1.1)
  | 'ERROR_AUDIO_ASR_INIT_FAILED'
  | 'ERROR_AUDIO_TTS_INIT_FAILED'
  | 'ERROR_AUDIO_VAD_INIT_FAILED'
  | 'ERROR_AUDIO_PERMISSION_DENIED'
  // OCR module errors (v1.2)
  | 'ERROR_OCR_INIT_FAILED'
  | 'ERROR_PDF_TEXT_LAYER_PARSE_FAILED'
  // Memory module errors (v1.3)
  | 'ERROR_MEMORY_IDB_FAILED'
  // VLM module errors (v2.0)
  | 'ERROR_VLM_TIER_NOT_SUPPORTED'
  | 'ERROR_VLM_INIT_FAILED'
  // Fallback
  | 'ERROR_UNKNOWN';

export interface BrowserAIError {
  code: BrowserAIErrorCode;
  message: string;
  recoverability: Recoverability;

  cause?: unknown;
  details?: Record<string, unknown>;

  userAction?: string;
  devAction?: string;

  atState?: RuntimeStateName;
  atProvider?: ProviderId;
  timestampMs: number;
}

/**
 * Create a BrowserAIError with consistent structure.
 */
export function createError(
  code: BrowserAIErrorCode,
  message: string,
  options: Partial<Omit<BrowserAIError, 'code' | 'message' | 'timestampMs'>> = {}
): BrowserAIError {
  return {
    code,
    message,
    recoverability: options.recoverability ?? 'non-recoverable',
    timestampMs: Date.now(),
    ...options,
  };
}

/**
 * Check if an error is recoverable (eligible for rehydration).
 */
export function isRecoverable(error: BrowserAIError): boolean {
  return error.recoverability === 'recoverable';
}

/**
 * Type guard for BrowserAIError.
 */
export function isBrowserAIError(error: unknown): error is BrowserAIError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'recoverability' in error &&
    'timestampMs' in error
  );
}
