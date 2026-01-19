/**
 * Tests for PluginManager (V1.0)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPluginManager,
  createLoggingPlugin,
  createTelemetryPlugin,
  type PluginManager,
  type Plugin,
  type PluginContext,
  type BeforeGenerateContext,
  type AfterGenerateContext,
} from '../plugins/plugin-manager.js';
import type { RuntimeState } from '../types/runtime-state.js';

function createMockContext(): PluginContext {
  return {
    state: { name: 'READY', sinceMs: Date.now() } as RuntimeState,
    getDiagnostics: vi.fn().mockReturnValue({}),
  };
}

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = createPluginManager();
  });

  describe('register', () => {
    it('registers a plugin', () => {
      const plugin: Plugin = { name: 'test-plugin' };
      manager.register(plugin);

      expect(manager.getPlugins()).toHaveLength(1);
      expect(manager.getPlugin('test-plugin')).toBe(plugin);
    });

    it('replaces existing plugin with same name', () => {
      const plugin1: Plugin = { name: 'test', version: '1.0' };
      const plugin2: Plugin = { name: 'test', version: '2.0' };

      manager.register(plugin1);
      manager.register(plugin2);

      expect(manager.getPlugins()).toHaveLength(1);
      expect(manager.getPlugin('test')?.version).toBe('2.0');
    });
  });

  describe('unregister', () => {
    it('unregisters a plugin', () => {
      const plugin: Plugin = { name: 'test-plugin' };
      manager.register(plugin);
      manager.unregister('test-plugin');

      expect(manager.getPlugins()).toHaveLength(0);
      expect(manager.getPlugin('test-plugin')).toBeUndefined();
    });

    it('calls destroy on unregister', async () => {
      const destroy = vi.fn();
      const plugin: Plugin = { name: 'test', destroy };

      manager.register(plugin);
      manager.unregister('test');

      expect(destroy).toHaveBeenCalled();
    });
  });

  describe('getPlugins', () => {
    it('returns all registered plugins', () => {
      manager.register({ name: 'plugin-1' });
      manager.register({ name: 'plugin-2' });

      const plugins = manager.getPlugins();
      expect(plugins).toHaveLength(2);
    });
  });

  describe('getPlugin', () => {
    it('returns plugin by name', () => {
      const plugin: Plugin = { name: 'my-plugin' };
      manager.register(plugin);

      expect(manager.getPlugin('my-plugin')).toBe(plugin);
    });

    it('returns undefined for non-existent plugin', () => {
      expect(manager.getPlugin('non-existent')).toBeUndefined();
    });
  });

  describe('executeHook', () => {
    it('executes async hooks on all plugins', async () => {
      const hook1 = vi.fn().mockResolvedValue(undefined);
      const hook2 = vi.fn().mockResolvedValue(undefined);

      manager.register({ name: 'p1', beforeInit: hook1 });
      manager.register({ name: 'p2', beforeInit: hook2 });

      await manager.executeHook('beforeInit', createMockContext() as any);

      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
    });

    it('continues execution even if a hook throws', async () => {
      const errorHook = vi.fn().mockRejectedValue(new Error('Hook error'));
      const successHook = vi.fn().mockResolvedValue(undefined);

      manager.register({ name: 'p1', afterInit: errorHook });
      manager.register({ name: 'p2', afterInit: successHook });

      await manager.executeHook('afterInit', createMockContext() as any);

      expect(errorHook).toHaveBeenCalled();
      expect(successHook).toHaveBeenCalled();
    });

    it('passes context to hooks', async () => {
      const hook = vi.fn();
      manager.register({ name: 'test', beforeGenerate: hook });

      const ctx: BeforeGenerateContext = {
        ...createMockContext(),
        params: { messages: [{ role: 'user', content: 'test' }] },
      };

      await manager.executeHook('beforeGenerate', ctx);

      expect(hook).toHaveBeenCalledWith(ctx);
    });
  });

  describe('executeSyncHook', () => {
    it('executes sync hooks on all plugins', () => {
      const hook1 = vi.fn();
      const hook2 = vi.fn();

      manager.register({ name: 'p1', onToken: hook1 });
      manager.register({ name: 'p2', onToken: hook2 });

      manager.executeSyncHook('onToken', createMockContext() as any);

      expect(hook1).toHaveBeenCalled();
      expect(hook2).toHaveBeenCalled();
    });

    it('continues execution even if a hook throws', () => {
      const errorHook = vi.fn().mockImplementation(() => { throw new Error('Sync error'); });
      const successHook = vi.fn();

      manager.register({ name: 'p1', onStateChange: errorHook });
      manager.register({ name: 'p2', onStateChange: successHook });

      manager.executeSyncHook('onStateChange', createMockContext() as any);

      expect(errorHook).toHaveBeenCalled();
      expect(successHook).toHaveBeenCalled();
    });
  });

  describe('destroy', () => {
    it('calls destroy on all plugins', async () => {
      const destroy1 = vi.fn();
      const destroy2 = vi.fn();

      manager.register({ name: 'p1', destroy: destroy1 });
      manager.register({ name: 'p2', destroy: destroy2 });

      await manager.destroy();

      expect(destroy1).toHaveBeenCalled();
      expect(destroy2).toHaveBeenCalled();
    });

    it('clears all plugins after destroy', async () => {
      manager.register({ name: 'test' });

      await manager.destroy();

      expect(manager.getPlugins()).toHaveLength(0);
    });

    it('handles async destroy', async () => {
      const destroy = vi.fn().mockResolvedValue(undefined);
      manager.register({ name: 'test', destroy });

      await manager.destroy();

      expect(destroy).toHaveBeenCalled();
    });
  });
});

describe('createLoggingPlugin', () => {
  it('creates a logging plugin', () => {
    const plugin = createLoggingPlugin();

    expect(plugin.name).toBe('logging');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.afterInit).toBeDefined();
    expect(plugin.beforeGenerate).toBeDefined();
    expect(plugin.afterGenerate).toBeDefined();
    expect(plugin.onError).toBeDefined();
  });

  it('accepts custom prefix', () => {
    const plugin = createLoggingPlugin({ prefix: '[custom]' });
    expect(plugin.name).toBe('logging');
  });

  it('logs afterInit', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const plugin = createLoggingPlugin();

    plugin.afterInit?.({
      ...createMockContext(),
      modelId: 'test-model',
      providerId: 'webllm',
    } as any);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('createTelemetryPlugin', () => {
  it('creates a telemetry plugin', () => {
    const plugin = createTelemetryPlugin();

    expect(plugin.name).toBe('telemetry');
    expect(plugin.version).toBe('1.0.0');
    expect(plugin.beforeGenerate).toBeDefined();
    expect(plugin.afterGenerate).toBeDefined();
    expect(plugin.onError).toBeDefined();
  });

  it('tracks metrics', () => {
    const plugin = createTelemetryPlugin() as Plugin & { getMetrics: () => any };

    expect(plugin.getMetrics).toBeDefined();

    const metrics = plugin.getMetrics();
    expect(metrics.generateCount).toBe(0);
    expect(metrics.totalTokens).toBe(0);
    expect(metrics.errors).toBe(0);
  });

  it('increments generateCount after generate', () => {
    const plugin = createTelemetryPlugin() as Plugin & { getMetrics: () => any };

    plugin.beforeGenerate?.(createMockContext() as any);
    plugin.afterGenerate?.({
      ...createMockContext(),
      params: { messages: [] },
      result: { text: 'test', usage: { totalTokens: 10 } },
    } as any);

    const metrics = plugin.getMetrics();
    expect(metrics.generateCount).toBe(1);
    expect(metrics.totalTokens).toBe(10);
  });

  it('increments errors on error', () => {
    const plugin = createTelemetryPlugin() as Plugin & { getMetrics: () => any };

    plugin.onError?.(createMockContext() as any);

    const metrics = plugin.getMetrics();
    expect(metrics.errors).toBe(1);
  });
});
