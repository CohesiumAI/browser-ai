/**
 * LRU (Least Recently Used) cache manager for models.
 * V1.0 — Automatic eviction of old models when storage quota is low.
 * 
 * Features:
 * - Tracks model access times
 * - Evicts least recently used models when quota threshold is reached
 * - Works with both OPFS and CacheStorage
 */

import { createOPFSManager, type OPFSManager, type OPFSModelMetadata } from './opfs-manager.js';
import { createCacheManager, type CacheManager } from './cache-manager.js';
import { getQuotaEstimate } from '../utils/quota.js';

export interface LRUCacheConfig {
  /**
   * Maximum storage usage as fraction of quota (0-1).
   * @default 0.8 (80%)
   */
  maxUsageRatio?: number;

  /**
   * Minimum free space to maintain in bytes.
   * @default 500MB
   */
  minFreeBytes?: number;

  /**
   * Prefer OPFS over CacheStorage when available.
   * @default true
   */
  preferOPFS?: boolean;
}

const DEFAULT_CONFIG: Required<LRUCacheConfig> = {
  maxUsageRatio: 0.8,
  minFreeBytes: 500 * 1024 * 1024, // 500MB
  preferOPFS: true,
};

export interface LRUEvictionResult {
  evicted: string[];
  freedBytes: number;
}

export interface ModelCacheEntry {
  modelId: string;
  sizeBytes: number;
  lastAccessedAtMs: number;
  storage: 'opfs' | 'cache';
}

export interface LRUCacheManager {
  /**
   * Get all cached models with LRU info.
   */
  getModels(): Promise<ModelCacheEntry[]>;

  /**
   * Check if model is cached.
   */
  hasModel(modelId: string): Promise<boolean>;

  /**
   * Touch model to update last accessed time.
   */
  touchModel(modelId: string): Promise<void>;

  /**
   * Delete a specific model.
   */
  deleteModel(modelId: string): Promise<void>;

  /**
   * Evict models to free space for a new model.
   * Returns list of evicted model IDs.
   */
  evictForSpace(requiredBytes: number): Promise<LRUEvictionResult>;

  /**
   * Run automatic eviction based on quota thresholds.
   */
  autoEvict(): Promise<LRUEvictionResult>;

  /**
   * Get storage statistics.
   */
  getStats(): Promise<{
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    modelCount: number;
  }>;

  /**
   * Clear all cached models.
   */
  purgeAll(): Promise<void>;
}

export async function createLRUCacheManager(config: LRUCacheConfig = {}): Promise<LRUCacheManager> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const opfs = createOPFSManager();
  let cache: CacheManager | null = null;

  try {
    cache = await createCacheManager();
  } catch {
    // CacheStorage not available
  }

  // Track access times for CacheStorage models (OPFS has built-in tracking)
  const cacheAccessTimes = new Map<string, number>();

  // Helper functions to avoid 'this' issues
  async function getModelsInternal(): Promise<ModelCacheEntry[]> {
    const entries: ModelCacheEntry[] = [];

    if (opfs.isAvailable()) {
      const opfsInfo = await opfs.getStorageInfo();
      for (const model of opfsInfo.models) {
        entries.push({
          modelId: model.modelId,
          sizeBytes: model.sizeBytes,
          lastAccessedAtMs: model.lastAccessedAtMs,
          storage: 'opfs',
        });
      }
    }

    return entries.sort((a, b) => a.lastAccessedAtMs - b.lastAccessedAtMs);
  }

  async function deleteModelInternal(modelId: string): Promise<void> {
    if (opfs.isAvailable()) {
      await opfs.deleteModel(modelId);
    }

    if (cache) {
      await cache.purgeModel(modelId);
    }

    cacheAccessTimes.delete(modelId);
  }

  async function getStatsInternal(): Promise<{
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
    modelCount: number;
  }> {
    const quota = await getQuotaEstimate();
    const models = await getModelsInternal();
    const usedBytes = models.reduce((sum: number, m: ModelCacheEntry) => sum + m.sizeBytes, 0);

    return {
      totalBytes: quota.quotaBytes ?? 0,
      usedBytes,
      availableBytes: (quota.quotaBytes ?? 0) - usedBytes,
      modelCount: models.length,
    };
  }

  async function evictForSpaceInternal(requiredBytes: number): Promise<LRUEvictionResult> {
    const stats = await getStatsInternal();
    const targetFree = Math.max(requiredBytes, cfg.minFreeBytes);

    if (stats.availableBytes >= targetFree) {
      return { evicted: [], freedBytes: 0 };
    }

    const bytesToFree = targetFree - stats.availableBytes;
    const models = await getModelsInternal();
    const evicted: string[] = [];
    let freedBytes = 0;

    for (const model of models) {
      if (freedBytes >= bytesToFree) break;

      await deleteModelInternal(model.modelId);
      evicted.push(model.modelId);
      freedBytes += model.sizeBytes;
    }

    return { evicted, freedBytes };
  }

  async function hasModelInternal(modelId: string): Promise<boolean> {
    if (opfs.isAvailable()) {
      if (await opfs.hasModel(modelId)) return true;
    }

    if (cache) {
      const status = await cache.checkCache(modelId);
      if (status.hit) return true;
    }

    return false;
  }

  async function touchModelInternal(modelId: string): Promise<void> {
    const now = Date.now();

    if (opfs.isAvailable()) {
      await opfs.touchModel(modelId);
    }

    cacheAccessTimes.set(modelId, now);
  }

  async function autoEvictInternal(): Promise<LRUEvictionResult> {
    const stats = await getStatsInternal();
    const maxUsedBytes = stats.totalBytes * cfg.maxUsageRatio;

    if (stats.usedBytes <= maxUsedBytes) {
      return { evicted: [], freedBytes: 0 };
    }

    const bytesToFree = stats.usedBytes - maxUsedBytes;
    return evictForSpaceInternal(bytesToFree);
  }

  async function purgeAllInternal(): Promise<void> {
    if (opfs.isAvailable()) {
      await opfs.purgeAll();
    }

    if (cache) {
      await cache.purgeAll();
    }

    cacheAccessTimes.clear();
  }

  return {
    getModels: getModelsInternal,
    hasModel: hasModelInternal,
    touchModel: touchModelInternal,
    deleteModel: deleteModelInternal,
    evictForSpace: evictForSpaceInternal,
    autoEvict: autoEvictInternal,
    getStats: getStatsInternal,
    purgeAll: purgeAllInternal,
  };
}
