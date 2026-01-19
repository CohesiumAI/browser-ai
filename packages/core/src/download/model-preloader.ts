/**
 * ModelPreloader — Pre-download model files with SmartDownloader.
 * Downloads model shards in parallel and caches them for WebLLM.
 * 
 * WebLLM uses the Cache API. If files are already cached,
 * it skips downloading them. We pre-populate the cache.
 */

import { SmartDownloader, type DownloadProgressCallback } from './smart-downloader.js';

// WebLLM model record URLs (from mlc-ai/web-llm)
const MLC_MODEL_BASE = 'https://huggingface.co';

export interface ModelShardInfo {
  url: string;
  size: number;
}

export interface PreloadOptions {
  maxConnections?: number;
  onProgress?: DownloadProgressCallback;
  signal?: AbortSignal;
}

export interface PreloadResult {
  success: boolean;
  cachedShards: number;
  totalShards: number;
  totalBytes: number;
  durationMs: number;
}

/**
 * Get the list of model shard URLs for a given model.
 * WebLLM models are hosted on HuggingFace.
 */
export function getModelShardUrls(modelId: string): string[] {
  // Common WebLLM model shard patterns
  // Models are typically split into multiple .bin files
  const baseUrl = `${MLC_MODEL_BASE}/mlc-ai/${modelId}/resolve/main`;
  
  // WebLLM models have a config file that lists all shards
  // For now, we return the config URL - the actual implementation
  // would fetch this and parse the shard list
  return [
    `${baseUrl}/mlc-chat-config.json`,
    `${baseUrl}/ndarray-cache.json`,
  ];
}

/**
 * ModelPreloader class.
 * Pre-downloads model files using parallel chunks.
 */
export class ModelPreloader {
  private downloader: SmartDownloader;
  private cache: Cache | null = null;
  private cacheName = 'browser-ai-models';

  constructor(options?: PreloadOptions) {
    this.downloader = new SmartDownloader({
      maxConnections: options?.maxConnections ?? 6,
      signal: options?.signal,
    });
  }

  /**
   * Initialize the cache.
   */
  private async initCache(): Promise<Cache> {
    if (!this.cache) {
      this.cache = await caches.open(this.cacheName);
    }
    return this.cache;
  }

  /**
   * Check if a URL is already cached.
   */
  async isCached(url: string): Promise<boolean> {
    const cache = await this.initCache();
    const response = await cache.match(url);
    return response !== undefined;
  }

  /**
   * Preload a single file with parallel chunks.
   */
  async preloadFile(
    url: string,
    onProgress?: DownloadProgressCallback
  ): Promise<boolean> {
    try {
      // Check if already cached
      if (await this.isCached(url)) {
        console.log(`[ModelPreloader] Already cached: ${url}`);
        return true;
      }

      // Download with parallel chunks
      console.log(`[ModelPreloader] Downloading: ${url}`);
      const blob = await this.downloader.download(url, onProgress);

      // Store in cache
      const cache = await this.initCache();
      const response = new Response(blob, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': blob.size.toString(),
        },
      });
      await cache.put(url, response);

      console.log(`[ModelPreloader] Cached: ${url} (${Math.round(blob.size / 1024 / 1024)} MB)`);
      return true;
    } catch (error) {
      console.error(`[ModelPreloader] Failed to preload: ${url}`, error);
      return false;
    }
  }

  /**
   * Preload all shards for a model.
   */
  async preloadModel(
    modelId: string,
    shardUrls: string[],
    onProgress?: DownloadProgressCallback
  ): Promise<PreloadResult> {
    const startTime = Date.now();
    let cachedShards = 0;
    let totalBytes = 0;

    console.log(`[ModelPreloader] Preloading model: ${modelId}`);
    console.log(`[ModelPreloader] Shards to download: ${shardUrls.length}`);

    for (let i = 0; i < shardUrls.length; i++) {
      const url = shardUrls[i];
      if (!url) continue;
      
      // Wrapper progress callback that includes shard info
      const shardProgress: DownloadProgressCallback = (progress) => {
        if (onProgress) {
          onProgress({
            ...progress,
            // Adjust percent to reflect overall progress
            percent: ((i + progress.percent / 100) / shardUrls.length) * 100,
          });
        }
      };

      const success = await this.preloadFile(url, shardProgress);
      if (success) {
        cachedShards++;
      }
    }

    return {
      success: cachedShards === shardUrls.length,
      cachedShards,
      totalShards: shardUrls.length,
      totalBytes,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Clear the model cache.
   */
  async clearCache(): Promise<void> {
    await caches.delete(this.cacheName);
    this.cache = null;
    console.log('[ModelPreloader] Cache cleared');
  }

  /**
   * Get cache statistics.
   */
  async getCacheStats(): Promise<{ count: number; totalSize: number }> {
    const cache = await this.initCache();
    const keys = await cache.keys();
    let totalSize = 0;

    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const blob = await response.blob();
        totalSize += blob.size;
      }
    }

    return { count: keys.length, totalSize };
  }
}

/**
 * Create a ModelPreloader instance.
 */
export function createModelPreloader(options?: PreloadOptions): ModelPreloader {
  return new ModelPreloader(options);
}
