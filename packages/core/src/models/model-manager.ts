/**
 * Multi-model manager.
 * V1.0 — Support for multiple models loaded simultaneously.
 * 
 * Features:
 * - Load multiple models in parallel
 * - Switch between models without full teardown
 * - Model preloading for faster switching
 * - Memory-aware model management
 */

import type { ModelSpec } from '../types/models.js';
import type { Provider } from '../types/provider.js';
import type { ProviderId } from '../types/common.js';
import { createError } from '../types/errors.js';
import { createLRUCacheManager, type LRUCacheManager } from '../storage/lru-cache.js';

export type ModelStatus = 'unloaded' | 'loading' | 'ready' | 'error' | 'unloading';

export interface LoadedModel {
  spec: ModelSpec;
  provider: Provider;
  status: ModelStatus;
  loadedAtMs: number;
  lastUsedAtMs: number;
  error?: Error;
}

export interface ModelManagerConfig {
  /**
   * Maximum number of models to keep loaded simultaneously.
   * @default 2
   */
  maxLoadedModels?: number;

  /**
   * Automatically unload LRU model when limit reached.
   * @default true
   */
  autoUnload?: boolean;

  /**
   * Preload models in background.
   * @default false
   */
  preloadEnabled?: boolean;
}

const DEFAULT_CONFIG: Required<ModelManagerConfig> = {
  maxLoadedModels: 2,
  autoUnload: true,
  preloadEnabled: false,
};

export interface ModelManager {
  /**
   * Get all loaded models.
   */
  getLoadedModels(): LoadedModel[];

  /**
   * Get a specific loaded model.
   */
  getModel(modelId: string): LoadedModel | undefined;

  /**
   * Get the currently active model.
   */
  getActiveModel(): LoadedModel | undefined;

  /**
   * Set the active model (switch context).
   */
  setActiveModel(modelId: string): Promise<void>;

  /**
   * Load a model (add to loaded models).
   */
  loadModel(spec: ModelSpec, provider: Provider): Promise<void>;

  /**
   * Unload a specific model.
   */
  unloadModel(modelId: string): Promise<void>;

  /**
   * Unload all models.
   */
  unloadAll(): Promise<void>;

  /**
   * Preload a model in background.
   */
  preloadModel(spec: ModelSpec, provider: Provider): void;

  /**
   * Get LRU cache manager.
   */
  getCacheManager(): Promise<LRUCacheManager>;
}

export function createModelManager(config: ModelManagerConfig = {}): ModelManager {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const loadedModels = new Map<string, LoadedModel>();
  let activeModelId: string | null = null;
  let cacheManager: LRUCacheManager | null = null;

  async function ensureCacheManager(): Promise<LRUCacheManager> {
    if (!cacheManager) {
      cacheManager = await createLRUCacheManager();
    }
    return cacheManager;
  }

  async function evictLRUModel(): Promise<void> {
    if (loadedModels.size < cfg.maxLoadedModels) return;

    // Find LRU model (excluding active)
    let lruModel: LoadedModel | null = null;
    let lruTime = Infinity;

    for (const model of loadedModels.values()) {
      if (model.spec.id === activeModelId) continue;
      if (model.status !== 'ready') continue;
      if (model.lastUsedAtMs < lruTime) {
        lruTime = model.lastUsedAtMs;
        lruModel = model;
      }
    }

    if (lruModel) {
      await unloadModelInternal(lruModel.spec.id);
    }
  }

  async function unloadModelInternal(modelId: string): Promise<void> {
    const model = loadedModels.get(modelId);
    if (!model) return;

    model.status = 'unloading';
    try {
      await model.provider.teardown();
    } catch {
      // Ignore teardown errors
    }
    loadedModels.delete(modelId);

    if (activeModelId === modelId) {
      activeModelId = null;
    }
  }

  return {
    getLoadedModels(): LoadedModel[] {
      return Array.from(loadedModels.values());
    },

    getModel(modelId: string): LoadedModel | undefined {
      return loadedModels.get(modelId);
    },

    getActiveModel(): LoadedModel | undefined {
      if (!activeModelId) return undefined;
      return loadedModels.get(activeModelId);
    },

    async setActiveModel(modelId: string): Promise<void> {
      const model = loadedModels.get(modelId);
      if (!model) {
        throw createError(
          'ERROR_INVALID_STATE',
          `Model ${modelId} is not loaded`,
          { userAction: 'Load the model first using loadModel()' }
        );
      }

      if (model.status !== 'ready') {
        throw createError(
          'ERROR_INVALID_STATE',
          `Model ${modelId} is not ready (status: ${model.status})`,
          { userAction: 'Wait for model to finish loading' }
        );
      }

      model.lastUsedAtMs = Date.now();
      activeModelId = modelId;

      // Update LRU cache
      const cache = await ensureCacheManager();
      await cache.touchModel(modelId);
    },

    async loadModel(spec: ModelSpec, provider: Provider): Promise<void> {
      // Check if already loaded
      if (loadedModels.has(spec.id)) {
        const existing = loadedModels.get(spec.id)!;
        if (existing.status === 'ready') {
          existing.lastUsedAtMs = Date.now();
          return;
        }
        if (existing.status === 'loading') {
          // Wait for existing load
          return;
        }
      }

      // Auto-evict if needed
      if (cfg.autoUnload) {
        await evictLRUModel();
      }

      // Check limit
      if (loadedModels.size >= cfg.maxLoadedModels) {
        throw createError(
          'ERROR_INVALID_STATE',
          `Maximum loaded models (${cfg.maxLoadedModels}) reached`,
          { userAction: 'Unload a model before loading a new one' }
        );
      }

      const now = Date.now();
      const model: LoadedModel = {
        spec,
        provider,
        status: 'loading',
        loadedAtMs: now,
        lastUsedAtMs: now,
      };

      loadedModels.set(spec.id, model);

      try {
        await provider.init({} as any, spec);
        model.status = 'ready';

        // Set as active if none
        if (!activeModelId) {
          activeModelId = spec.id;
        }
      } catch (error) {
        model.status = 'error';
        model.error = error as Error;
        throw error;
      }
    },

    async unloadModel(modelId: string): Promise<void> {
      await unloadModelInternal(modelId);
    },

    async unloadAll(): Promise<void> {
      const modelIds = Array.from(loadedModels.keys());
      for (const id of modelIds) {
        await unloadModelInternal(id);
      }
    },

    preloadModel(spec: ModelSpec, provider: Provider): void {
      if (!cfg.preloadEnabled) return;

      // Background preload
      this.loadModel(spec, provider).catch(() => {
        // Ignore preload errors
      });
    },

    async getCacheManager(): Promise<LRUCacheManager> {
      return ensureCacheManager();
    },
  };
}
