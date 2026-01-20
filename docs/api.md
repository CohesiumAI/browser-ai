# API Reference

Complete API documentation for browser-ai v0.1 to v2.1.

## Table of Contents

- [Core](#core)
  - [createBrowserAI](#createbrowserai)
  - [BrowserAI](#browserai)
- [Storage (v1.0+)](#storage-v10)
  - [createOPFSManager](#createopfsmanager)
  - [createLRUCacheManager](#createlrucachemanager)
  - [createModelManager](#createmodelmanager)
- [Plugins (v1.0+)](#plugins-v10)
  - [createPluginManager](#createpluginmanager)
- [Model Registry (v2.1+)](#model-registry-v21)
  - [getGlobalRegistry](#getglobalregistry)
- [React](#react)
  - [useLocalCompletion](#uselocalcompletion)
- [UI Components](#ui-components)
  - [AIPopover](#aipopover)
- [Providers](#providers)
  - [createNativeProvider](#createnativeprovider)
  - [createWebLLMProvider](#createwebllmprovider)
  - [createWebNNProvider (v0.2+)](#createwebnnprovider-v02)
  - [createWASMProvider (v0.2+)](#createwasmprovider-v02)
  - [createMockProvider](#createmockprovider)
- [Modules](#modules)
  - [Audio (v1.1+)](#audio-module-v11)
  - [OCR (v1.2+)](#ocr-module-v12)
  - [Memory (v1.3+)](#memory-module-v13)
  - [VLM (v2.0+)](#vlm-module-v20)
- [Types](#types)
- [Utilities](#utilities)

---

## Core

### createBrowserAI

Factory function to create a BrowserAI instance.

```typescript
function createBrowserAI(options: BrowserAIOptions): BrowserAI;
```

#### Parameters

```typescript
interface BrowserAIOptions {
  config: BrowserAIConfig;
  providers: Provider[];
}

interface BrowserAIConfig {
  /**
   * Privacy mode controls provider selection.
   * - 'strict': Only providers guaranteeing local processing
   * - 'relaxed': Providers claiming on-device processing
   * - 'any': No restrictions
   * @default 'any'
   */
  privacyMode?: 'strict' | 'relaxed' | 'any';

  /**
   * Provider selection policy.
   */
  providerPolicy: {
    /** Order of providers to try */
    order: ProviderId[];
  };

  /**
   * Timeout configuration.
   */
  timeouts?: {
    /** Multiplier for all timeouts @default 1.0 */
    timeoutMultiplier?: number;
  };
}
```

#### Example

```typescript
import { createBrowserAI } from '@cohesiumai/core';
import { createWebLLMProvider } from '@cohesiumai/providers-webllm';

const ai = createBrowserAI({
  config: {
    privacyMode: 'strict',
    providerPolicy: { order: ['webllm'] },
  },
  providers: [createWebLLMProvider()],
});
```

---

### BrowserAI

Main class for managing AI inference.

#### Methods

##### `init()`

Initialize the AI runtime. Downloads model if needed.

```typescript
async init(): Promise<void>
```

**Throws**: `BrowserAIError` if initialization fails.

```typescript
try {
  await ai.init();
  console.log('Ready!');
} catch (error) {
  if (error.code === 'ERROR_QUOTA_PREFLIGHT_FAIL') {
    console.log('Not enough storage:', error.userAction);
  }
}
```

##### `generate()`

Generate a completion.

```typescript
generate(params: GenerateParams): GenerateResponse
```

**Parameters**:

```typescript
interface GenerateParams {
  /** Conversation messages */
  messages: ChatMessage[];
  
  /** Maximum tokens to generate @default 512 */
  maxTokens?: number;
  
  /** Temperature (0-1) @default 0.6 */
  temperature?: number;
  
  /** Top-p nucleus sampling @default 0.95 */
  topP?: number;
  
  /** Enable streaming @default false */
  stream?: boolean;
  
  /** Token callback (alternative to stream) */
  onToken?: (token: string) => void;
  
  /** Called when provider recreates engine after abort (v2.1+) */
  onRecreate?: () => void;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

**Returns**:

```typescript
interface GenerateResponse {
  /** Async iterable of events (if stream: true) */
  stream?: AsyncIterable<TokenEvent | FinalEvent>;
  
  /** Promise resolving to final result */
  result: Promise<GenerateResult>;
}

interface GenerateResult {
  /** Generated text */
  text: string;
  
  /** Token usage statistics */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  /** Selection report ID for diagnostics */
  selectionReportId?: string;
}
```

**Example**:

```typescript
// Simple generation
const { result } = ai.generate({
  messages: [{ role: 'user', content: 'Hello!' }],
});
const response = await result;
console.log(response.text);

// Streaming
const { stream } = ai.generate({
  messages: [{ role: 'user', content: 'Write a story' }],
  stream: true,
});

for await (const event of stream!) {
  if (event.type === 'token') {
    process.stdout.write(event.token);
  }
}
```

##### `abort()`

Abort the current generation.

```typescript
abort(): void
```

```typescript
// Start generation
const { result } = ai.generate({ messages: [...] });

// Abort after 5 seconds
setTimeout(() => ai.abort(), 5000);

try {
  await result;
} catch (error) {
  if (error.code === 'ERROR_ABORTED') {
    console.log('Generation was aborted');
  }
}
```

##### `teardown()`

Clean up resources and reset state.

```typescript
async teardown(): Promise<void>
```

```typescript
await ai.teardown();
// ai is now in IDLE state
```

##### `getState()`

Get the current runtime state.

```typescript
getState(): RuntimeState
```

```typescript
interface RuntimeState {
  name: StateName;
  sinceMs: number;
  providerId?: ProviderId;
  error?: BrowserAIError;
  // ... state-specific fields
}

type StateName =
  | 'IDLE'
  | 'BOOTING'
  | 'SELECTING_PROVIDER'
  | 'PREFLIGHT_QUOTA'
  | 'CHECKING_CACHE'
  | 'DOWNLOADING'
  | 'WARMING_UP'
  | 'READY'
  | 'GENERATING'
  | 'ABORTING'
  | 'ERROR'
  | 'TEARING_DOWN';
```

##### `getDiagnostics()`

Get comprehensive diagnostics snapshot.

```typescript
getDiagnostics(): DiagnosticsSnapshot
```

```typescript
interface DiagnosticsSnapshot {
  schemaVersion: string;
  generatedAtMs: number;
  libVersion: string;
  
  state: RuntimeState;
  selectionReport?: SelectionReport;
  
  privacy: {
    privacyMode: PrivacyMode;
    runtimeMode: RuntimePrivacyMode;
    note?: string;
  };
  
  env: {
    userAgent: string;
    platform: string;
    language: string;
    hardwareConcurrency: number;
    deviceMemoryGB?: number;
    isSecureContext: boolean;
    crossOriginIsolated: boolean;
  };
  
  capabilities: {
    hasWindowAI: boolean;
    hasWebGPU: boolean;
    hasWebNN: boolean;
    hasStorageEstimate: boolean;
    hasCacheStorage: boolean;
    hasIndexedDB: boolean;
  };
  
  storage?: {
    supported: boolean;
    usageBytes?: number;
    quotaBytes?: number;
  };
  
  cache?: {
    modelId?: string;
  };
  
  timings?: {
    bootMs?: number;
    lastStateChangeAtMs?: number;
  };
  
  recentErrors: BrowserAIError[];
}
```

##### `subscribe()`

Subscribe to state changes.

```typescript
subscribe(listener: (state: RuntimeState, prev: RuntimeState) => void): () => void
```

**Returns**: Unsubscribe function.

```typescript
const unsubscribe = ai.subscribe((state, prev) => {
  console.log(`State changed: ${prev.name} → ${state.name}`);
});

// Later: stop listening
unsubscribe();
```

---

## React

### useLocalCompletion

React hook for local AI completion.

```typescript
function useLocalCompletion(options: UseLocalCompletionOptions): UseLocalCompletionResult;
```

#### Parameters

```typescript
interface UseLocalCompletionOptions {
  config: BrowserAIConfig;
  providers: Provider[];
  
  /** Auto-initialize on mount @default false */
  autoInit?: boolean;
}
```

#### Returns

```typescript
interface UseLocalCompletionResult {
  /** Current runtime state */
  state: RuntimeState;
  
  /** Generated output text */
  output: string;
  
  /** Current error (if any) */
  error: Error | null;
  
  /** Initialize the runtime */
  init: () => Promise<void>;
  
  /** Generate completion */
  generate: (params: GenerateParams) => void;
  
  /** Abort generation */
  abort: () => void;
  
  /** Clean up resources */
  teardown: () => Promise<void>;
  
  /** Get diagnostics */
  getDiagnostics: () => DiagnosticsSnapshot;
}
```

#### Example

```tsx
function ChatComponent() {
  const {
    state,
    output,
    error,
    generate,
    abort,
    getDiagnostics,
  } = useLocalCompletion({
    config: { providerPolicy: { order: ['webllm'] } },
    providers: [createWebLLMProvider()],
    autoInit: true,
  });

  const isReady = state.name === 'READY';
  const isGenerating = state.name === 'GENERATING';

  return (
    <div>
      <p>Status: {state.name}</p>
      
      {error && <p className="error">{error.message}</p>}
      
      <button
        onClick={() => generate({
          messages: [{ role: 'user', content: 'Hello!' }],
        })}
        disabled={!isReady}
      >
        Generate
      </button>
      
      {isGenerating && (
        <button onClick={abort}>Cancel</button>
      )}
      
      <pre>{output}</pre>
      
      <button onClick={() => console.log(getDiagnostics())}>
        Log Diagnostics
      </button>
    </div>
  );
}
```

---

## UI Components

### AIPopover

Pre-built chat popover component.

```typescript
function AIPopover(props: AIPopoverProps): JSX.Element;
```

#### Props

```typescript
interface AIPopoverProps {
  /** Completion hook result */
  completion: UseLocalCompletionResult;
  
  /** Input placeholder @default "Ask me anything..." */
  placeholder?: string;
  
  /** Additional CSS class */
  className?: string;
}
```

#### Example

```tsx
import { AIPopover } from '@cohesiumai/ui';
import { useLocalCompletion } from '@cohesiumai/react';

function App() {
  const completion = useLocalCompletion({
    config: { providerPolicy: { order: ['webllm'] } },
    providers: [createWebLLMProvider()],
    autoInit: true,
  });

  return (
    <AIPopover
      completion={completion}
      placeholder="Type your question..."
    />
  );
}
```

---

## Providers

### createNativeProvider

Create a Chrome AI (Prompt API) provider.

```typescript
function createNativeProvider(): Provider;
```

**Requirements**:
- Chrome 127+ with AI features enabled
- `chrome://flags/#prompt-api-for-gemini-nano` = Enabled

```typescript
import { createNativeProvider } from '@cohesiumai/providers-native';

const provider = createNativeProvider();
// provider.id === 'native'
```

### createWebLLMProvider

Create a WebLLM (WebGPU) provider.

```typescript
function createWebLLMProvider(): Provider;
```

**Requirements**:
- Browser with WebGPU support
- Sufficient storage for model (~500MB-5GB)

```typescript
import { createWebLLMProvider } from '@cohesiumai/providers-webllm';

const provider = createWebLLMProvider();
// provider.id === 'webllm'
```

### createMockProvider

Create a mock provider for testing.

```typescript
function createMockProvider(options?: MockProviderOptions): Provider;
```

#### Options

```typescript
interface MockProviderOptions {
  /**
   * Scenario to simulate
   * - 'happy': Successful responses
   * - 'slow': Delayed responses
   * - 'error': Always errors
   */
  scenario?: 'happy' | 'slow' | 'error';
}
```

```typescript
import { createMockProvider } from '@cohesiumai/providers-mock';

// For happy path tests
const mockProvider = createMockProvider({ scenario: 'happy' });

// For error handling tests
const errorProvider = createMockProvider({ scenario: 'error' });
```

---

## Types

### Error Types

```typescript
interface BrowserAIError extends Error {
  code: ErrorCode;
  message: string;
  recoverability: 'recoverable' | 'non-recoverable';
  userAction?: string;
  details?: unknown;
  cause?: Error;
}

type ErrorCode =
  | 'ERROR_UNKNOWN'
  | 'ERROR_ABORTED'
  | 'ERROR_INVALID_STATE'
  | 'ERROR_INVALID_CONFIG'
  | 'ERROR_NATIVE_UNAVAILABLE'
  | 'ERROR_WEBGPU_UNAVAILABLE'
  | 'ERROR_QUOTA_PREFLIGHT_FAIL'
  | 'ERROR_DOWNLOAD_FAILED'
  | 'ERROR_MODEL_LOAD_FAILED'
  | 'ERROR_GENERATION_FAILED';
```

### Provider Types

```typescript
type ProviderId = 'native' | 'webllm' | 'mock';

interface Provider {
  readonly id: ProviderId;
  detect(config: BrowserAIConfig): Promise<DetectResult>;
  init(config: BrowserAIConfig, model?: ModelSpec): Promise<void>;
  generate(params: GenerateParams, onToken: TokenCallback): Promise<GenerateResult>;
  abort(): void;
  teardown(): Promise<void>;
  getDownloadProgress(): DownloadProgress;
}

interface DetectResult {
  available: boolean;
  reason?: string;
}

interface DownloadProgress {
  downloadedBytes?: number;
  totalBytes?: number;
  text?: string;
}
```

### Event Types

```typescript
interface TokenEvent {
  type: 'token';
  token: string;
  epoch: number;
  seq: number;
}

interface FinalEvent {
  type: 'final';
  text: string;
  usage?: TokenUsage;
  epoch: number;
  seq: number;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
```

### Model Types

```typescript
interface ModelSpec {
  id: string;
  label: string;
  provider: 'native' | 'webllm';
  source: 'prebuilt' | 'custom';
  hfRepo?: string;
  contextWindowTokens: number;
  sizeBytes: number;
  tier: 1 | 2 | 3;
}
```

---

## Storage (v1.0+)

### createOPFSManager

Origin Private File System storage for persistent model caching.

```typescript
import { createOPFSManager } from '@cohesiumai/core';

const opfs = createOPFSManager();

if (opfs.isAvailable()) {
  await opfs.storeShard('model-id', 0, shardData);
  const shard = await opfs.readShard('model-id', 0);
  const info = await opfs.getStorageInfo();
}
```

### createLRUCacheManager

Automatic eviction of old models when storage quota is low.

```typescript
import { createLRUCacheManager } from '@cohesiumai/core';

const cache = await createLRUCacheManager({
  maxUsageRatio: 0.8,
  minFreeBytes: 500_000_000,
});

const { evicted, freedBytes } = await cache.autoEvict();
const stats = await cache.getStats();
```

### createModelManager

Load and manage multiple models simultaneously.

```typescript
import { createModelManager } from '@cohesiumai/core';

const manager = createModelManager({
  maxLoadedModels: 2,
  autoUnload: true,
});

await manager.loadModel(modelSpec, provider);
await manager.setActiveModel('model-id');
const active = manager.getActiveModel();
```

---

## Plugins (v1.0+)

### createPluginManager

Extensible plugin system for browser-ai.

```typescript
import { createPluginManager, createLoggingPlugin } from '@cohesiumai/core';

const plugins = createPluginManager();
plugins.register(createLoggingPlugin({ prefix: '[AI]' }));

// Custom plugin
plugins.register({
  name: 'analytics',
  afterGenerate(ctx) {
    trackEvent('ai_generate', { tokens: ctx.result.usage?.totalTokens });
  },
});
```

**Available hooks:**
- `beforeInit`, `afterInit`
- `beforeGenerate`, `afterGenerate`
- `onToken`, `onStateChange`
- `onError`
- `beforeTeardown`, `afterTeardown`

---

## Model Registry (v2.1+)

### getGlobalRegistry

Central memory management for all AI models across core and modules.

```typescript
import { getGlobalRegistry } from '@cohesiumai/core';

const registry = getGlobalRegistry({
  maxMemoryMB: 1500,           // Max total memory before LRU eviction
  defaultIdleTimeoutMs: 300000, // Auto-unload after 5min idle
});
```

#### Methods

##### `acquire()`

Load or retrieve a model with reference counting.

```typescript
const model = await registry.acquire(
  'model-id',           // Unique identifier
  'transformers',       // Loader type
  async () => loadFn(), // Loader function (called if not cached)
  { sizeEstimateMB: 90 } // Options
);
```

##### `release()`

Decrement reference count and start idle timer.

```typescript
registry.release('model-id');
// Model stays loaded for idleTimeoutMs, then auto-unloads if unused
```

##### `evictLRU()`

Manually evict least-recently-used models to free memory.

```typescript
const evicted = await registry.evictLRU(500); // Free 500MB
console.log(`Evicted ${evicted.length} models`);
```

##### `getMemoryUsage()`

Get current memory usage statistics.

```typescript
const usage = registry.getMemoryUsage();
// { totalMB: 850, models: [{ id: '...', sizeMB: 90, refCount: 1 }] }
```

---

## Modules

### Audio Module (v1.1+)

```typescript
import { createAudioModule } from '@cohesiumai/modules-audio';

const audio = createAudioModule();
await audio.init({ privacyMode: 'fully-local-managed', asr: { enabled: true } });

const result = await audio.transcribe(audioBlob);
const vad = await audio.detectVoiceActivity(audioBuffer);
const speech = await audio.synthesize('Hello');
```

**Methods:** `init`, `transcribe`, `transcribeStream`, `detectVoiceActivity`, `synthesize`, `getState`, `getDiagnostics`, `teardown`

### OCR Module (v1.2+)

```typescript
import { createOcrModule } from '@cohesiumai/modules-ocr';

const ocr = createOcrModule();
await ocr.init({ privacyMode: 'fully-local-managed', language: 'eng' });

const result = await ocr.ocrImage(imageBlob);
const pdfResult = await ocr.ocrPdf(pdfBlob);
const chunks = await ocr.runExtractivePipeline(text, { chunkSizeChars: 1200 });
```

**Methods:** `init`, `ocrImage`, `ocrPdf`, `runExtractivePipeline`, `getState`, `getDiagnostics`, `teardown`

### Memory Module (v1.3+)

```typescript
import { createMemoryModule } from '@cohesiumai/modules-memory';

const memory = createMemoryModule();
await memory.init({ privacyMode: 'fully-local-managed', conversationId: 'chat-1' });

await memory.addTurn({ role: 'user', content: 'Hello', createdAtMs: Date.now() });
const context = await memory.getContext();
const results = await memory.search('query', { topK: 5 });
```

**Methods:** `init`, `addTurn`, `getContext`, `search`, `clearConversation`, `getState`, `getDiagnostics`, `teardown`

### VLM Module (v2.0+)

```typescript
import { createVlmModule, isVlmSupported, detectTier } from '@cohesiumai/modules-vlm';

const support = isVlmSupported();
if (support.supported) {
  const vlm = createVlmModule();
  await vlm.init({ privacyMode: 'fully-local-managed' });
  
  const desc = await vlm.describeImage(imageBlob);
  const chat = await vlm.chatWithImage({ image: imageBlob, prompt: 'What is this?' });
}
```

**Methods:** `init`, `describeImage`, `chatWithImage`, `getState`, `getDiagnostics`, `teardown`

**Helpers:** `detectTier()`, `isVlmSupported()`, `tryCreateVlmModule()`

---

## Utilities

### Tier Detection

```typescript
import { detectTier, getEffectiveTier } from '@cohesiumai/core';

const tier = detectTier(); // 1, 2, or 3
const effective = getEffectiveTier(config.tierOverride); // respects override
```

### Config Validation

```typescript
import { validateConfig, checkPublicBaseUrlRequired } from '@cohesiumai/core';

validateConfig(config); // throws if invalid
const urlCheck = checkPublicBaseUrlRequired(config);
```

### Message Adapter

```typescript
import { flattenSystemPrompts, validateMessages } from '@cohesiumai/core';

const { messages, systemWasFlattened } = flattenSystemPrompts(originalMessages);
validateMessages(messages); // throws if empty
```

### Retry Budgeter

```typescript
import { createRetryBudgeter } from '@cohesiumai/core';

const budgeter = createRetryBudgeter({ maxRetries: 2 });
const budget = budgeter.createBudget('request-id', 256);
const adjustedParams = budgeter.prepareRetry('request-id', params, 'error');
```
