# browser-ai

> **"The jQuery of local AI"** — A unified API that abstracts browser AI runtime fragmentation (Native / WebNN / WebGPU / WASM).

[![npm version](https://img.shields.io/npm/v/@cohesiumai/browser-ai.svg)](https://www.npmjs.com/package/@cohesiumai/browser-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## Why browser-ai?

Running AI models directly in the browser offers **privacy**, **offline capability**, and **zero server costs**. However, the ecosystem is fragmented:

- **Chrome AI (Prompt API)** — Native, fast, but Chrome-only
- **WebLLM** — WebGPU-based, cross-browser, but requires model download
- **WebNN** — Hardware-accelerated, but limited browser support
- **WASM** — Universal fallback, but slower

**browser-ai** provides a single API that automatically selects the best available runtime.

## Features

- 🚀 **Zero Config** — Native AI when available, WebLLM fallback automatically
- 🔒 **Privacy-First** — All inference runs 100% locally in your browser
- ⚡ **Production-Ready** — FSM-based state management, typed errors, diagnostics
- 🧪 **CI-Friendly** — MockProvider for GPU-free testing
- 📦 **Modular** — Tree-shakeable, import only what you need
- 🎯 **TypeScript** — Full type safety with strict mode

## Installation

```bash
# Install the main package
npm install @cohesiumai/browser-ai

# Or with providers for full functionality
npm install @cohesiumai/browser-ai @cohesiumai/providers-webllm
```

## Quick Start

### React

```tsx
import { useLocalCompletion } from '@cohesiumai/react';
import { createNativeProvider } from '@cohesiumai/providers-native';
import { createWebLLMProvider } from '@cohesiumai/providers-webllm';

const config = {
  privacyMode: 'strict', // 'strict' | 'relaxed' | 'any'
  providerPolicy: { order: ['native', 'webllm'] },
};

const providers = [createNativeProvider(), createWebLLMProvider()];

function App() {
  const { state, output, generate, abort, error } = useLocalCompletion({
    config,
    providers,
    autoInit: true,
  });

  const handleGenerate = () => {
    generate({
      messages: [{ role: 'user', content: 'Explain quantum computing in 3 sentences.' }],
      maxTokens: 150,
      temperature: 0.7,
    });
  };

  return (
    <div>
      <p>Status: {state.name}</p>
      {error && <p style={{ color: 'red' }}>Error: {error.message}</p>}
      <button onClick={handleGenerate} disabled={state.name !== 'READY'}>
        Generate
      </button>
      {state.name === 'GENERATING' && <button onClick={abort}>Abort</button>}
      <pre>{output}</pre>
    </div>
  );
}
```

### Vanilla JavaScript

```typescript
import { createBrowserAI } from '@cohesiumai/core';
import { createWebLLMProvider } from '@cohesiumai/providers-webllm';

const ai = createBrowserAI({
  config: { providerPolicy: { order: ['webllm'] } },
  providers: [createWebLLMProvider()],
});

await ai.init();

const { result } = ai.generate({
  messages: [{ role: 'user', content: 'Hello!' }],
});

const response = await result;
console.log(response.text);
```

## Packages

### Core & Providers

| Package | Description | Size |
|---------|-------------|------|
| `@cohesiumai/core` | Core types, FSM, protocol, diagnostics, plugins | ~50KB |
| `@cohesiumai/providers-native` | Chrome AI (Prompt API) provider | ~3KB |
| `@cohesiumai/providers-webllm` | WebGPU/WebLLM provider | ~5KB + runtime |
| `@cohesiumai/providers-webnn` | WebNN hardware-accelerated provider | ~3KB |
| `@cohesiumai/providers-wasm` | WASM universal fallback provider | ~3KB |
| `@cohesiumai/providers-mock` | Mock provider for CI/testing | ~2KB |
| `@cohesiumai/react` | React hooks (`useLocalCompletion`) | ~4KB |
| `@cohesiumai/ui` | Pre-built UI components | ~8KB |

### Modules (v1.1+)

| Package | Version | Description |
|---------|---------|-------------|
| `@cohesiumai/modules-audio` | v1.1 | Local ASR, VAD, TTS (speech-to-text, voice detection, text-to-speech) |
| `@cohesiumai/modules-ocr` | v1.2 | Local OCR for images & PDFs with text extraction pipeline |
| `@cohesiumai/modules-memory` | v1.3 | Conversation context & local memory with IndexedDB |
| `@cohesiumai/modules-vlm` | v2.0 | Vision-Language Model for image understanding (tier 3 only) |

## Browser Support

| Browser | Native AI | WebLLM | WebNN | WASM | Status |
|---------|-----------|--------|-------|------|--------|
| Chrome 127+ | ✅ | ✅ | ✅ | ✅ | Full support |
| Chrome <127 | ❌ | ✅ | ⚠️ | ✅ | WebLLM/WASM |
| Edge 127+ | ✅ | ✅ | ✅ | ✅ | Full support |
| Firefox | ❌ | ✅ | ❌ | ✅ | WebLLM/WASM |
| Safari 18+ | ❌ | ⚠️ | ❌ | ✅ | WASM fallback |

## Configuration

```typescript
interface BrowserAIConfig {
  // Privacy mode controls which providers are allowed
  privacyMode?: 'strict' | 'relaxed' | 'any';
  
  // Provider selection policy
  providerPolicy: {
    order: ('native' | 'webllm' | 'webnn' | 'wasm' | 'mock')[];
  };
  
  // Optional timeouts
  timeouts?: {
    timeoutMultiplier?: number; // Default: 1.0
  };
  
  // Force a specific provider tier (V0.2+)
  tierOverride?: 'native' | 'webllm' | 'webnn' | 'wasm';
}
```

## State Machine

browser-ai uses a finite state machine with 12 states:

```
IDLE → BOOTING → SELECTING_PROVIDER → PREFLIGHT_QUOTA → CHECKING_CACHE
  ↓
DOWNLOADING → WARMING_UP → READY ⇄ GENERATING
  ↓
ERROR (recoverable) → READY
  ↓
TEARING_DOWN → IDLE
```

## Diagnostics

Get detailed runtime information:

```typescript
const diagnostics = ai.getDiagnostics();
// or
const diagnostics = completion.getDiagnostics();

console.log(diagnostics);
// {
//   schemaVersion: '1',
//   state: { name: 'READY', sinceMs: 1234567890 },
//   selectionReport: { selected: 'webllm', reasons: [...] },
//   capabilities: { hasWebGPU: true, hasWindowAI: false },
//   cache: { modelId: 'Llama-3.2-3B-Instruct-q4f16_1-MLC' },
//   timings: { bootMs: 2500 },
//   ...
// }
```

## Multi-Model Support (V1.0)

Load and switch between multiple models:

```typescript
import { createModelManager } from '@cohesiumai/core';

const manager = createModelManager({
  maxLoadedModels: 2,  // Keep up to 2 models in memory
  autoUnload: true,    // Auto-evict LRU model when limit reached
});

// Load models
await manager.loadModel(smallModelSpec, provider1);
await manager.loadModel(largeModelSpec, provider2);

// Switch active model
await manager.setActiveModel('large-model-id');

// Get active model for inference
const active = manager.getActiveModel();
```

## Plugin System (V1.0)

Extend browser-ai with plugins:

```typescript
import { createPluginManager, createLoggingPlugin } from '@cohesiumai/core';

const plugins = createPluginManager();

// Built-in logging plugin
plugins.register(createLoggingPlugin({ prefix: '[AI]' }));

// Custom plugin
plugins.register({
  name: 'analytics',
  afterGenerate(ctx) {
    trackEvent('ai_generate', { tokens: ctx.result.usage?.totalTokens });
  },
  onError(ctx) {
    reportError(ctx.error);
  },
});

// Available hooks:
// beforeInit, afterInit, beforeGenerate, afterGenerate,
// onToken, onStateChange, onError, beforeTeardown, afterTeardown
```

## OPFS Storage (V1.0)

Persistent model storage that survives cache clearing:

```typescript
import { createOPFSManager } from '@cohesiumai/core';

const opfs = createOPFSManager();

if (opfs.isAvailable()) {
  // Store model shard
  await opfs.storeShard('model-id', 0, shardData);
  
  // Check storage info
  const info = await opfs.getStorageInfo();
  console.log(`Used: ${info.usedBytes} bytes, Models: ${info.models.length}`);
}
```

## LRU Cache (V1.0)

Automatic cache management:

```typescript
import { createLRUCacheManager } from '@cohesiumai/core';

const cache = await createLRUCacheManager({
  maxUsageRatio: 0.8,      // Use up to 80% of quota
  minFreeBytes: 500_000_000, // Keep 500MB free
});

// Auto-evict old models when needed
const { evicted, freedBytes } = await cache.autoEvict();

// Get storage stats
const stats = await cache.getStats();
console.log(`${stats.modelCount} models, ${stats.usedBytes} bytes used`);
```

## Unified Model Registry (V2.1)

Central memory management for all AI models across core and modules. Solves the problem of fragmented model loading where each module (audio, memory, VLM) loads models independently.

```typescript
import { getGlobalRegistry } from '@cohesiumai/core';

const registry = getGlobalRegistry({
  maxMemoryMB: 1500,           // Max total memory before LRU eviction
  defaultIdleTimeoutMs: 300000, // Auto-unload after 5min idle
});

// Acquire a model (loads if not cached, increments refCount)
const embedder = await registry.acquire(
  'Xenova/all-MiniLM-L6-v2',
  'transformers',
  async () => {
    const transformers = await import('@huggingface/transformers');
    return transformers.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  },
  { sizeEstimateMB: 90 }
);

// Release when done (decrements refCount, starts idle timer)
registry.release('Xenova/all-MiniLM-L6-v2');

// Check memory usage
const usage = registry.getMemoryUsage();
console.log(`Total: ${usage.totalMB}MB across ${usage.models.length} models`);

// Manual eviction if needed
const evicted = await registry.evictLRU(500); // Free 500MB
```

### Key Features

- **Reference Counting** — Models stay loaded while in use by any module
- **Auto-Teardown** — Automatic unload after configurable idle timeout
- **LRU Eviction** — Oldest unused models evicted when memory limit reached
- **Shared Instances** — Same model reused across audio, memory, VLM modules
- **Memory Tracking** — Real-time usage estimates per model

### How Modules Use It

All modules (`@cohesiumai/modules-audio`, `@cohesiumai/modules-memory`, `@cohesiumai/modules-vlm`) automatically use the global registry:

```typescript
// Behind the scenes in audio module:
this.asrPipeline = await registry.acquire('Xenova/whisper-tiny', 'transformers', loader);

// On teardown:
registry.release('Xenova/whisper-tiny');
// Model stays in memory for 5min in case another module needs it
```

## Installation from npm

All packages are published under the `@cohesiumai/*` scope on npm:

```bash
# Core + React + a provider
npm install @cohesiumai/core @cohesiumai/react @cohesiumai/providers-webllm

# Or with pnpm
pnpm add @cohesiumai/core @cohesiumai/react @cohesiumai/providers-webllm
```

### Available Packages

```bash
# Core
npm install @cohesiumai/core

# Providers
npm install @cohesiumai/providers-native
npm install @cohesiumai/providers-webllm
npm install @cohesiumai/providers-webnn
npm install @cohesiumai/providers-wasm
npm install @cohesiumai/providers-mock

# React bindings
npm install @cohesiumai/react
npm install @cohesiumai/ui

# Modules
npm install @cohesiumai/modules-audio
npm install @cohesiumai/modules-ocr
npm install @cohesiumai/modules-memory
npm install @cohesiumai/modules-vlm

# CLI
npm install -g @cohesiumai/cli
```

## Development

```bash
# Clone the repository
git clone https://github.com/CohesiumAI/browser-ai.git
cd browser-ai

# Install dependencies
pnpm install

# Build all packages (deterministic 4-phase order)
pnpm build
# Equivalent to: build:core → build:modules → build:packages → build:examples

# Build individual phases
pnpm run build:core      # @cohesiumai/core first
pnpm run build:modules   # @cohesiumai/modules-* (audio, ocr, memory, vlm)
pnpm run build:packages  # providers, react, ui, cli
pnpm run build:examples  # all examples last

# Run the Vite example
pnpm dev

# Run tests
pnpm test

# Type check
pnpm typecheck

# Full verification (lint + build + typecheck + test)
pnpm run verify
```

### Build Order

The monorepo uses a **deterministic build order** to ensure TypeScript declaration files (`.d.ts`) are generated before dependent packages:

1. **`@cohesiumai/core`** — Core types and utilities (no dependencies)
2. **`@cohesiumai/modules-*`** — Audio, OCR, Memory, VLM modules (depend on core)
3. **Other packages** — Providers, React bindings, UI, CLI
4. **Examples** — Demo applications (depend on all packages)

## Modules Usage

### Audio Module (v1.1)

```typescript
import { createAudioModule } from '@cohesiumai/modules-audio';

const audio = createAudioModule();
await audio.init({
  privacyMode: 'fully-local-managed',
  asr: { enabled: true, model: 'default', language: 'en' },
  vad: { enabled: true, sensitivity: 0.5 },
  tts: { enabled: true, voice: 'neutral' },
});

// Speech-to-text
const transcript = await audio.transcribe(audioBlob);
console.log(transcript.text);

// Voice activity detection
const vad = await audio.detectVoiceActivity(audioBuffer);
console.log(vad.isSpeech, vad.confidence);

// Text-to-speech
const speech = await audio.synthesize('Hello world!');
// speech.audioBuffer contains PCM audio data
```

### OCR Module (v1.2)

```typescript
import { createOcrModule } from '@cohesiumai/modules-ocr';

const ocr = createOcrModule();
await ocr.init({
  privacyMode: 'fully-local-managed',
  language: 'eng',
  pdf: { preferTextLayer: true },
});

// OCR an image
const imageResult = await ocr.ocrImage(imageBlob);
console.log(imageResult.text);

// OCR a PDF (extracts text layer first, falls back to OCR)
const pdfResult = await ocr.ocrPdf(pdfBlob);
console.log(pdfResult.pages);

// Extract chunks for RAG pipeline
const chunks = await ocr.extractChunks(pdfResult.text, {
  chunkSizeChars: 1000,
  overlapChars: 100,
});
```

### Memory Module (v1.3)

```typescript
import { createMemoryModule } from '@cohesiumai/modules-memory';

const memory = createMemoryModule();
await memory.init({
  privacyMode: 'fully-local-managed',
  conversationId: 'chat-123',
  maxTurns: 20,
  summaryEveryTurns: 10,
});

// Add conversation turns
await memory.addTurn({ role: 'user', content: 'Hello!', createdAtMs: Date.now() });
await memory.addTurn({ role: 'assistant', content: 'Hi there!', createdAtMs: Date.now() });

// Get context for prompt injection
const context = await memory.getContext();
console.log(context.summary, context.recentTurns);
```

### VLM Module (v2.0)

```typescript
import { createVlmModule, detectTier } from '@cohesiumai/modules-vlm';

// VLM requires tier 3 device (8+ CPU cores)
const tier = detectTier();
if (tier < 3) {
  console.warn('VLM works best on tier 3 devices');
}

const vlm = createVlmModule();
await vlm.init({
  privacyMode: 'fully-local-managed',
  requireTier3: true, // Set to false to allow on lower-tier devices
});

// Describe an image
const description = await vlm.describeImage(imageBlob);
console.log(description.text);

// Chat with image context
const response = await vlm.chatWithImage({
  image: imageBlob,
  prompt: 'What objects are in this image?',
});
console.log(response.text);
```

## Examples

- **[Vite Text](./examples/vite-text)** — Text generation example
- **[Vite Audio](./examples/vite-audio)** — Audio ASR/VAD/TTS demo
- **[Vite OCR](./examples/vite-ocr)** — Image & PDF OCR demo
- **[Vite Memory](./examples/vite-memory)** — Conversation memory demo
- **[Vite VLM](./examples/vite-vlm)** — Vision-Language Model demo
- **[Vite Full](./examples/vite-full)** — All modules combined
- **[Next.js](./examples/nextjs)** — Server-side rendering compatible

## Version History

### V2.1.1 — Current
- ✅ **Deterministic Build Order** — 4-phase build (core → modules → packages → examples)
- ✅ **Module Build Migration** — All modules use `tsup` for reliable `.d.ts` generation
- ✅ **CI Hardening** — `.d.ts` verification step, Playwright fix

### V2.1.0
- ✅ **Unified Model Registry** — Central memory management for all modules
- ✅ **Reference Counting** — Models stay loaded while in use
- ✅ **Auto-Teardown** — Automatic unload after idle timeout
- ✅ **LRU Eviction** — Memory-aware model eviction across modules
- ✅ **Abort Recovery Fix** — Watchdog timing reset after engine recreation
- ✅ **`onRecreate` Callback** — Provider-to-core communication for engine recreation
- ✅ **CI Stability** — Test suite improvements with proper mocks

### V2.0
- ✅ **VLM Module** — Local Vision-Language Model for image understanding (tier 3 only)
- ✅ **Full Example** — Demo page combining all modules

### V1.3
- ✅ **Memory Module** — Conversation context with IndexedDB storage
- ✅ **Local Summarization** — Auto-summarize long conversations

### V1.2
- ✅ **OCR Module** — Local image & PDF text extraction
- ✅ **Extractive Pipeline** — Chunk text for RAG workflows

### V1.1
- ✅ **Audio Module** — Local ASR (speech-to-text), VAD, TTS
- ✅ **Privacy-First Audio** — All processing 100% local

### V1.0
- ✅ **OPFS Storage** — Persistent model storage via Origin Private File System
- ✅ **LRU Cache Manager** — Automatic eviction when quota low
- ✅ **Multi-Model Support** — Load multiple models simultaneously
- ✅ **Plugin Architecture** — Extensible hooks system

### V0.2
- ✅ **WebNN Provider** — Hardware-accelerated inference
- ✅ **WASM Provider** — Universal fallback for all browsers
- ✅ **Healthcheck Token-Aware** — Smarter stall detection
- ✅ **Download Watchdog** — Stuck download detection
- ✅ **tierOverride Config** — Force specific provider

### V0.1
- ✅ Native provider (Chrome AI Prompt API)
- ✅ WebLLM provider (WebGPU)
- ✅ Mock provider for CI
- ✅ FSM with 12 states
- ✅ Epoch/Seq anti-race protocol
- ✅ Quota preflight check
- ✅ React hooks & Streaming
- ✅ Diagnostics API
- ✅ TypeScript strict mode

### Roadmap
- 🔜 Real WASM model integration (Whisper, Piper TTS, Tesseract)
- 🔜 WebGPU VLM model integration
- 🔜 Function calling support
- 🔜 Model fine-tuning in browser

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) first.

### Quick Contribution Workflow

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/browser-ai.git
cd browser-ai

# 2. Create a feature branch
git checkout -b feature/my-feature

# 3. Make changes and verify
pnpm run verify

# 4. Add a changeset (for version bump + changelog)
pnpm changeset

# 5. Commit and push
git add .
git commit -m "feat(core): add new feature"
git push origin feature/my-feature

# 6. Open a Pull Request
```

## License

MIT © 2026
