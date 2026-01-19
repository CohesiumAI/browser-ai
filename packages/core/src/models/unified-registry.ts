/**
 * UnifiedModelRegistry — Central manager for all AI models across modules.
 * Coordinates memory usage between core (WebLLM) and modules (Transformers.js, ONNX, Tesseract).
 * 
 * Features:
 * - Reference counting: models stay loaded while in use
 * - Auto-teardown: unload after idle timeout
 * - Lazy loading: load on first use, not at init()
 * - LRU eviction: free memory when threshold reached
 * - Shared instances: same model used by multiple consumers
 */

export type ModelBackend = 'transformers' | 'onnx' | 'tesseract' | 'webllm';

export interface RegisteredModel {
  id: string;
  backend: ModelBackend;
  instance: unknown;
  sizeEstimateMB: number;
  refCount: number;
  loadedAtMs: number;
  lastUsedAtMs: number;
  idleTimeoutMs?: number;
  idleTimer?: ReturnType<typeof setTimeout>;
}

export interface UnifiedRegistryConfig {
  /**
   * Maximum total memory usage in MB before LRU eviction kicks in.
   * @default 1500
   */
  maxMemoryMB?: number;

  /**
   * Default idle timeout in ms before auto-unload (0 = disabled).
   * @default 300000 (5 minutes)
   */
  defaultIdleTimeoutMs?: number;

  /**
   * Callback when a model is evicted.
   */
  onEvict?: (modelId: string, reason: 'lru' | 'idle' | 'manual') => void;
}

export interface AcquireOptions {
  /**
   * Custom idle timeout for this model (overrides default).
   */
  idleTimeoutMs?: number;

  /**
   * Estimated memory size in MB (for LRU decisions).
   */
  sizeEstimateMB?: number;
}

export interface UnifiedModelRegistry {
  /**
   * Acquire a model. If not loaded, calls loader function.
   * Increments reference count.
   */
  acquire<T>(
    modelId: string,
    backend: ModelBackend,
    loader: () => Promise<T>,
    options?: AcquireOptions
  ): Promise<T>;

  /**
   * Release a model reference. Decrements reference count.
   * If refCount reaches 0, starts idle timer.
   */
  release(modelId: string): void;

  /**
   * Force unload a model immediately.
   */
  unload(modelId: string): Promise<void>;

  /**
   * Unload all models.
   */
  unloadAll(): Promise<void>;

  /**
   * Get current memory usage estimate.
   */
  getMemoryUsage(): { totalMB: number; models: Array<{ id: string; sizeMB: number; refCount: number }> };

  /**
   * Check if a model is loaded.
   */
  isLoaded(modelId: string): boolean;

  /**
   * Get model info.
   */
  getModel(modelId: string): RegisteredModel | undefined;

  /**
   * Run LRU eviction to free memory.
   */
  evictLRU(targetFreeMB?: number): Promise<string[]>;
}

const DEFAULT_CONFIG: Required<Omit<UnifiedRegistryConfig, 'onEvict'>> = {
  maxMemoryMB: 1500,
  defaultIdleTimeoutMs: 5 * 60 * 1000, // 5 minutes
};

// Estimated memory sizes for common models (MB)
const MODEL_SIZE_ESTIMATES: Record<string, number> = {
  'Xenova/whisper-tiny': 150,
  'Xenova/whisper-base': 300,
  'Xenova/all-MiniLM-L6-v2': 90,
  'Xenova/vit-gpt2-image-captioning': 350,
  'silero-vad': 10,
  'tesseract-eng': 15,
  'tesseract-fra': 15,
};

function estimateModelSize(modelId: string, providedSize?: number): number {
  if (providedSize) return providedSize;
  
  // Check known models
  for (const [key, size] of Object.entries(MODEL_SIZE_ESTIMATES)) {
    if (modelId.includes(key)) return size;
  }
  
  // Default estimate
  return 100;
}

/**
 * Create a UnifiedModelRegistry instance.
 */
export function createUnifiedRegistry(config: UnifiedRegistryConfig = {}): UnifiedModelRegistry {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const models = new Map<string, RegisteredModel>();
  const unloadFunctions = new Map<string, () => Promise<void>>();

  function getTotalMemoryMB(): number {
    let total = 0;
    for (const model of models.values()) {
      total += model.sizeEstimateMB;
    }
    return total;
  }

  function clearIdleTimer(modelId: string): void {
    const model = models.get(modelId);
    if (model?.idleTimer) {
      clearTimeout(model.idleTimer);
      model.idleTimer = undefined;
    }
  }

  function startIdleTimer(modelId: string): void {
    const model = models.get(modelId);
    if (!model) return;

    const timeout = model.idleTimeoutMs ?? cfg.defaultIdleTimeoutMs;
    if (timeout <= 0) return;

    clearIdleTimer(modelId);

    model.idleTimer = setTimeout(async () => {
      const currentModel = models.get(modelId);
      if (currentModel && currentModel.refCount === 0) {
        console.log(`[UnifiedRegistry] Idle timeout: unloading ${modelId}`);
        await unloadInternal(modelId, 'idle');
      }
    }, timeout);
  }

  async function unloadInternal(modelId: string, reason: 'lru' | 'idle' | 'manual'): Promise<void> {
    const model = models.get(modelId);
    if (!model) return;

    clearIdleTimer(modelId);

    // Call custom unload function if registered
    const unloadFn = unloadFunctions.get(modelId);
    if (unloadFn) {
      try {
        await unloadFn();
      } catch (err) {
        console.warn(`[UnifiedRegistry] Unload error for ${modelId}:`, err);
      }
      unloadFunctions.delete(modelId);
    }

    models.delete(modelId);
    config.onEvict?.(modelId, reason);
    console.log(`[UnifiedRegistry] Unloaded ${modelId} (reason: ${reason})`);
  }

  async function evictLRUInternal(targetFreeMB?: number): Promise<string[]> {
    const target = targetFreeMB ?? (getTotalMemoryMB() - cfg.maxMemoryMB);
    if (target <= 0) return [];

    // Sort by lastUsedAtMs (oldest first), exclude models with refCount > 0
    const candidates = Array.from(models.values())
      .filter(m => m.refCount === 0)
      .sort((a, b) => a.lastUsedAtMs - b.lastUsedAtMs);

    const evicted: string[] = [];
    let freed = 0;

    for (const model of candidates) {
      if (freed >= target) break;

      await unloadInternal(model.id, 'lru');
      evicted.push(model.id);
      freed += model.sizeEstimateMB;
    }

    return evicted;
  }

  return {
    async acquire<T>(
      modelId: string,
      backend: ModelBackend,
      loader: () => Promise<T>,
      options?: AcquireOptions
    ): Promise<T> {
      // Check if already loaded
      const existing = models.get(modelId);
      if (existing) {
        existing.refCount++;
        existing.lastUsedAtMs = Date.now();
        clearIdleTimer(modelId);
        console.log(`[UnifiedRegistry] Reusing ${modelId} (refCount: ${existing.refCount})`);
        return existing.instance as T;
      }

      const sizeEstimate = estimateModelSize(modelId, options?.sizeEstimateMB);

      // Check if we need to evict before loading
      const currentUsage = getTotalMemoryMB();
      if (currentUsage + sizeEstimate > cfg.maxMemoryMB) {
        console.log(`[UnifiedRegistry] Memory pressure: ${currentUsage}MB + ${sizeEstimate}MB > ${cfg.maxMemoryMB}MB`);
        await evictLRUInternal(sizeEstimate);
      }

      // Load the model
      console.log(`[UnifiedRegistry] Loading ${modelId} (${backend}, ~${sizeEstimate}MB)`);
      const instance = await loader();

      const model: RegisteredModel = {
        id: modelId,
        backend,
        instance,
        sizeEstimateMB: sizeEstimate,
        refCount: 1,
        loadedAtMs: Date.now(),
        lastUsedAtMs: Date.now(),
        idleTimeoutMs: options?.idleTimeoutMs,
      };

      models.set(modelId, model);
      console.log(`[UnifiedRegistry] Loaded ${modelId} (total: ${getTotalMemoryMB()}MB)`);

      return instance;
    },

    release(modelId: string): void {
      const model = models.get(modelId);
      if (!model) return;

      model.refCount = Math.max(0, model.refCount - 1);
      console.log(`[UnifiedRegistry] Released ${modelId} (refCount: ${model.refCount})`);

      if (model.refCount === 0) {
        startIdleTimer(modelId);
      }
    },

    async unload(modelId: string): Promise<void> {
      await unloadInternal(modelId, 'manual');
    },

    async unloadAll(): Promise<void> {
      const ids = Array.from(models.keys());
      for (const id of ids) {
        await unloadInternal(id, 'manual');
      }
    },

    getMemoryUsage(): { totalMB: number; models: Array<{ id: string; sizeMB: number; refCount: number }> } {
      const modelList = Array.from(models.values()).map(m => ({
        id: m.id,
        sizeMB: m.sizeEstimateMB,
        refCount: m.refCount,
      }));

      return {
        totalMB: getTotalMemoryMB(),
        models: modelList,
      };
    },

    isLoaded(modelId: string): boolean {
      return models.has(modelId);
    },

    getModel(modelId: string): RegisteredModel | undefined {
      return models.get(modelId);
    },

    async evictLRU(targetFreeMB?: number): Promise<string[]> {
      return evictLRUInternal(targetFreeMB);
    },
  };
}

// Global singleton for cross-module sharing
let _globalRegistry: UnifiedModelRegistry | null = null;

/**
 * Get the global UnifiedModelRegistry singleton.
 * Shared across all browser-ai modules.
 */
export function getGlobalRegistry(config?: UnifiedRegistryConfig): UnifiedModelRegistry {
  if (!_globalRegistry) {
    _globalRegistry = createUnifiedRegistry(config);
  }
  return _globalRegistry;
}

/**
 * Reset the global registry (for testing).
 */
export async function resetGlobalRegistry(): Promise<void> {
  if (_globalRegistry) {
    await _globalRegistry.unloadAll();
    _globalRegistry = null;
  }
}
