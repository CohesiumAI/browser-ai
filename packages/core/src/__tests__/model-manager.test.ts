/**
 * Tests for ModelManager (V1.0)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createModelManager, type ModelManager } from '../models/model-manager.js';
import type { Provider, DetectResult } from '../types/provider.js';
import type { GenerateResult } from '../types/generate.js';
import type { ModelSpec } from '../types/models.js';

function createMockProvider(id: string = 'mock'): Provider {
  return {
    id: id as any,
    detect: vi.fn().mockResolvedValue({ available: true, reason: 'mock' } as DetectResult),
    init: vi.fn().mockResolvedValue(undefined),
    generate: vi.fn().mockResolvedValue({ text: 'test', providerId: id } as GenerateResult),
    abort: vi.fn(),
    teardown: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockModelSpec(id: string): ModelSpec {
  return {
    id,
    provider: 'webllm',
    source: 'prebuilt',
    sizeBytes: 1000000,
  };
}

describe('ModelManager', () => {
  let manager: ModelManager;

  beforeEach(() => {
    manager = createModelManager();
  });

  describe('getLoadedModels', () => {
    it('returns empty array initially', () => {
      const models = manager.getLoadedModels();
      expect(models).toEqual([]);
    });
  });

  describe('getModel', () => {
    it('returns undefined for non-loaded model', () => {
      const model = manager.getModel('non-existent');
      expect(model).toBeUndefined();
    });
  });

  describe('getActiveModel', () => {
    it('returns undefined when no model is active', () => {
      const active = manager.getActiveModel();
      expect(active).toBeUndefined();
    });
  });

  describe('loadModel', () => {
    it('loads a model successfully', async () => {
      const provider = createMockProvider();
      const spec = createMockModelSpec('test-model');

      await manager.loadModel(spec, provider);

      expect(provider.init).toHaveBeenCalled();
      expect(manager.getLoadedModels()).toHaveLength(1);
      expect(manager.getModel('test-model')).toBeDefined();
    });

    it('sets first loaded model as active', async () => {
      const provider = createMockProvider();
      const spec = createMockModelSpec('test-model');

      await manager.loadModel(spec, provider);

      const active = manager.getActiveModel();
      expect(active).toBeDefined();
      expect(active?.spec.id).toBe('test-model');
    });

    it('does not reload already loaded model', async () => {
      const provider = createMockProvider();
      const spec = createMockModelSpec('test-model');

      await manager.loadModel(spec, provider);
      await manager.loadModel(spec, provider);

      expect(provider.init).toHaveBeenCalledTimes(1);
    });

    it('respects maxLoadedModels limit', async () => {
      const mgr = createModelManager({ maxLoadedModels: 2, autoUnload: false });
      
      await mgr.loadModel(createMockModelSpec('model-1'), createMockProvider('p1'));
      await mgr.loadModel(createMockModelSpec('model-2'), createMockProvider('p2'));

      await expect(
        mgr.loadModel(createMockModelSpec('model-3'), createMockProvider('p3'))
      ).rejects.toThrow();
    });

    it('auto-evicts LRU model when limit reached', async () => {
      const mgr = createModelManager({ maxLoadedModels: 2, autoUnload: true });
      
      const p1 = createMockProvider('p1');
      const p2 = createMockProvider('p2');
      const p3 = createMockProvider('p3');

      await mgr.loadModel(createMockModelSpec('model-1'), p1);
      await mgr.loadModel(createMockModelSpec('model-2'), p2);
      
      // Set model-2 as active so model-1 gets evicted
      await mgr.setActiveModel('model-2');
      
      await mgr.loadModel(createMockModelSpec('model-3'), p3);

      expect(mgr.getLoadedModels()).toHaveLength(2);
      expect(p1.teardown).toHaveBeenCalled();
    });

    it('handles init failure', async () => {
      const provider = createMockProvider();
      provider.init = vi.fn().mockRejectedValue(new Error('Init failed'));
      const spec = createMockModelSpec('test-model');

      await expect(manager.loadModel(spec, provider)).rejects.toThrow('Init failed');

      const model = manager.getModel('test-model');
      expect(model?.status).toBe('error');
    });
  });

  describe('setActiveModel', () => {
    it('throws for non-loaded model', async () => {
      await expect(manager.setActiveModel('non-existent')).rejects.toThrow();
    });

    it('sets active model', async () => {
      const provider = createMockProvider();
      await manager.loadModel(createMockModelSpec('model-1'), provider);

      await manager.setActiveModel('model-1');

      expect(manager.getActiveModel()?.spec.id).toBe('model-1');
    });

    it('updates lastUsedAtMs', async () => {
      const provider = createMockProvider();
      await manager.loadModel(createMockModelSpec('model-1'), provider);

      const before = manager.getModel('model-1')?.lastUsedAtMs;
      await new Promise(r => setTimeout(r, 10));
      await manager.setActiveModel('model-1');
      const after = manager.getModel('model-1')?.lastUsedAtMs;

      expect(after).toBeGreaterThanOrEqual(before!);
    });
  });

  describe('unloadModel', () => {
    it('unloads a model', async () => {
      const provider = createMockProvider();
      await manager.loadModel(createMockModelSpec('test-model'), provider);

      await manager.unloadModel('test-model');

      expect(provider.teardown).toHaveBeenCalled();
      expect(manager.getModel('test-model')).toBeUndefined();
    });

    it('clears active model if unloaded', async () => {
      const provider = createMockProvider();
      await manager.loadModel(createMockModelSpec('test-model'), provider);
      await manager.setActiveModel('test-model');

      await manager.unloadModel('test-model');

      expect(manager.getActiveModel()).toBeUndefined();
    });
  });

  describe('unloadAll', () => {
    it('unloads all models', async () => {
      const p1 = createMockProvider('p1');
      const p2 = createMockProvider('p2');

      await manager.loadModel(createMockModelSpec('model-1'), p1);
      await manager.loadModel(createMockModelSpec('model-2'), p2);

      await manager.unloadAll();

      expect(manager.getLoadedModels()).toHaveLength(0);
      expect(p1.teardown).toHaveBeenCalled();
      expect(p2.teardown).toHaveBeenCalled();
    });
  });

  describe('preloadModel', () => {
    it('does nothing when preload disabled', () => {
      const mgr = createModelManager({ preloadEnabled: false });
      const provider = createMockProvider();
      
      mgr.preloadModel(createMockModelSpec('test'), provider);
      
      expect(provider.init).not.toHaveBeenCalled();
    });

    it('preloads in background when enabled', async () => {
      const mgr = createModelManager({ preloadEnabled: true });
      const provider = createMockProvider();
      
      mgr.preloadModel(createMockModelSpec('test'), provider);
      
      // Wait for async preload
      await new Promise(r => setTimeout(r, 50));
      
      expect(provider.init).toHaveBeenCalled();
    });
  });

  describe('getCacheManager', () => {
    it('returns LRU cache manager', async () => {
      const cache = await manager.getCacheManager();
      expect(cache).toBeDefined();
      expect(cache).toHaveProperty('getModels');
      expect(cache).toHaveProperty('evictForSpace');
    });
  });
});

describe('ModelManager configuration', () => {
  it('accepts custom maxLoadedModels', () => {
    const mgr = createModelManager({ maxLoadedModels: 5 });
    expect(mgr.getLoadedModels()).toEqual([]);
  });

  it('accepts autoUnload option', () => {
    const mgr = createModelManager({ autoUnload: false });
    expect(mgr.getLoadedModels()).toEqual([]);
  });

  it('accepts preloadEnabled option', () => {
    const mgr = createModelManager({ preloadEnabled: true });
    expect(mgr.getLoadedModels()).toEqual([]);
  });
});
