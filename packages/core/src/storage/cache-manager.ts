/**
 * Cache manager for model shards.
 * CDC v2026.8 §15
 */

import { createError, type BrowserAIError } from '../types/errors.js';

const CACHE_NAME_PREFIX = 'browser-ai-models';

export interface CacheStatus {
  hit: boolean;
  modelId: string;
  bytesApprox?: number;
}

export interface CacheManager {
  checkCache(modelId: string): Promise<CacheStatus>;
  storeBlob(modelId: string, key: string, blob: Blob): Promise<void>;
  getBlob(modelId: string, key: string): Promise<Blob | null>;
  purgeModel(modelId: string): Promise<void>;
  purgeAll(): Promise<void>;
}

function getCacheName(modelId: string): string {
  return `${CACHE_NAME_PREFIX}-${modelId}`;
}

export async function createCacheManager(): Promise<CacheManager> {
  if (typeof caches === 'undefined') {
    throw createError(
      'ERROR_CACHE_CORRUPT',
      'CacheStorage API not available',
      { userAction: 'Use a modern browser with CacheStorage support' }
    );
  }

  return {
    async checkCache(modelId: string): Promise<CacheStatus> {
      try {
        const cacheName = getCacheName(modelId);
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        
        if (keys.length === 0) {
          return { hit: false, modelId };
        }

        let bytesApprox = 0;
        for (const key of keys) {
          const response = await cache.match(key);
          if (response) {
            const blob = await response.blob();
            bytesApprox += blob.size;
          }
        }

        return { hit: true, modelId, bytesApprox };
      } catch {
        return { hit: false, modelId };
      }
    },

    async storeBlob(modelId: string, key: string, blob: Blob): Promise<void> {
      const cacheName = getCacheName(modelId);
      const cache = await caches.open(cacheName);
      const response = new Response(blob);
      await cache.put(key, response);
    },

    async getBlob(modelId: string, key: string): Promise<Blob | null> {
      try {
        const cacheName = getCacheName(modelId);
        const cache = await caches.open(cacheName);
        const response = await cache.match(key);
        if (!response) return null;
        return await response.blob();
      } catch {
        return null;
      }
    },

    async purgeModel(modelId: string): Promise<void> {
      const cacheName = getCacheName(modelId);
      await caches.delete(cacheName);
    },

    async purgeAll(): Promise<void> {
      const names = await caches.keys();
      for (const name of names) {
        if (name.startsWith(CACHE_NAME_PREFIX)) {
          await caches.delete(name);
        }
      }
    },
  };
}
