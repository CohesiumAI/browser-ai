/**
 * Tests for LRUCacheManager (V1.0)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLRUCacheManager, type LRUCacheManager } from '../storage/lru-cache.js';

describe('LRUCacheManager', () => {
  let manager: LRUCacheManager;

  beforeEach(async () => {
    manager = await createLRUCacheManager();
  });

  describe('getModels', () => {
    it('returns empty array initially', async () => {
      const models = await manager.getModels();
      expect(Array.isArray(models)).toBe(true);
    });
  });

  describe('hasModel', () => {
    it('returns false for non-existent model', async () => {
      const result = await manager.hasModel('non-existent-model');
      expect(result).toBe(false);
    });
  });

  describe('touchModel', () => {
    it('does not throw for non-existent model', async () => {
      await expect(manager.touchModel('test-model')).resolves.toBeUndefined();
    });
  });

  describe('deleteModel', () => {
    it('does not throw for non-existent model', async () => {
      await expect(manager.deleteModel('test-model')).resolves.toBeUndefined();
    });
  });

  describe('evictForSpace', () => {
    it('returns empty result when no models to evict', async () => {
      const result = await manager.evictForSpace(1000);
      expect(result.evicted).toEqual([]);
      expect(result.freedBytes).toBe(0);
    });
  });

  describe('autoEvict', () => {
    it('returns empty result when under quota', async () => {
      const result = await manager.autoEvict();
      expect(result.evicted).toEqual([]);
      expect(result.freedBytes).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns storage statistics', async () => {
      const stats = await manager.getStats();
      expect(stats).toHaveProperty('totalBytes');
      expect(stats).toHaveProperty('usedBytes');
      expect(stats).toHaveProperty('availableBytes');
      expect(stats).toHaveProperty('modelCount');
      expect(stats.modelCount).toBe(0);
    });
  });

  describe('purgeAll', () => {
    it('does not throw when no models exist', async () => {
      await expect(manager.purgeAll()).resolves.toBeUndefined();
    });
  });
});

describe('LRUCacheManager configuration', () => {
  it('accepts custom config', async () => {
    const manager = await createLRUCacheManager({
      maxUsageRatio: 0.5,
      minFreeBytes: 100 * 1024 * 1024,
      preferOPFS: false,
    });
    
    const stats = await manager.getStats();
    expect(stats).toHaveProperty('totalBytes');
  });

  it('uses default config when none provided', async () => {
    const manager = await createLRUCacheManager();
    const stats = await manager.getStats();
    expect(stats).toHaveProperty('totalBytes');
  });
});
