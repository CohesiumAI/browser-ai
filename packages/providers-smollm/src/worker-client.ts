/**
 * SmolLMWorkerClient — Main thread proxy for SmolLM Worker.
 * Handles worker lifecycle, message routing, and abort via terminate.
 */

// Worker protocol types (defined locally to avoid build order issues)
export type StreamPhase = 'download' | 'init' | 'warmup' | 'generate';

type WorkerIn =
  | { v: 1; type: 'INIT'; requestId: string; modelId: string }
  | { v: 1; type: 'GENERATE'; requestId: string; messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; maxTokens: number; temperature?: number; topP?: number; stream: boolean }
  | { v: 1; type: 'ABORT'; requestId: string; reason: 'USER' | 'TIMEOUT' }
  | { v: 1; type: 'TEARDOWN'; requestId: string };

type WorkerOut =
  | { v: 1; type: 'READY'; requestId: string; modelId: string }
  | { v: 1; type: 'PROGRESS'; requestId: string; phase: StreamPhase; percent?: number; text?: string; downloadedBytes?: number; totalBytes?: number }
  | { v: 1; type: 'TOKEN'; requestId: string; token: string }
  | { v: 1; type: 'FINAL'; requestId: string; text: string; usage?: { completionTokens?: number } }
  | { v: 1; type: 'ERROR'; requestId: string; code: 'ERROR_ABORTED' | 'ERROR_OOM' | 'ERROR_MODEL_LOAD' | 'ERROR_UNKNOWN'; message: string };

export interface WorkerClientCallbacks {
  onProgress?: (event: { phase: StreamPhase; percent?: number; text?: string; downloadedBytes?: number; totalBytes?: number }) => void;
  onToken?: (token: string) => void;
  onFinal?: (text: string, usage?: { completionTokens?: number }) => void;
  onError?: (code: string, message: string) => void;
  onReady?: (modelId: string) => void;
}

export class SmolLMWorkerClient {
  private worker: Worker | null = null;
  private currentRequestId: string | null = null;
  private callbacks: Map<string, WorkerClientCallbacks> = new Map();
  private workerUrl: URL;
  private pendingResolvers: Map<string, { resolve: (v: any) => void; reject: (e: any) => void }> = new Map();

  constructor() {
    // Worker URL resolved relative to this module
    this.workerUrl = new URL('./smollm.worker.js', import.meta.url);
  }

  private createWorker(): Worker {
    const worker = new Worker(this.workerUrl, { type: 'module' });
    worker.onmessage = this.handleMessage.bind(this);
    worker.onerror = this.handleError.bind(this);
    return worker;
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = this.createWorker();
    }
    return this.worker;
  }

  private handleMessage(event: MessageEvent<WorkerOut>): void {
    const msg = event.data;
    if (msg.v !== 1) return;

    const callbacks = this.callbacks.get(msg.requestId);
    const resolver = this.pendingResolvers.get(msg.requestId);

    switch (msg.type) {
      case 'READY':
        callbacks?.onReady?.(msg.modelId);
        resolver?.resolve({ modelId: msg.modelId });
        this.pendingResolvers.delete(msg.requestId);
        break;

      case 'PROGRESS':
        callbacks?.onProgress?.({
          phase: msg.phase,
          percent: msg.percent,
          text: msg.text,
          downloadedBytes: msg.downloadedBytes,
          totalBytes: msg.totalBytes,
        });
        break;

      case 'TOKEN':
        callbacks?.onToken?.(msg.token);
        break;

      case 'FINAL':
        callbacks?.onFinal?.(msg.text, msg.usage);
        resolver?.resolve({ text: msg.text, usage: msg.usage });
        this.pendingResolvers.delete(msg.requestId);
        this.callbacks.delete(msg.requestId);
        this.currentRequestId = null;
        break;

      case 'ERROR':
        callbacks?.onError?.(msg.code, msg.message);
        resolver?.reject(new Error(`${msg.code}: ${msg.message}`));
        this.pendingResolvers.delete(msg.requestId);
        this.callbacks.delete(msg.requestId);
        this.currentRequestId = null;
        break;
    }
  }

  private handleError(event: ErrorEvent): void {
    console.error('[SmolLMWorkerClient] Worker error:', event.message);
    if (this.currentRequestId) {
      const callbacks = this.callbacks.get(this.currentRequestId);
      callbacks?.onError?.('ERROR_UNKNOWN', event.message);
      const resolver = this.pendingResolvers.get(this.currentRequestId);
      resolver?.reject(new Error(event.message));
      this.pendingResolvers.delete(this.currentRequestId);
      this.callbacks.delete(this.currentRequestId);
      this.currentRequestId = null;
    }
  }

  private post(msg: WorkerIn): void {
    this.ensureWorker().postMessage(msg);
  }

  async init(requestId: string, modelId: string, callbacks?: WorkerClientCallbacks): Promise<{ modelId: string }> {
    if (callbacks) {
      this.callbacks.set(requestId, callbacks);
    }

    return new Promise((resolve, reject) => {
      this.pendingResolvers.set(requestId, { resolve, reject });
      this.post({ v: 1, type: 'INIT', requestId, modelId });
    });
  }

  async generate(
    requestId: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: { maxTokens: number; temperature?: number; topP?: number; stream?: boolean },
    callbacks: WorkerClientCallbacks
  ): Promise<{ text: string; usage?: { completionTokens?: number } }> {
    this.currentRequestId = requestId;
    this.callbacks.set(requestId, callbacks);

    return new Promise((resolve, reject) => {
      this.pendingResolvers.set(requestId, { resolve, reject });
      this.post({
        v: 1,
        type: 'GENERATE',
        requestId,
        messages,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        stream: options.stream ?? true,
      });
    });
  }

  /**
   * Abort current generation. Uses worker.terminate() for immediate stop.
   * Returns true if abort was performed.
   */
  abort(requestId: string): boolean {
    if (this.currentRequestId !== requestId) {
      return false;
    }

    // First try cooperative abort
    this.post({ v: 1, type: 'ABORT', requestId, reason: 'USER' });

    // Then terminate worker for immediate effect (hard stop)
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    // Clean up state
    const resolver = this.pendingResolvers.get(requestId);
    if (resolver) {
      // Resolve with partial (not reject) - UI handles aborted state
      resolver.resolve({ text: '', aborted: true });
    }
    this.pendingResolvers.delete(requestId);
    this.callbacks.delete(requestId);
    this.currentRequestId = null;

    return true;
  }

  /**
   * Check if generation is in progress for given requestId.
   */
  isGenerating(requestId?: string): boolean {
    if (requestId) {
      return this.currentRequestId === requestId;
    }
    return this.currentRequestId !== null;
  }

  async teardown(): Promise<void> {
    if (this.worker) {
      const requestId = `teardown-${Date.now()}`;
      this.post({ v: 1, type: 'TEARDOWN', requestId });
      this.worker.terminate();
      this.worker = null;
    }
    this.callbacks.clear();
    this.pendingResolvers.clear();
    this.currentRequestId = null;
  }
}
