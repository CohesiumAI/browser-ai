/**
 * SmolLMProvider — Transformers.js-based inference for mobile.
 * Fallback chain: Qwen2.5-0.5B → SmolLM2-360M → SmolLM2-135M
 * All models are web-ready (ONNX/Transformers.js compatible, non-gated).
 * 
 * Spec Option A: Uses Worker on mobile for non-blocking UI + real abort.
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
} from '@cohesiumai/core';
import { SmolLMWorkerClient } from './worker-client.js';

// Dynamic import for Transformers.js to avoid SSR issues (desktop fallback)
type Pipeline = (messages: Array<{ role: string; content: string }>, options?: { max_new_tokens?: number }) => Promise<Array<{ generated_text: Array<{ role: string; content: string }> }>>;

/**
 * Whitelist of allowed HF repos for security.
 * Only web-ready, non-gated models are allowed.
 */
const ALLOWED_HF_REPOS = new Set([
  'onnx-community/Qwen2.5-0.5B-Instruct',
  'HuggingFaceTB/SmolLM2-360M-Instruct',
  'HuggingFaceTB/SmolLM2-135M-Instruct',
]);

// Model configurations for different device capabilities
const MODELS = {
  // Tier C: Ultra-light for low-end devices (<4GB RAM)
  tierC: {
    id: 'HuggingFaceTB/SmolLM2-135M-Instruct',
    sizeBytes: 100 * 1024 * 1024, // ~100MB
  },
  // Tier B: Default for most mobile devices (4GB+ RAM)
  tierB: {
    id: 'HuggingFaceTB/SmolLM2-360M-Instruct',
    sizeBytes: 250 * 1024 * 1024, // ~250MB
  },
  // Tier A: Better quality for high-end mobile (6GB+ RAM)
  tierA: {
    id: 'onnx-community/Qwen2.5-0.5B-Instruct',
    sizeBytes: 350 * 1024 * 1024, // ~350MB
  },
} as const;

function isMobileDevice(): boolean {
  return typeof navigator !== 'undefined' && 
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class SmolLMProvider implements Provider {
  readonly id: ProviderId = 'smollm' as ProviderId;

  // Worker mode (mobile)
  private workerClient: SmolLMWorkerClient | null = null;
  private useWorker: boolean = false;
  private currentRequestId: string | null = null;

  // Direct mode (desktop fallback)
  private pipeline: Pipeline | null = null;
  
  private modelId: string | null = null;
  private aborted = false;
  private downloadProgress: DownloadProgress = {};

  async detect(cfg: BrowserAIConfig): Promise<DetectResult> {
    const isMobile = isMobileDevice();
    this.useWorker = isMobile; // Use Worker on mobile for non-blocking UI

    return {
      available: true,
      reason: isMobile ? 'Mobile device - SmolLM with Worker (Option A)' : 'SmolLM available (Transformers.js)',
      privacyClaim: 'on-device-claimed',
      supports: {
        streaming: true, // Worker mode supports streaming tokens
        abort: true,     // Worker mode supports real abort via terminate
        systemRole: true,
        downloadProgress: true,
      },
    };
  }

  /**
   * Select appropriate model based on device memory.
   * Note: navigator.deviceMemory and hardwareConcurrency are capped on mobile (privacy).
   * Default to Qwen2.5-0.5B for better quality on any modern device.
   */
  private selectModel(): typeof MODELS[keyof typeof MODELS] {
    const memory = (navigator as any).deviceMemory ?? 4;
    const cores = navigator.hardwareConcurrency ?? 4;
    
    console.log(`[SmolLM] Device reported: ${memory}GB RAM (capped), ${cores} cores`);
    
    // Tier C: Very low-end devices only (<2GB RAM AND <4 cores)
    if (memory < 2 && cores < 4) {
      console.log('[SmolLM] Very low-end device → SmolLM2-135M');
      return MODELS.tierC;
    }
    
    // Tier B: Low memory but decent cores
    if (memory < 4 && cores < 6) {
      console.log('[SmolLM] Low-memory device → SmolLM2-360M');
      return MODELS.tierB;
    }
    
    // Tier A: Default for all modern devices (better quality)
    // Qwen2.5-0.5B is only 350MB, works on any phone with 4GB+ RAM
    console.log('[SmolLM] Modern device → Qwen2.5-0.5B (default for quality)');
    return MODELS.tierA;
  }

  /**
   * Validate that the model repo is in the allowed whitelist.
   * Prevents loading incompatible or gated models.
   */
  private validateModelRepo(repo: string): void {
    if (!ALLOWED_HF_REPOS.has(repo)) {
      throw new Error(`Model repo "${repo}" is not allowed. Use one of: ${[...ALLOWED_HF_REPOS].join(', ')}`);
    }
    
    // Reject MLC models (WebLLM)
    if (repo.includes('-MLC') || repo.includes('-mlc')) {
      throw new Error(`MLC models are not compatible with SmolLM provider: ${repo}`);
    }
  }

  async init(cfg: BrowserAIConfig, model?: ModelSpec, onProgress?: ProgressCallback): Promise<void> {
    this.aborted = false;
    this.downloadProgress = {};

    // Select model based on device or use provided model
    const selectedModel = model?.hfRepo ?? model?.id ?? this.selectModel().id;
    
    // Security: validate model is in whitelist
    this.validateModelRepo(selectedModel);
    
    const modelConfig = Object.values(MODELS).find(m => m.id === selectedModel) ?? MODELS.tierB;
    
    this.modelId = selectedModel;

    console.log(`[SmolLM] Loading model: ${selectedModel} (Worker mode: ${this.useWorker})`);

    // Worker mode (mobile) - non-blocking init
    if (this.useWorker) {
      const requestId = generateRequestId();
      this.workerClient = new SmolLMWorkerClient();
      
      await this.workerClient.init(requestId, selectedModel, {
        onProgress: (event) => {
          this.downloadProgress = {
            percent: event.percent,
            downloadedBytes: event.downloadedBytes,
            totalBytes: event.totalBytes,
            text: event.text,
          };
          onProgress?.(this.downloadProgress);
        },
        onReady: () => {
          console.log('[SmolLM] Worker ready');
          onProgress?.({ percent: 100, downloadedBytes: modelConfig.sizeBytes, totalBytes: modelConfig.sizeBytes, text: 'Model loaded' });
        },
        onError: (code, message) => {
          console.error(`[SmolLM] Worker init error: ${code} - ${message}`);
        },
      });
      return;
    }

    // Direct mode (desktop) - original behavior
    if (onProgress) {
      onProgress({ percent: 0, downloadedBytes: 0, totalBytes: modelConfig.sizeBytes, text: 'Loading Transformers.js...' });
    }

    try {
      const { pipeline, env } = await import('@huggingface/transformers');
      
      env.allowLocalModels = false;
      env.useBrowserCache = false;
      env.useCustomCache = false;

      if (onProgress) {
        onProgress({ percent: 10, downloadedBytes: 0, totalBytes: modelConfig.sizeBytes, text: 'Downloading model...' });
      }

      this.pipeline = await pipeline('text-generation', selectedModel, {
        progress_callback: (progress: { status: string; progress?: number; file?: string }) => {
          if (progress.status === 'progress' && progress.progress !== undefined) {
            const percent = Math.round(10 + progress.progress * 0.9);
            const downloadedBytes = Math.round((progress.progress / 100) * modelConfig.sizeBytes);
            
            this.downloadProgress = {
              percent,
              downloadedBytes,
              totalBytes: modelConfig.sizeBytes,
              text: `Downloading ${progress.file ?? 'model'}...`,
            };

            onProgress?.(this.downloadProgress);
            console.log(`[SmolLM] ${percent}% - ${progress.file ?? 'model'}`);
          }
        },
      }) as unknown as Pipeline;

      if (onProgress) {
        onProgress({ percent: 100, downloadedBytes: modelConfig.sizeBytes, totalBytes: modelConfig.sizeBytes, text: 'Model loaded' });
      }

      console.log('[SmolLM] Model loaded successfully');
    } catch (error) {
      console.error('[SmolLM] Failed to load model:', error);
      throw error;
    }
  }

  async generate(
    params: GenerateParams,
    onToken: (token: string) => void
  ): Promise<GenerateResult> {
    this.aborted = false;

    const messages = params.messages.map((m) => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    // Worker mode (mobile) - streaming with real abort
    if (this.useWorker && this.workerClient) {
      const requestId = generateRequestId();
      this.currentRequestId = requestId;

      try {
        const result = await this.workerClient.generate(
          requestId,
          messages,
          {
            maxTokens: params.maxTokens ?? 256,
            temperature: params.temperature,
            topP: params.topP,
            stream: true,
          },
          {
            onToken: (token) => {
              if (!this.aborted && this.currentRequestId === requestId) {
                onToken(token);
              }
            },
            onFinal: (text, usage) => {
              console.log('[SmolLM] Worker generation complete:', text.length, 'chars');
            },
            onError: (code, message) => {
              if (code !== 'ERROR_ABORTED') {
                console.error(`[SmolLM] Worker generation error: ${code} - ${message}`);
              }
            },
          }
        );

        this.currentRequestId = null;

        // Handle aborted result
        if ((result as any).aborted || this.aborted) {
          return {
            text: '',
            usage: {},
            providerId: 'smollm' as ProviderId,
            modelId: this.modelId ?? undefined,
            selectionReportId: '',
          };
        }

        return {
          text: result.text,
          usage: result.usage ? { completionTokens: result.usage.completionTokens } : {},
          providerId: 'smollm' as ProviderId,
          modelId: this.modelId ?? undefined,
          selectionReportId: '',
        };
      } catch (error) {
        this.currentRequestId = null;
        if (this.aborted) {
          return {
            text: '',
            usage: {},
            providerId: 'smollm' as ProviderId,
            modelId: this.modelId ?? undefined,
            selectionReportId: '',
          };
        }
        throw error;
      }
    }

    // Direct mode (desktop) - original behavior
    if (!this.pipeline) {
      throw new Error('SmolLMProvider not initialized');
    }

    try {
      const output = await this.pipeline(messages, {
        max_new_tokens: params.maxTokens ?? 256,
      });

      if (this.aborted) {
        return {
          text: '',
          usage: {},
          providerId: 'smollm' as ProviderId,
          modelId: this.modelId ?? undefined,
          selectionReportId: '',
        };
      }

      const generatedMessages = output[0]?.generated_text ?? [];
      const assistantMessages = generatedMessages.filter((m: { role: string }) => m.role === 'assistant');
      const lastAssistant = assistantMessages[assistantMessages.length - 1];
      const fullText = lastAssistant?.content ?? '';

      onToken(fullText);

      return {
        text: fullText,
        usage: {
          completionTokens: Math.ceil(fullText.length / 4),
        },
        providerId: 'smollm' as ProviderId,
        modelId: this.modelId ?? undefined,
        selectionReportId: '',
      };
    } catch (error) {
      console.error('[SmolLM] Generation failed:', error);
      throw error;
    }
  }

  abort(): void {
    this.aborted = true;
    
    // Worker mode: real abort via worker terminate
    if (this.useWorker && this.workerClient && this.currentRequestId) {
      console.log('[SmolLM] Aborting via Worker terminate');
      this.workerClient.abort(this.currentRequestId);
      this.currentRequestId = null;
    }
  }

  async teardown(): Promise<void> {
    // Worker mode cleanup
    if (this.workerClient) {
      await this.workerClient.teardown();
      this.workerClient = null;
    }
    
    // Direct mode cleanup
    this.pipeline = null;
    this.modelId = null;
    this.aborted = false;
    this.currentRequestId = null;
    this.downloadProgress = {};
    console.log('[SmolLM] Provider teardown complete');
  }

  getDownloadProgress(): DownloadProgress & { text?: string } {
    return {
      ...this.downloadProgress,
    };
  }
}

export function createSmolLMProvider(): SmolLMProvider {
  return new SmolLMProvider();
}
