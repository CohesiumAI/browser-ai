/**
 * Auto-repair for cache/IDB desync.
 * CDC v2026.8 §15.5
 */

import type { CacheManager } from './cache-manager.js';
import type { IDBManager } from './idb-manager.js';
import { createError } from '../types/errors.js';

export interface AutoRepairResult {
  needed: boolean;
  repaired: boolean;
  modelId: string;
  action?: 'purged-idb' | 'purged-cache' | 'none';
}

/**
 * Check and repair desync between IDB metadata and CacheStorage.
 * - If IDB says present BUT cache missing → purge IDB + trigger redownload
 * - If cache present BUT IDB invalid/absent → purge cache + trigger redownload
 */
export async function autoRepairCache(
  modelId: string,
  cacheManager: CacheManager,
  idbManager: IDBManager
): Promise<AutoRepairResult> {
  const [cacheStatus, idbMetadata] = await Promise.all([
    cacheManager.checkCache(modelId),
    idbManager.getModelMetadata(modelId),
  ]);

  const cacheHit = cacheStatus.hit;
  const idbHit = idbMetadata !== null;

  if (cacheHit && idbHit) {
    return { needed: false, repaired: false, modelId, action: 'none' };
  }

  if (!cacheHit && !idbHit) {
    return { needed: false, repaired: false, modelId, action: 'none' };
  }

  if (idbHit && !cacheHit) {
    await idbManager.deleteModelMetadata(modelId);
    return { needed: true, repaired: true, modelId, action: 'purged-idb' };
  }

  if (cacheHit && !idbHit) {
    await cacheManager.purgeModel(modelId);
    return { needed: true, repaired: true, modelId, action: 'purged-cache' };
  }

  return { needed: false, repaired: false, modelId, action: 'none' };
}
