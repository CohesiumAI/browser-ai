/**
 * WebLLMProvider — WebGPU-based inference.
 * CDC v2026.8 §9
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

import * as webllm from '@mlc-ai/web-llm';

// Custom appConfig with correct mlc-ai/ URLs
// WebLLM's prebuiltAppConfig should work but we explicitly define to avoid URL issues
const MODEL_CONFIGS: Record<string, { model: string; model_lib: string }> = {
  'Llama-3.2-1B-Instruct-q4f32_1-MLC': {
    model: 'https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f32_1-MLC',
    model_lib: `${webllm.modelLibURLPrefix}${webllm.modelVersion}/Llama-3.2-1B-Instruct-q4f32_1-ctx4k_cs1k-webgpu.wasm`,
  },
  'Llama-3.2-1B-Instruct-q4f16_1-MLC': {
    model: 'https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC',
    model_lib: `${webllm.modelLibURLPrefix}${webllm.modelVersion}/Llama-3.2-1B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`,
  },
  'Llama-3.1-8B-Instruct-q4f16_1-MLC': {
    model: 'https://huggingface.co/mlc-ai/Llama-3.1-8B-Instruct-q4f16_1-MLC',
    // WASM filename uses underscore (3_1) not dot (3.1)
    model_lib: `${webllm.modelLibURLPrefix}${webllm.modelVersion}/Llama-3_1-8B-Instruct-q4f16_1-ctx4k_cs1k-webgpu.wasm`,
  },
};

// Timeout for chat.completions.create call (ms)
const GENERATION_TIMEOUT_MS = 120_000;
// Max retries after engine corruption
const MAX_ENGINE_RETRIES = 1;

export class WebLLMProvider implements Provider {
  readonly id: ProviderId = 'webllm';

  private engine: webllm.MLCEngine | null = null;
  private modelId: string | null = null;
  private aborted = false;
  private downloadProgress: DownloadProgress = {};
  private progressText: string = '';
  
  // Engine corruption recovery state
  private needsRecreateEngine = false;
  private lastModelToLoad: string | null = null;
  private lastModelSizeBytes: number = 0;
  private lastAppConfig: webllm.AppConfig | null = null;
  // Callback to notify core when engine is recreated (resets watchdog timing)
  private onRecreateCallback: (() => void) | null = null;

  async detect(cfg: BrowserAIConfig): Promise<DetectResult> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
      return {
        available: false,
        reason: 'WebGPU not available',
      };
    }

    try {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (!adapter) {
        return {
          available: false,
          reason: 'No WebGPU adapter found',
        };
      }

      return {
        available: true,
        reason: 'WebGPU available',
        privacyClaim: 'on-device-claimed',
        supports: {
          streaming: true,
          abort: true,
          systemRole: true,
          downloadProgress: true,
        },
      };
    } catch (error) {
      return {
        available: false,
        reason: `WebGPU check failed: ${error}`,
      };
    }
  }

  async init(cfg: BrowserAIConfig, model?: ModelSpec, onProgress?: ProgressCallback): Promise<void> {
    this.aborted = false;
    this.downloadProgress = {};
    this.progressText = 'Initializing...';

    // WebLLM prebuiltAppConfig expects exact-case model_id (e.g. "Llama-3.2-1B-Instruct-q4f32_1-MLC")
    // hfRepo contains correct casing; id is lowercase for CDC compatibility
    const modelToLoad = model?.hfRepo ?? model?.id ?? 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
    this.modelId = model?.id ?? modelToLoad;
    const modelSizeBytes = model?.sizeBytes ?? 700 * 1024 * 1024;

    const prebuiltEntry = webllm.prebuiltAppConfig.model_list.find((m) => m.model_id === modelToLoad);
    if (!prebuiltEntry) {
      throw new Error(`[WebLLM] Model "${modelToLoad}" not found in prebuiltAppConfig`);
    }

    const modelConfig = MODEL_CONFIGS[modelToLoad];
    const modelEntry = {
      ...prebuiltEntry,
      model: modelConfig?.model ?? prebuiltEntry.model,
      model_id: modelToLoad,
      model_lib: modelConfig?.model_lib ?? prebuiltEntry.model_lib,
    };

    console.log(`[WebLLM] Loading model: ${modelToLoad} from ${modelEntry.model}`);

    const appConfig: webllm.AppConfig = {
      model_list: [modelEntry],
    };

    // Store config for potential engine recreation after abort
    this.lastModelToLoad = modelToLoad;
    this.lastModelSizeBytes = modelSizeBytes;
    this.lastAppConfig = appConfig;
    this.needsRecreateEngine = false;

    this.engine = await webllm.CreateMLCEngine(modelToLoad, {
      appConfig,
      initProgressCallback: (progress: { progress: number; text: string }) => {
        const percent = Math.round(progress.progress * 100);
        const downloadedBytes = Math.round(progress.progress * modelSizeBytes);
        
        this.progressText = progress.text;
        this.downloadProgress = {
          downloadedBytes,
          totalBytes: modelSizeBytes,
          percent,
          text: progress.text,
        };

        // Notify the core via callback
        if (onProgress) {
          onProgress(this.downloadProgress);
        }

        console.log(`[WebLLM] ${percent}% - ${progress.text}`);
      },
    });
    
    this.progressText = 'Model loaded';
    
    // Final progress callback
    if (onProgress) {
      onProgress({ percent: 100, downloadedBytes: modelSizeBytes, totalBytes: modelSizeBytes, text: 'Model loaded' });
    }
  }

  /**
   * Recreate engine after abort corruption.
   * Uses cached model from init, so it loads from browser cache (fast).
   */
  private async recreateEngine(): Promise<void> {
    if (!this.lastModelToLoad || !this.lastAppConfig) {
      throw new Error('[WebLLM] Cannot recreate engine: no previous init config');
    }

    console.log('[WebLLM] Recreating engine after abort corruption...');
    
    // Unload corrupted engine
    if (this.engine) {
      try {
        await this.engine.unload();
      } catch (e) {
        console.warn('[WebLLM] Error unloading corrupted engine:', e);
      }
      this.engine = null;
    }

    // Recreate engine (model loads from cache, should be fast)
    this.engine = await webllm.CreateMLCEngine(this.lastModelToLoad, {
      appConfig: this.lastAppConfig,
      initProgressCallback: (progress: { progress: number; text: string }) => {
        console.log(`[WebLLM] Recreate: ${Math.round(progress.progress * 100)}% - ${progress.text}`);
      },
    });

    this.needsRecreateEngine = false;
    console.log('[WebLLM] Engine recreated successfully');

    // Notify core to reset watchdog timing now that engine is ready
    if (this.onRecreateCallback) {
      this.onRecreateCallback();
    }
  }

  async generate(
    params: GenerateParams,
    onToken: (token: string) => void
  ): Promise<GenerateResult> {
    return this.generateWithRetry(params, onToken, 0);
  }

  /**
   * Internal generate with retry logic for engine corruption recovery.
   */
  private async generateWithRetry(
    params: GenerateParams,
    onToken: (token: string) => void,
    retryCount: number
  ): Promise<GenerateResult> {
    // Store onRecreate callback for use in recreateEngine
    this.onRecreateCallback = params.onRecreate ?? null;

    // Recreate engine if flagged as corrupted (after previous abort)
    if (this.needsRecreateEngine) {
      await this.recreateEngine();
    }

    if (!this.engine) {
      throw new Error('WebLLMProvider not initialized');
    }

    this.aborted = false;

    // Reset chat state before each generation
    try {
      await this.engine.resetChat();
    } catch (e) {
      if (retryCount < MAX_ENGINE_RETRIES) {
        console.warn('[WebLLM] resetChat failed, recreating engine...', e);
        this.needsRecreateEngine = true;
        return this.generateWithRetry(params, onToken, retryCount + 1);
      }
      throw e;
    }

    const messages = params.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    let fullText = '';
    let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } = {};

    if (params.stream !== false) {
      console.log('[WebLLM] Starting streaming generation with messages:', messages.length);
      
      // Wrap stream creation in timeout to detect hung engine
      let stream: AsyncIterable<webllm.ChatCompletionChunk>;
      try {
        stream = await this.createStreamWithTimeout(messages, params);
      } catch (error) {
        if (String(error).includes('ERROR_ABORTED') || this.aborted) {
          throw error;
        }
        // Timeout or error creating stream - engine likely corrupted
        if (retryCount < MAX_ENGINE_RETRIES) {
          console.warn('[WebLLM] Stream creation failed:', error);
          console.warn(`[WebLLM] Retrying (${retryCount + 1}/${MAX_ENGINE_RETRIES})...`);
          this.needsRecreateEngine = true;
          return this.generateWithRetry(params, onToken, retryCount + 1);
        }
        throw error;
      }
      
      console.log('[WebLLM] Stream created, iterating...');

      let chunkCount = 0;
      let lastChunkTime = Date.now();

      const abortController = new AbortController();
      const abortIntervalId = setInterval(() => {
        if (this.aborted) abortController.abort();
      }, 50);
      const abortPromise = new Promise<never>((_, reject) => {
        abortController.signal.addEventListener('abort', () => reject(new Error('ERROR_ABORTED')), { once: true });
      });

      const iterator = stream[Symbol.asyncIterator]();
      try {
        while (true) {
          const result = (await Promise.race([iterator.next(), abortPromise])) as IteratorResult<webllm.ChatCompletionChunk>;
          if (result.done) break;

          const chunk = result.value;
          chunkCount++;
          lastChunkTime = Date.now();

          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onToken(delta);
          }

          if (chunk.usage) {
            usage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            };
          }
        }
      } finally {
        clearInterval(abortIntervalId);
        if (this.aborted) {
          try {
            await iterator.return?.();
          } catch {
            // ignore
          }
        }
      }
      console.log(`[WebLLM] Stream finished. Chunks: ${chunkCount}, Text length: ${fullText.length}`);
    } else {
      // Non-streaming with timeout
      const response = await this.createCompletionWithTimeout(messages, params);

      fullText = response.choices[0]?.message?.content ?? '';
      onToken(fullText);

      if (response.usage) {
        usage = {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        };
      }
    }

    return {
      text: fullText,
      usage,
      providerId: 'webllm',
      modelId: this.modelId ?? undefined,
      selectionReportId: '',
    };
  }

  /**
   * Create streaming completion with timeout.
   */
  private async createStreamWithTimeout(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    params: GenerateParams
  ): Promise<AsyncIterable<webllm.ChatCompletionChunk>> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT_STREAM_CREATE')), GENERATION_TIMEOUT_MS);
    });

    const abortController = new AbortController();
    const abortIntervalId = setInterval(() => {
      if (this.aborted) abortController.abort();
    }, 50);
    const abortPromise = new Promise<never>((_, reject) => {
      abortController.signal.addEventListener('abort', () => reject(new Error('ERROR_ABORTED')), { once: true });
    });

    const createPromise = this.engine!.chat.completions.create({
      messages,
      max_tokens: params.maxTokens ?? 256,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 1.0,
      stop: params.stop,
      stream: true,
      stream_options: { include_usage: true },
    });

    try {
      return await Promise.race([createPromise, timeoutPromise, abortPromise]);
    } finally {
      clearInterval(abortIntervalId);
    }
  }

  /**
   * Create non-streaming completion with timeout.
   */
  private async createCompletionWithTimeout(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    params: GenerateParams
  ): Promise<webllm.ChatCompletion> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT_COMPLETION')), GENERATION_TIMEOUT_MS);
    });

    const abortController = new AbortController();
    const abortIntervalId = setInterval(() => {
      if (this.aborted) abortController.abort();
    }, 50);
    const abortPromise = new Promise<never>((_, reject) => {
      abortController.signal.addEventListener('abort', () => reject(new Error('ERROR_ABORTED')), { once: true });
    });

    const createPromise = this.engine!.chat.completions.create({
      messages,
      max_tokens: params.maxTokens ?? 256,
      temperature: params.temperature ?? 0.7,
      top_p: params.topP ?? 1.0,
      stop: params.stop,
      stream: false,
    });

    try {
      return (await Promise.race([createPromise, timeoutPromise, abortPromise])) as webllm.ChatCompletion;
    } finally {
      clearInterval(abortIntervalId);
    }
  }

  abort(): void {
    this.aborted = true;
    try {
      this.engine?.interruptGenerate();
    } catch (e) {
      // Flag engine for recreation on next generate (workaround for WebLLM bug)
      this.needsRecreateEngine = true;
      console.warn('[WebLLM] interruptGenerate failed; engine flagged for recreation', e);
    }
    // Workaround: abort can corrupt internal state; recreate lazily on next generate.
    this.needsRecreateEngine = true;
    console.log('[WebLLM] Abort called');
  }

  async teardown(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
    this.modelId = null;
    this.aborted = false;
    this.downloadProgress = {};
    this.needsRecreateEngine = false;
    this.lastModelToLoad = null;
    this.lastAppConfig = null;
  }

  getDownloadProgress(): DownloadProgress & { text?: string } {
    return {
      ...this.downloadProgress,
      text: this.progressText,
    };
  }
}

export function createWebLLMProvider(): WebLLMProvider {
  return new WebLLMProvider();
}

export async function clearWebLLMModelCache(modelIds?: string[]): Promise<void> {
  const ids = modelIds ?? [
    'Llama-3.1-8B-Instruct-q4f16_1-MLC',
    'Llama-3.2-1B-Instruct-q4f16_1-MLC',
    'Llama-3.2-1B-Instruct-q4f32_1-MLC',
  ];

  await Promise.allSettled(ids.map((id) => webllm.deleteModelAllInfoInCache(id, undefined)));
}
