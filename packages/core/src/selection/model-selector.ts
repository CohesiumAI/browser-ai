/**
 * Model selection logic per provider.
 * Selects the best model based on device capabilities.
 */

import type { ProviderId } from '../types/common.js';
import type { BrowserAIConfig } from '../types/config.js';
import type { ModelSpec } from '../types/models.js';
import type { CapabilitySnapshot, EnvironmentFingerprint } from '../types/diagnostics.js';
import { 
  DEFAULT_MODELS, 
  MOBILE_TRANSFORMERS_MODELS, 
  SMOLLM_ALLOWED_HF_REPOS,
  getModelFallbackChain,
  getMobileModelFallbackChain,
} from '../types/models.js';
import { createError } from '../types/errors.js';

/**
 * Device capability thresholds for model tiering (legacy, kept for WebLLM).
 */
const TIER_THRESHOLDS = {
  tierA: { minDeviceMemoryGB: 6, minHardwareConcurrency: 6 },
  tierB: { minDeviceMemoryGB: 4, minHardwareConcurrency: 4 },
  tierC: { minDeviceMemoryGB: 2, minHardwareConcurrency: 2 },
};

export interface ModelSelectionResult {
  model: ModelSpec;
  tierSelected: 'A' | 'B' | 'C';
  reason: string;
}

/**
 * Select model for a specific provider based on device capabilities.
 * This is the key function that prevents smollm from receiving webllm models.
 * Now async to support storage.estimate() check for conservative Qwen selection.
 */
export async function selectModelForProvider(
  providerId: ProviderId,
  config: BrowserAIConfig,
  env: EnvironmentFingerprint,
  caps: CapabilitySnapshot
): Promise<ModelSelectionResult> {
  
  // SmolLM / Transformers.js provider: use mobile model catalog
  if (providerId === 'smollm') {
    return await selectMobileModelConservative(env, caps, config);
  }

  // WebLLM provider: use default WebLLM models
  if (providerId === 'webllm') {
    return selectWebLLMModel(env, caps, config);
  }

  // Native / Mock: return a placeholder model (native uses browser's model)
  if (providerId === 'native' || providerId === 'mock') {
    return {
      model: DEFAULT_MODELS.micro,
      tierSelected: 'C',
      reason: `${providerId} provider uses browser-managed model`,
    };
  }

  // WASM provider: use Transformers.js compatible models (ONNX), select by RAM like smollm
  if (providerId === 'wasm') {
    return await selectWASMModel(env, caps, config);
  }

  throw createError(
    'ERROR_INVALID_CONFIG',
    `Unknown provider: ${providerId}`,
    { userAction: 'Use a valid provider id' }
  );
}

/**
 * Select mobile model based on RAM (deviceMemory).
 * - RAM >= 4GB → Qwen2.5-0.5B-Instruct
 * - 2GB <= RAM < 4GB → SmolLM2-360M-Instruct
 * - RAM < 2GB → SmolLM2-135M-Instruct
 */
async function selectMobileModelConservative(
  env: EnvironmentFingerprint,
  caps: CapabilitySnapshot,
  config: BrowserAIConfig
): Promise<ModelSelectionResult> {
  const deviceMemory = env.deviceMemoryGB ?? 4;
  const cores = env.hardwareConcurrency ?? 4;

  console.log(`[model-selector] Mobile device: ${deviceMemory}GB RAM, ${cores} cores`);

  // Tier A: RAM >= 4GB → Qwen2.5-0.5B
  if (deviceMemory >= 4) {
    console.log(`[model-selector] ✓ RAM >= 4GB (${deviceMemory}GB) → Qwen2.5-0.5B`);
    return {
      model: MOBILE_TRANSFORMERS_MODELS.tierA,
      tierSelected: 'A',
      reason: `RAM >= 4GB (${deviceMemory}GB) → Qwen2.5-0.5B`,
    };
  }

  // Tier B: 2GB <= RAM < 4GB → SmolLM2-360M
  if (deviceMemory >= 2) {
    console.log(`[model-selector] RAM ${deviceMemory}GB (2-4GB range) → SmolLM2-360M`);
    return {
      model: MOBILE_TRANSFORMERS_MODELS.tierB,
      tierSelected: 'B',
      reason: `RAM ${deviceMemory}GB (2-4GB) → SmolLM2-360M`,
    };
  }

  // Tier C: RAM < 2GB → SmolLM2-135M
  console.log(`[model-selector] RAM < 2GB (${deviceMemory}GB) → SmolLM2-135M`);
  return {
    model: MOBILE_TRANSFORMERS_MODELS.tierC,
    tierSelected: 'C',
    reason: `RAM < 2GB (${deviceMemory}GB) → SmolLM2-135M`,
  };
}

/**
 * Select WASM model based on RAM (same logic as smollm but for desktop fallback).
 * Uses Transformers.js compatible models (ONNX).
 */
async function selectWASMModel(
  env: EnvironmentFingerprint,
  caps: CapabilitySnapshot,
  config: BrowserAIConfig
): Promise<ModelSelectionResult> {
  const deviceMemory = env.deviceMemoryGB ?? 4;
  const cores = env.hardwareConcurrency ?? 4;

  console.log(`[model-selector] WASM device: ${deviceMemory}GB RAM, ${cores} cores`);

  // Desktop with good RAM: Qwen2.5-0.5B
  if (deviceMemory >= 4) {
    console.log(`[model-selector] ✓ WASM RAM >= 4GB (${deviceMemory}GB) → Qwen2.5-0.5B`);
    return {
      model: MOBILE_TRANSFORMERS_MODELS.tierA,
      tierSelected: 'A',
      reason: `WASM provider uses Qwen2.5-0.5B (RAM ${deviceMemory}GB)`,
    };
  }

  // Mid-range: SmolLM2-360M
  if (deviceMemory >= 2) {
    console.log(`[model-selector] WASM RAM ${deviceMemory}GB → SmolLM2-360M`);
    return {
      model: MOBILE_TRANSFORMERS_MODELS.tierB,
      tierSelected: 'B',
      reason: `WASM provider uses SmolLM2-360M (RAM ${deviceMemory}GB)`,
    };
  }

  // Low RAM: SmolLM2-135M
  console.log(`[model-selector] WASM RAM < 2GB → SmolLM2-135M`);
  return {
    model: MOBILE_TRANSFORMERS_MODELS.tierC,
    tierSelected: 'C',
    reason: `WASM provider uses SmolLM2-135M (RAM ${deviceMemory}GB)`,
  };
}

/**
 * Select WebLLM model based on device capabilities.
 */
function selectWebLLMModel(
  env: EnvironmentFingerprint,
  caps: CapabilitySnapshot,
  config: BrowserAIConfig
): ModelSelectionResult {
  const deviceMemory = env.deviceMemoryGB ?? 4;

  // High-end desktop: standard model (8B)
  if (deviceMemory >= 8 && caps.hasWebGPU) {
    return {
      model: DEFAULT_MODELS.standard,
      tierSelected: 'A',
      reason: `High-end desktop (${deviceMemory}GB, WebGPU) → Llama 3.1 8B`,
    };
  }

  // Mid-range: nano model (1B q4f16)
  if (deviceMemory >= 4) {
    return {
      model: DEFAULT_MODELS.nano,
      tierSelected: 'B',
      reason: `Mid-range desktop (${deviceMemory}GB) → Llama 3.2 1B (q4f16)`,
    };
  }

  // Low-end: micro model (1B q4f32)
  return {
    model: DEFAULT_MODELS.micro,
    tierSelected: 'C',
    reason: `Low-end device (${deviceMemory}GB) → Llama 3.2 1B (q4f32)`,
  };
}

/**
 * Validate that a model is allowed for a provider.
 * Prevents loading incompatible models (e.g., WebLLM models in smollm).
 */
export function validateModelForProvider(
  providerId: ProviderId,
  model: ModelSpec
): void {
  // SmolLM provider: only allow transformersjs models from whitelist
  if (providerId === 'smollm') {
    if (model.provider !== 'transformersjs') {
      throw createError(
        'ERROR_INVALID_CONFIG',
        `Model ${model.id} (provider: ${model.provider}) is not compatible with smollm provider`,
        { userAction: 'Use a Transformers.js compatible model' }
      );
    }

    if (model.hfRepo && !SMOLLM_ALLOWED_HF_REPOS.has(model.hfRepo)) {
      throw createError(
        'ERROR_INVALID_CONFIG',
        `Model repo ${model.hfRepo} is not in the allowed list for smollm provider`,
        { userAction: 'Use an allowed model repository' }
      );
    }

    // Reject MLC models (WebLLM)
    if (model.hfRepo?.includes('-MLC') || model.id.includes('-mlc')) {
      throw createError(
        'ERROR_INVALID_CONFIG',
        `MLC models are not compatible with smollm provider: ${model.hfRepo || model.id}`,
        { userAction: 'Use a Transformers.js compatible model' }
      );
    }
  }

  // WebLLM provider: only allow webllm models
  if (providerId === 'webllm') {
    if (model.provider !== 'webllm') {
      throw createError(
        'ERROR_INVALID_CONFIG',
        `Model ${model.id} (provider: ${model.provider}) is not compatible with webllm provider`,
        { userAction: 'Use a WebLLM compatible model' }
      );
    }
  }
}
