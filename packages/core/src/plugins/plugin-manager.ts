/**
 * Plugin architecture for browser-ai.
 * V1.0 — Extensible plugin system for custom functionality.
 * 
 * Features:
 * - Lifecycle hooks (beforeInit, afterInit, beforeGenerate, afterGenerate, etc.)
 * - Middleware pattern for request/response transformation
 * - Custom provider plugins
 * - Telemetry/logging plugins
 */

import type { GenerateParams, GenerateResult } from '../types/generate.js';
import type { RuntimeState } from '../types/runtime-state.js';
import type { DiagnosticsSnapshot } from '../types/diagnostics.js';
import type { BrowserAIError } from '../types/errors.js';

export type PluginHook = 
  | 'beforeInit'
  | 'afterInit'
  | 'beforeGenerate'
  | 'afterGenerate'
  | 'onToken'
  | 'onStateChange'
  | 'onError'
  | 'beforeTeardown'
  | 'afterTeardown';

export interface PluginContext {
  state: RuntimeState;
  getDiagnostics: () => DiagnosticsSnapshot;
}

export interface BeforeInitContext extends PluginContext {
  config: Record<string, unknown>;
}

export interface AfterInitContext extends PluginContext {
  modelId: string;
  providerId: string;
}

export interface BeforeGenerateContext extends PluginContext {
  params: GenerateParams;
}

export interface AfterGenerateContext extends PluginContext {
  params: GenerateParams;
  result: GenerateResult;
}

export interface OnTokenContext extends PluginContext {
  token: string;
  tokensEmitted: number;
}

export interface OnStateChangeContext extends PluginContext {
  prevState: RuntimeState;
}

export interface OnErrorContext extends PluginContext {
  error: BrowserAIError;
}

export interface Plugin {
  /**
   * Unique plugin name.
   */
  name: string;

  /**
   * Plugin version.
   */
  version?: string;

  /**
   * Called before BrowserAI.init().
   * Can modify config.
   */
  beforeInit?(ctx: BeforeInitContext): void | Promise<void>;

  /**
   * Called after successful init.
   */
  afterInit?(ctx: AfterInitContext): void | Promise<void>;

  /**
   * Called before generate().
   * Can modify params.
   */
  beforeGenerate?(ctx: BeforeGenerateContext): void | Promise<void>;

  /**
   * Called after generate() completes.
   * Can inspect/log result.
   */
  afterGenerate?(ctx: AfterGenerateContext): void | Promise<void>;

  /**
   * Called for each token emitted.
   */
  onToken?(ctx: OnTokenContext): void;

  /**
   * Called on state changes.
   */
  onStateChange?(ctx: OnStateChangeContext): void;

  /**
   * Called on errors.
   */
  onError?(ctx: OnErrorContext): void | Promise<void>;

  /**
   * Called before teardown.
   */
  beforeTeardown?(ctx: PluginContext): void | Promise<void>;

  /**
   * Called after teardown.
   */
  afterTeardown?(ctx: PluginContext): void | Promise<void>;

  /**
   * Plugin cleanup.
   */
  destroy?(): void | Promise<void>;
}

export interface PluginManager {
  /**
   * Register a plugin.
   */
  register(plugin: Plugin): void;

  /**
   * Unregister a plugin by name.
   */
  unregister(name: string): void;

  /**
   * Get all registered plugins.
   */
  getPlugins(): Plugin[];

  /**
   * Get a plugin by name.
   */
  getPlugin(name: string): Plugin | undefined;

  /**
   * Execute a hook on all plugins.
   */
  executeHook<T extends PluginContext>(hook: PluginHook, context: T): Promise<void>;

  /**
   * Execute a synchronous hook (onToken, onStateChange).
   */
  executeSyncHook<T extends PluginContext>(hook: PluginHook, context: T): void;

  /**
   * Destroy all plugins.
   */
  destroy(): Promise<void>;
}

export function createPluginManager(): PluginManager {
  const plugins = new Map<string, Plugin>();

  return {
    register(plugin: Plugin): void {
      if (plugins.has(plugin.name)) {
        console.warn(`[browser-ai] Plugin "${plugin.name}" already registered, replacing.`);
      }
      plugins.set(plugin.name, plugin);
    },

    unregister(name: string): void {
      const plugin = plugins.get(name);
      if (plugin?.destroy) {
        plugin.destroy();
      }
      plugins.delete(name);
    },

    getPlugins(): Plugin[] {
      return Array.from(plugins.values());
    },

    getPlugin(name: string): Plugin | undefined {
      return plugins.get(name);
    },

    async executeHook<T extends PluginContext>(hook: PluginHook, context: T): Promise<void> {
      for (const plugin of plugins.values()) {
        const hookFn = plugin[hook] as ((ctx: T) => void | Promise<void>) | undefined;
        if (hookFn) {
          try {
            await hookFn.call(plugin, context);
          } catch (error) {
            console.error(`[browser-ai] Plugin "${plugin.name}" error in ${hook}:`, error);
          }
        }
      }
    },

    executeSyncHook<T extends PluginContext>(hook: PluginHook, context: T): void {
      for (const plugin of plugins.values()) {
        const hookFn = plugin[hook] as ((ctx: T) => void) | undefined;
        if (hookFn) {
          try {
            hookFn.call(plugin, context);
          } catch (error) {
            console.error(`[browser-ai] Plugin "${plugin.name}" error in ${hook}:`, error);
          }
        }
      }
    },

    async destroy(): Promise<void> {
      for (const plugin of plugins.values()) {
        if (plugin.destroy) {
          try {
            await plugin.destroy();
          } catch (error) {
            console.error(`[browser-ai] Plugin "${plugin.name}" error in destroy:`, error);
          }
        }
      }
      plugins.clear();
    },
  };
}

/**
 * Built-in logging plugin.
 */
export function createLoggingPlugin(options: { prefix?: string } = {}): Plugin {
  const prefix = options.prefix ?? '[browser-ai]';

  return {
    name: 'logging',
    version: '1.0.0',

    afterInit(ctx) {
      console.log(`${prefix} Initialized with model: ${ctx.modelId}`);
    },

    beforeGenerate(ctx) {
      console.log(`${prefix} Generating with ${ctx.params.messages.length} messages`);
    },

    afterGenerate(ctx) {
      console.log(`${prefix} Generated ${ctx.result.text.length} chars`);
    },

    onError(ctx) {
      console.error(`${prefix} Error: ${ctx.error.code} - ${ctx.error.message}`);
    },
  };
}

/**
 * Built-in telemetry plugin (no-network, local only).
 */
export function createTelemetryPlugin(): Plugin {
  const metrics = {
    generateCount: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
    errors: 0,
  };

  let generateStartMs = 0;

  return {
    name: 'telemetry',
    version: '1.0.0',

    beforeGenerate() {
      generateStartMs = Date.now();
    },

    afterGenerate(ctx) {
      metrics.generateCount++;
      metrics.totalTokens += ctx.result.usage?.totalTokens ?? 0;
      metrics.totalLatencyMs += Date.now() - generateStartMs;
    },

    onError() {
      metrics.errors++;
    },

    // Expose metrics via custom property
    getMetrics() {
      return { ...metrics };
    },
  } as Plugin & { getMetrics(): typeof metrics };
}
