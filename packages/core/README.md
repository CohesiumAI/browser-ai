# @browser-ai/core

> Core package for browser-ai — Types, FSM, protocol, storage, and plugins.

## Installation

```bash
pnpm add @browser-ai/core
```

## Features

### Core (V0.1)
- **BrowserAI Class** — Main entry point with lifecycle management
- **FSM (12 states)** — Predictable state machine
- **Epoch/Sequence Protocol** — Race condition prevention
- **Provider Selection** — Automatic best-provider selection
- **Diagnostics API** — Runtime introspection
- **Error Catalog** — Typed errors with recovery hints

### V0.2 Additions
- **Healthcheck Manager** — Token-aware stall detection
- **Download Watchdog** — Stuck download detection
- **tierOverride** — Force specific provider tier

### V1.0 Additions
- **OPFS Manager** — Persistent storage via Origin Private File System
- **LRU Cache Manager** — Automatic model eviction
- **Model Manager** — Multi-model support
- **Plugin Manager** — Extensible hooks system

### V2.1 Additions
- **Unified Model Registry** — Central memory management across modules
- **Abort Recovery** — Watchdog timing reset after engine recreation
- **`onRecreate` Callback** — Provider-to-core communication
- **`resetGeneratingTiming()`** — FSM timing reset for GENERATING state

## Usage

### Basic

```typescript
import { createBrowserAI } from '@browser-ai/core';

const ai = createBrowserAI({
  config: { providerPolicy: { order: ['native', 'webllm'] } },
  providers: [nativeProvider, webllmProvider],
});

await ai.init();
const { result } = ai.generate({ messages: [...] });
```

### Multi-Model (V1.0)

```typescript
import { createModelManager } from '@browser-ai/core';

const manager = createModelManager({ maxLoadedModels: 2 });
await manager.loadModel(spec1, provider1);
await manager.loadModel(spec2, provider2);
await manager.setActiveModel('model-2');
```

### Plugins (V1.0)

```typescript
import { createPluginManager, createLoggingPlugin } from '@browser-ai/core';

const plugins = createPluginManager();
plugins.register(createLoggingPlugin());
plugins.register({
  name: 'custom',
  afterGenerate(ctx) { console.log(ctx.result.text); },
});
```

### OPFS Storage (V1.0)

```typescript
import { createOPFSManager } from '@browser-ai/core';

const opfs = createOPFSManager();
if (opfs.isAvailable()) {
  await opfs.storeShard('model-id', 0, data);
}
```

### LRU Cache (V1.0)

```typescript
import { createLRUCacheManager } from '@browser-ai/core';

const cache = await createLRUCacheManager({ maxUsageRatio: 0.8 });
await cache.autoEvict();
```

### Model Registry (V2.1)

```typescript
import { getGlobalRegistry } from '@browser-ai/core';

const registry = getGlobalRegistry({ maxMemoryMB: 1500 });

// Acquire model with reference counting
const model = await registry.acquire('model-id', 'transformers', loaderFn);

// Release when done (starts idle timer)
registry.release('model-id');

// Check memory usage
const usage = registry.getMemoryUsage();
```

## Exports

### Types
- `BrowserAIConfig`, `GenerateParams`, `GenerateResult`
- `Provider`, `ProviderId`, `DetectResult`
- `ModelSpec`, `RuntimeState`, `DiagnosticsSnapshot`
- `BrowserAIError`, `ErrorCode`

### Storage
- `createCacheManager()` — CacheStorage-based caching
- `createOPFSManager()` — OPFS persistent storage (V1.0)
- `createLRUCacheManager()` — LRU eviction manager (V1.0)
- `createIDBManager()` — IndexedDB utilities

### Models
- `createModelManager()` — Multi-model management (V1.0)

### Plugins
- `createPluginManager()` — Plugin system (V1.0)
- `createLoggingPlugin()` — Built-in logging
- `createTelemetryPlugin()` — Built-in local telemetry

### Utils
- `getQuotaEstimate()` — Storage quota check
- `createError()` — Typed error creation

## License

MIT © 2026
