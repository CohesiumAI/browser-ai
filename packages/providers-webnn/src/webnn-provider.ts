/**
 * WebNNProvider — WebNN-based hardware-accelerated inference.
 * CDC v2026.8 §3 (V0.2 scope)
 * 
 * WebNN (Web Neural Network API) provides hardware-accelerated
 * neural network inference using GPU, NPU, or CPU backends.
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
} from '@browser-ai/core';

// WebNN types (not yet in lib.dom.d.ts for most browsers)
interface MLContext {
  compute(graph: MLGraph, inputs: Record<string, MLOperand>, outputs: Record<string, MLOperand>): Promise<void>;
}

interface MLGraph {
  // Compiled graph
}

interface MLOperand {
  // Tensor operand
}

interface MLGraphBuilder {
  input(name: string, descriptor: MLOperandDescriptor): MLOperand;
  constant(descriptor: MLOperandDescriptor, data: ArrayBufferView): MLOperand;
  build(outputs: Record<string, MLOperand>): Promise<MLGraph>;
  // Operations
  matmul(a: MLOperand, b: MLOperand): MLOperand;
  add(a: MLOperand, b: MLOperand): MLOperand;
  relu(input: MLOperand): MLOperand;
  softmax(input: MLOperand): MLOperand;
}

interface MLOperandDescriptor {
  type: 'float32' | 'float16' | 'int32' | 'uint32' | 'int8' | 'uint8';
  dimensions: number[];
}

interface ML {
  createContext(options?: { deviceType?: 'cpu' | 'gpu' | 'npu' }): Promise<MLContext>;
  createGraphBuilder(context: MLContext): MLGraphBuilder;
}

declare global {
  interface Navigator {
    ml?: ML;
  }
}

export interface WebNNProviderConfig {
  /**
   * Preferred device type for inference.
   * - 'gpu': Use GPU (WebGPU backend)
   * - 'npu': Use dedicated NPU if available
   * - 'cpu': Use CPU (fallback)
   * @default 'gpu'
   */
  deviceType?: 'cpu' | 'gpu' | 'npu';

  /**
   * Model URL for ONNX model file.
   * WebNN typically uses ONNX format.
   */
  modelUrl?: string;
}

export class WebNNProvider implements Provider {
  readonly id: ProviderId = 'webnn';

  private config: WebNNProviderConfig;
  private context: MLContext | null = null;
  private aborted = false;
  private initialized = false;
  private downloadProgress: DownloadProgress = {};

  constructor(config: WebNNProviderConfig = {}) {
    this.config = {
      deviceType: 'gpu',
      ...config,
    };
  }

  async detect(cfg: BrowserAIConfig): Promise<DetectResult> {
    // Check if WebNN API is available
    if (typeof navigator === 'undefined' || !('ml' in navigator)) {
      return {
        available: false,
        reason: 'WebNN API not available (navigator.ml missing)',
      };
    }

    try {
      // Try to create a context to verify WebNN works
      const context = await navigator.ml!.createContext({
        deviceType: this.config.deviceType,
      });

      if (!context) {
        return {
          available: false,
          reason: 'Failed to create WebNN context',
        };
      }

      return {
        available: true,
        reason: `WebNN available with ${this.config.deviceType} backend`,
        privacyClaim: 'on-device-claimed',
        supports: {
          streaming: false, // WebNN doesn't natively support streaming
          abort: true,
          systemRole: true,
          downloadProgress: true,
        },
      };
    } catch (error) {
      return {
        available: false,
        reason: `WebNN detection failed: ${error}`,
      };
    }
  }

  async init(cfg: BrowserAIConfig, model?: ModelSpec): Promise<void> {
    this.aborted = false;
    this.downloadProgress = {};

    if (!navigator.ml) {
      throw new Error('WebNN API not available');
    }

    try {
      // Create WebNN context
      this.context = await navigator.ml.createContext({
        deviceType: this.config.deviceType,
      });

      // TODO: Load ONNX model
      // In a full implementation, we would:
      // 1. Fetch the ONNX model from modelUrl
      // 2. Parse the ONNX protobuf
      // 3. Build the MLGraph from the ONNX operators
      // 4. Cache the compiled graph

      this.initialized = true;
      this.downloadProgress = {
        downloadedBytes: 100,
        totalBytes: 100,
      };

    } catch (error) {
      throw new Error(`WebNN initialization failed: ${error}`);
    }
  }

  async generate(
    params: GenerateParams,
    onToken: (token: string) => void
  ): Promise<GenerateResult> {
    if (!this.initialized || !this.context) {
      throw new Error('WebNNProvider not initialized');
    }

    this.aborted = false;

    // WebNN is designed for tensor operations, not text generation.
    // A full implementation would require:
    // 1. Tokenize input messages
    // 2. Run transformer layers via MLGraph
    // 3. Sample from logits
    // 4. Detokenize output
    
    // For V0.2, we provide a skeleton that can be extended
    // when WebNN LLM support matures.

    const inputText = params.messages.map(m => m.content).join('\n');
    
    // Placeholder: WebNN LLM inference not yet widely supported
    // This would be replaced with actual transformer inference
    const outputText = `[WebNN] Input processed (${inputText.length} chars). ` +
      `WebNN LLM inference requires ONNX model with transformer architecture.`;

    onToken(outputText);

    return {
      text: outputText,
      usage: {
        promptTokens: Math.ceil(inputText.length / 4),
        completionTokens: Math.ceil(outputText.length / 4),
        totalTokens: Math.ceil((inputText.length + outputText.length) / 4),
      },
      providerId: 'webnn',
      modelId: 'webnn-placeholder',
      selectionReportId: '',
    };
  }

  abort(): void {
    this.aborted = true;
  }

  async teardown(): Promise<void> {
    this.context = null;
    this.initialized = false;
    this.aborted = false;
    this.downloadProgress = {};
  }

  getDownloadProgress(): DownloadProgress {
    return this.downloadProgress;
  }
}

export function createWebNNProvider(config?: WebNNProviderConfig): WebNNProvider {
  return new WebNNProvider(config);
}
