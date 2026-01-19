/**
 * Configuration validation utilities.
 * CDC v2026.8 §16.3, §17
 */

import type { BrowserAIConfig } from '../types/config.js';
import type { ProviderId } from '../types/common.js';
import { createError } from '../types/errors.js';

/**
 * Table 16.6 — publicBaseUrl requirements.
 * CDC v2026.8 §16.3
 * 
 * | Worker mode | Assets | publicBaseUrl requis ? |
 * |---|---|---|
 * | Inline | Tout bundlé | Non |
 * | Inline | WASM/shards fetch relatifs | **Oui** |
 * | Inline | URLs absolues | Non |
 * | External | App sert tout | Non (recommandé quand même) |
 */
export interface PublicBaseUrlCheckResult {
  required: boolean;
  reason?: string;
  providerId?: ProviderId;
}

/**
 * Check if publicBaseUrl is required for the given config.
 * Returns true if WebLLM is in the provider order and publicBaseUrl is missing.
 */
export function checkPublicBaseUrlRequired(config: BrowserAIConfig): PublicBaseUrlCheckResult {
  const hasWebLLM = config.providerPolicy.order.includes('webllm');
  
  if (!hasWebLLM) {
    return { required: false };
  }

  // WebLLM uses WASM/shards with relative fetch by default
  // publicBaseUrl is required unless explicit URLs are provided in providerOptions
  const webllmOptions = config.providerOptions?.webllm as Record<string, unknown> | undefined;
  const hasExplicitUrls = webllmOptions?.modelUrl || webllmOptions?.wasmUrl;

  if (hasExplicitUrls) {
    return { required: false, reason: 'Explicit URLs provided in providerOptions' };
  }

  if (!config.publicBaseUrl) {
    return {
      required: true,
      reason: 'WebLLM requires publicBaseUrl for WASM/shards fetch (CDC v2026.8 Table 16.6)',
      providerId: 'webllm',
    };
  }

  return { required: false };
}

/**
 * Validate BrowserAIConfig and throw if invalid.
 * CDC v2026.8 §17.2
 */
export function validateConfig(config: BrowserAIConfig): void {
  // Check providerPolicy.order is non-empty
  if (!config.providerPolicy?.order || config.providerPolicy.order.length === 0) {
    throw createError(
      'ERROR_INVALID_CONFIG',
      'providerPolicy.order must contain at least one provider',
      { recoverability: 'non-recoverable' }
    );
  }

  // Check publicBaseUrl requirement (CDC v2026.8 Table 16.6)
  const publicBaseUrlCheck = checkPublicBaseUrlRequired(config);
  if (publicBaseUrlCheck.required) {
    throw createError(
      'ERROR_PUBLIC_BASE_URL_REQUIRED',
      publicBaseUrlCheck.reason ?? 'publicBaseUrl is required for this configuration',
      {
        recoverability: 'non-recoverable',
        userAction: 'Set publicBaseUrl in BrowserAIConfig',
        devAction: 'Add publicBaseUrl pointing to your assets directory (e.g., "/assets" or "https://cdn.example.com")',
        details: { providerId: publicBaseUrlCheck.providerId },
      }
    );
  }

  // Check providerOptions is serializable (CDC v2026.8 §17.2)
  if (config.providerOptions !== undefined) {
    try {
      JSON.stringify(config.providerOptions);
    } catch {
      throw createError(
        'ERROR_INVALID_CONFIG',
        'providerOptions must be JSON-serializable',
        {
          recoverability: 'non-recoverable',
          devAction: 'Ensure providerOptions contains only serializable values',
        }
      );
    }
  }
}
