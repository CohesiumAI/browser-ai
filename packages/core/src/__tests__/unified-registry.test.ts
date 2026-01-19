/**
 * Tests for UnifiedModelRegistry.
 * Verifies shared model management, LRU eviction, and auto-teardown.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createUnifiedRegistry,
  getGlobalRegistry,
  resetGlobalRegistry,
  type UnifiedModelRegistry,
} from '../models/unified-registry.js';

describe('UnifiedModelRegistry', () => {
  let registry: UnifiedModelRegistry;

  beforeEach(async () => {
    await resetGlobalRegistry();
    registry = createUnifiedRegistry({ maxMemoryMB: 500, defaultIdleTimeoutMs: 100 });
  });

  afterEach(async () => {
    await registry.unloadAll();
  });

  describe('acquire', () => {
    it('should load a model and track it', async () => {
      const mockModel = { id: 'test-model' };
      const loader = vi.fn().mockResolvedValue(mockModel);

      const result = await registry.acquire('test-model', 'transformers', loader, {
        sizeEstimateMB: 100,
      });

      expect(result).toBe(mockModel);
      expect(loader).toHaveBeenCalledTimes(1);
      expect(registry.isLoaded('test-model')).toBe(true);
    });

    it('should reuse existing model and increment refCount', async () => {
      const mockModel = { id: 'shared-model' };
      const loader = vi.fn().mockResolvedValue(mockModel);

      const result1 = await registry.acquire('shared-model', 'transformers', loader);
      const result2 = await registry.acquire('shared-model', 'transformers', loader);

      expect(result1).toBe(result2);
      expect(loader).toHaveBeenCalledTimes(1); // Loader called only once
      
      const model = registry.getModel('shared-model');
      expect(model?.refCount).toBe(2);
    });

    it('should track memory usage', async () => {
      const loader = vi.fn().mockResolvedValue({});

      await registry.acquire('model-a', 'transformers', loader, { sizeEstimateMB: 100 });
      await registry.acquire('model-b', 'onnx', loader, { sizeEstimateMB: 200 });

      const usage = registry.getMemoryUsage();
      expect(usage.totalMB).toBe(300);
      expect(usage.models).toHaveLength(2);
    });
  });

  describe('release', () => {
    it('should decrement refCount on release', async () => {
      const loader = vi.fn().mockResolvedValue({});
      
      await registry.acquire('test-model', 'transformers', loader);
      await registry.acquire('test-model', 'transformers', loader);
      
      const modelBefore = registry.getModel('test-model');
      expect(modelBefore?.refCount).toBe(2);

      registry.release('test-model');
      
      const modelAfter = registry.getModel('test-model');
      expect(modelAfter?.refCount).toBe(1);
    });

    it('should start idle timer when refCount reaches 0', async () => {
      vi.useFakeTimers();
      
      const loader = vi.fn().mockResolvedValue({});
      await registry.acquire('idle-model', 'transformers', loader);
      
      registry.release('idle-model');
      expect(registry.isLoaded('idle-model')).toBe(true);

      // Advance time past idle timeout (100ms in test config)
      await vi.advanceTimersByTimeAsync(150);
      
      expect(registry.isLoaded('idle-model')).toBe(false);
      
      vi.useRealTimers();
    });
  });

  describe('LRU eviction', () => {
    it('should evict LRU models when memory limit exceeded', async () => {
      const loader = vi.fn().mockResolvedValue({});

      // Load 4 models of 150MB each = 600MB (exceeds 500MB limit)
      await registry.acquire('model-1', 'transformers', loader, { sizeEstimateMB: 150 });
      await registry.acquire('model-2', 'transformers', loader, { sizeEstimateMB: 150 });
      await registry.acquire('model-3', 'transformers', loader, { sizeEstimateMB: 150 });
      
      // Release first two models so they can be evicted
      registry.release('model-1');
      registry.release('model-2');
      
      // This should trigger eviction of model-1 (LRU)
      await registry.acquire('model-4', 'transformers', loader, { sizeEstimateMB: 150 });

      // model-1 should be evicted (oldest and refCount=0)
      expect(registry.isLoaded('model-1')).toBe(false);
      expect(registry.isLoaded('model-2')).toBe(true); // Still under limit
      expect(registry.isLoaded('model-3')).toBe(true);
      expect(registry.isLoaded('model-4')).toBe(true);
    });

    it('should not evict models with refCount > 0', async () => {
      const loader = vi.fn().mockResolvedValue({});

      await registry.acquire('model-1', 'transformers', loader, { sizeEstimateMB: 200 });
      await registry.acquire('model-2', 'transformers', loader, { sizeEstimateMB: 200 });
      
      // Don't release model-1, it should not be evicted
      registry.release('model-2');

      // Manual eviction
      const evicted = await registry.evictLRU(100);

      expect(evicted).toContain('model-2');
      expect(evicted).not.toContain('model-1');
      expect(registry.isLoaded('model-1')).toBe(true);
    });
  });

  describe('unload', () => {
    it('should unload a specific model', async () => {
      const loader = vi.fn().mockResolvedValue({});
      await registry.acquire('test-model', 'transformers', loader);

      await registry.unload('test-model');

      expect(registry.isLoaded('test-model')).toBe(false);
    });

    it('should unload all models', async () => {
      const loader = vi.fn().mockResolvedValue({});
      await registry.acquire('model-1', 'transformers', loader);
      await registry.acquire('model-2', 'onnx', loader);

      await registry.unloadAll();

      expect(registry.getMemoryUsage().models).toHaveLength(0);
    });
  });

  describe('global registry', () => {
    it('should return singleton instance', async () => {
      await resetGlobalRegistry();
      
      const registry1 = getGlobalRegistry();
      const registry2 = getGlobalRegistry();

      expect(registry1).toBe(registry2);
    });
  });
});
