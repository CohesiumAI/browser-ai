/**
 * Model catalog types.
 * CDC v2026.8 §10 + Complément §2
 */

import type { ModelTier } from './common.js';

export type ModelProvider = 'webllm' | 'webnn' | 'wasm' | 'transformersjs';
export type ModelSource = 'prebuilt' | 'compiled' | 'self-hosted';

export type ChatTemplateFormat = 'simple' | 'jinja';

export interface ChatTemplate {
  format: ChatTemplateFormat;
  template: string;
}

export interface EngineCompat {
  engine: 'webllm';
  version: string;
}

export interface ModelIntegrity {
  algo: 'sha256';
  value: string;
}

export interface ModelSpec {
  id: string;
  label?: string;
  provider: ModelProvider;
  source: ModelSource;
  sizeBytes: number;
  tier?: ModelTier;
  contextWindowTokens?: number;
  hfRepo?: string;
  engineCompat?: EngineCompat;
  urls?: string[];
  integrity?: ModelIntegrity;
  chatTemplate?: ChatTemplate;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Default models for V0.1 STRICT.
 * Using models validated in WebLLM prebuiltAppConfig.model_list.
 * Complément CDC §2.1–2.3
 * 
 * Fallback order: standard → nano → micro
 */
export const DEFAULT_MODELS: { micro: ModelSpec; nano: ModelSpec; standard: ModelSpec } = {
  micro: {
    id: 'llama-3.2-1b-instruct-q4f32_1-mlc',
    label: 'Llama 3.2 1B Instruct (q4f32) — Micro',
    provider: 'webllm',
    source: 'prebuilt',
    hfRepo: 'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    contextWindowTokens: 4096,
    sizeBytes: Math.round(600 * MB),
    tier: 1,
    engineCompat: {
      engine: 'webllm',
      version: '0.2.80',
    },
  },
  nano: {
    id: 'llama-3.2-1b-instruct-q4f16_1-mlc',
    label: 'Llama 3.2 1B Instruct (q4f16) — Nano',
    provider: 'webllm',
    source: 'prebuilt',
    hfRepo: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    contextWindowTokens: 4096,
    sizeBytes: Math.round(705 * MB),
    tier: 1,
    engineCompat: {
      engine: 'webllm',
      version: '0.2.80',
    },
  },
  standard: {
    id: 'llama-3.1-8b-instruct-q4f16_1-mlc',
    label: 'Llama 3.1 8B Instruct (q4f16) — Standard',
    provider: 'webllm',
    source: 'prebuilt',
    hfRepo: 'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    contextWindowTokens: 8192,
    sizeBytes: Math.round(4.5 * GB),
    tier: 2,
    engineCompat: {
      engine: 'webllm',
      version: '0.2.80',
    },
  },
};

/**
 * Get model by ID from the default catalog.
 * Supports both lowercase CDC IDs and legacy MixedCase IDs.
 */
export function getModelById(id: string): ModelSpec | undefined {
  const normalizedId = id.toLowerCase();
  for (const key of Object.keys(DEFAULT_MODELS) as Array<keyof typeof DEFAULT_MODELS>) {
    if (normalizedId === DEFAULT_MODELS[key].id) {
      return DEFAULT_MODELS[key];
    }
  }
  return undefined;
}

/**
 * Get fallback chain: ordered list of models from smallest to largest.
 * Prioritizes faster download and broader compatibility.
 * "jQuery de l'IA locale" — just works, fast.
 */
export function getModelFallbackChain(): ModelSpec[] {
  return [DEFAULT_MODELS.nano, DEFAULT_MODELS.micro, DEFAULT_MODELS.standard];
}

/**
 * Mobile models for Transformers.js (ONNX/WASM).
 * Fallback chain: Qwen2.5-0.5B → SmolLM2-360M → SmolLM2-135M
 * All repos are web-ready (non-gated, ONNX weights available).
 */
export const MOBILE_TRANSFORMERS_MODELS: { tierA: ModelSpec; tierB: ModelSpec; tierC: ModelSpec } = {
  tierA: {
    id: 'qwen2.5-0.5b-instruct-onnx',
    label: 'Qwen2.5 0.5B Instruct (ONNX)',
    provider: 'transformersjs',
    source: 'compiled',
    hfRepo: 'onnx-community/Qwen2.5-0.5B-Instruct',
    sizeBytes: Math.round(350 * MB),
    contextWindowTokens: 4096,
    tier: 2,
  },
  tierB: {
    id: 'smollm2-360m-instruct',
    label: 'SmolLM2 360M Instruct',
    provider: 'transformersjs',
    source: 'compiled',
    hfRepo: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    sizeBytes: Math.round(250 * MB),
    contextWindowTokens: 4096,
    tier: 1,
  },
  tierC: {
    id: 'smollm2-135m-instruct',
    label: 'SmolLM2 135M Instruct',
    provider: 'transformersjs',
    source: 'compiled',
    hfRepo: 'HuggingFaceTB/SmolLM2-135M-Instruct',
    sizeBytes: Math.round(100 * MB),
    contextWindowTokens: 4096,
    tier: 1,
  },
};

/**
 * Get mobile fallback chain for Transformers.js provider.
 */
export function getMobileModelFallbackChain(): ModelSpec[] {
  return [
    MOBILE_TRANSFORMERS_MODELS.tierA,
    MOBILE_TRANSFORMERS_MODELS.tierB,
    MOBILE_TRANSFORMERS_MODELS.tierC,
  ];
}

/**
 * Whitelist of allowed HF repos for smollm/transformersjs provider.
 * Security: prevents loading gated or incompatible models.
 */
export const SMOLLM_ALLOWED_HF_REPOS = new Set([
  'onnx-community/Qwen2.5-0.5B-Instruct',
  'HuggingFaceTB/SmolLM2-360M-Instruct',
  'HuggingFaceTB/SmolLM2-135M-Instruct',
]);

/**
 * Validate chat template format.
 * CDC v2026.9 §2.2: Jinja MUST NOT be supported in v1.x
 * @throws BrowserAIError with code ERROR_TEMPLATE_FORMAT_UNSUPPORTED if jinja
 */
export function validateChatTemplateFormat(template: ChatTemplate | undefined): void {
  if (template?.format === 'jinja') {
    // Import dynamically to avoid circular dependency
    const error = {
      code: 'ERROR_TEMPLATE_FORMAT_UNSUPPORTED' as const,
      message: 'Jinja chat templates are not supported in v1.x. Use format="simple" instead.',
      recoverability: 'non-recoverable' as const,
      timestampMs: Date.now(),
      userAction: 'Change chatTemplate.format to "simple"',
      devAction: 'Remove jinja template or convert to simple format',
    };
    throw error;
  }
}
