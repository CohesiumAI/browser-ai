/**
 * WASMProvider  WebAssembly-based fallback inference using Transformers.js.
 * CDC v2026.8 §3 (V0.2 scope)
 * 
 * Uses ONNX Runtime WASM backend via @huggingface/transformers.
 * Provides universal browser compatibility when WebGPU is unavailable.
 * 100% local, works on mobile devices.
 */

import type {
  Provider,
  DetectResult,
  BrowserAIConfig,
  GenerateParams,
  GenerateResult,
  ModelSpec,
  ProviderId,
  DownloadProgress,
  ProgressCallback,
} from '@browser-ai/core';

type Pipeline = (prompt: string, options?: Record<string, unknown>) => Promise<Array<{ generated_text: string }>>;

export interface WASMProviderConfig {
  defaultModel?: string;
  quantized?: boolean;
}

const DEFAULT_MODEL = 'HuggingFaceTB/SmolLM2-135M-Instruct';

export class WASMProvider implements Provider {
  readonly id: ProviderId = 'wasm';

  private config: WASMProviderConfig;
  private generator: Pipeline | null = null;
  private modelId: string | null = null;
  private aborted = false;
  private initialized = false;
  private downloadProgress: DownloadProgress = {};
  private progressText = '';

  constructor(config: WASMProviderConfig = {}) {
    this.config = {
      defaultModel: DEFAULT_MODEL,
      quantized: true,
      ...config,
    };
  }

  async detect(_cfg: BrowserAIConfig): Promise<DetectResult> {
    if (typeof WebAssembly === 'undefined') {
      return { available: false, reason: 'WebAssembly not available' };
    }
    return {
      available: true,
      reason: 'WASM available',
      privacyClaim: 'on-device-claimed',
      supports: { streaming: true, abort: true, systemRole: true, downloadProgress: true },
    };
  }

  async init(_cfg: BrowserAIConfig, model?: ModelSpec, onProgress?: ProgressCallback): Promise<void> {
    this.aborted = false;
    this.downloadProgress = { downloadedBytes: 0, totalBytes: 100, percent: 0 };
    const modelToLoad = model?.hfRepo ?? model?.id ?? this.config.defaultModel!;
    this.modelId = model?.id ?? modelToLoad;
    console.log('[WASM] Loading model:', modelToLoad);

    try {
      const transformers = await import('@huggingface/transformers');
      // Transformers.js auto-selects WASM when WebGPU unavailable

      this.generator = await transformers.pipeline('text-generation', modelToLoad, {
        device: 'wasm',
        dtype: 'q4',
        progress_callback: (p: { status: string; progress?: number; file?: string }) => {
          if (p.status === 'progress' && p.progress !== undefined) {
            const percent = Math.round(p.progress);
            this.downloadProgress = { percent, downloadedBytes: percent, totalBytes: 100, text: 'Downloading...' };
            if (onProgress) onProgress(this.downloadProgress);
            console.log('[WASM]', percent, '%');
          }
        },
      }) as unknown as Pipeline;

      this.initialized = true;
      this.downloadProgress = { percent: 100, downloadedBytes: 100, totalBytes: 100, text: 'Model ready' };
      if (onProgress) onProgress(this.downloadProgress);
      console.log('[WASM] Model loaded');
    } catch (error) {
      console.error('[WASM] Init failed:', error);
      throw new Error('WASM initialization failed: ' + error);
    }
  }

  async generate(params: GenerateParams, onToken: (token: string) => void): Promise<GenerateResult> {
    if (!this.initialized || !this.generator) throw new Error('WASMProvider not initialized');
    this.aborted = false;
    const prompt = this.buildPrompt(params.messages);
    console.log('[WASM] Generating for prompt length:', prompt.length);

    try {
      const result = await this.generator(prompt, {
        max_new_tokens: params.maxTokens ?? 256,
        temperature: params.temperature ?? 0.7,
        top_p: params.topP ?? 0.9,
        do_sample: true,
      });
      const generated = Array.isArray(result) ? result[0] : result;
      const outputText = generated?.generated_text ?? '';
      const fullText = outputText.slice(prompt.length);
      onToken(fullText);
      return {
        text: fullText,
        usage: { promptTokens: Math.ceil(prompt.length / 4), completionTokens: Math.ceil(fullText.length / 4), totalTokens: Math.ceil((prompt.length + fullText.length) / 4) },
        providerId: 'wasm',
        modelId: this.modelId ?? 'wasm-transformers',
        selectionReportId: '',
      };
    } catch (error) {
      if (this.aborted) return { text: '', usage: {}, providerId: 'wasm', modelId: this.modelId ?? undefined, selectionReportId: '' };
      throw error;
    }
  }

  private buildPrompt(messages: Array<{ role: string; content: string }>): string {
    let prompt = '';
    for (const msg of messages) {
      if (msg.role === 'system') prompt += '<|im_start|>system\n' + msg.content + '<|im_end|>\n';
      else if (msg.role === 'user') prompt += '<|im_start|>user\n' + msg.content + '<|im_end|>\n';
      else if (msg.role === 'assistant') prompt += '<|im_start|>assistant\n' + msg.content + '<|im_end|>\n';
    }
    prompt += '<|im_start|>assistant\n';
    return prompt;
  }

  abort(): void { this.aborted = true; }

  async teardown(): Promise<void> {
    this.generator = null;
    this.modelId = null;
    this.initialized = false;
    this.aborted = false;
    this.downloadProgress = {};
  }

  getDownloadProgress(): DownloadProgress {
    return { ...this.downloadProgress, text: this.progressText };
  }
}

export function createWASMProvider(config?: WASMProviderConfig): WASMProvider {
  return new WASMProvider(config);
}
