# Architecture

browser-ai is designed as a modular, extensible library for running AI models locally in the browser.

**Version: 2.1** — This document covers all versions from v0.1 to v2.1.

## Overview

```
┌───────────────────────────────────────────────────────────────────────┐
│                         Your Application                               │
├───────────────────────────────────────────────────────────────────────┤
│  @cohesiumai/react    │  @cohesiumai/ui   │  @cohesiumai/cli (v1.0+) │
│  (useLocalCompletion) │  (AIPopover)      │  (eject-worker)          │
├───────────────────────────────────────────────────────────────────────┤
│                         @cohesiumai/core                               │
│  ┌───────┐ ┌──────────┐ ┌───────────┐ ┌─────────┐ ┌─────────────────┐│
│  │  FSM  │ │ Protocol │ │ Diagnostics│ │ Storage │ │ Plugins (v1.0+)││
│  └───────┘ └──────────┘ └───────────┘ └─────────┘ └─────────────────┘│
├───────────────────────────────────────────────────────────────────────┤
│                         Provider Layer                                 │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐              │
│  │ Native │ │ WebLLM │ │ WebNN  │ │  WASM  │ │  Mock  │              │
│  │ (v0.1) │ │ (v0.1) │ │ (v0.2) │ │ (v0.2) │ │ (v0.1) │              │
│  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘              │
├───────────────────────────────────────────────────────────────────────┤
│                         Modules (v1.1+)                                │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐ │
│  │ Audio v1.1  │ │  OCR v1.2   │ │ Memory v1.3 │ │   VLM v2.0      │ │
│  │ (ASR/VAD/   │ │ (Tesseract) │ │ (IndexedDB) │ │ (Tier 3 only)   │ │
│  │  TTS)       │ │             │ │             │ │                 │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────────┘ │
├───────────────────────────────────────────────────────────────────────┤
│                      Browser Runtime                                   │
│  ┌──────────┐ ┌────────┐ ┌───────┐ ┌──────┐ ┌───────────┐ ┌────────┐│
│  │Prompt API│ │ WebGPU │ │ WebNN │ │ WASM │ │ IndexedDB │ │  OPFS  ││
│  └──────────┘ └────────┘ └───────┘ └──────┘ └───────────┘ └────────┘│
└───────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. BrowserAI Class

The main orchestrator that manages:
- Provider selection
- State transitions
- Generation lifecycle
- Diagnostics collection

```typescript
class BrowserAI {
  constructor(options: BrowserAIOptions);
  
  init(): Promise<void>;
  generate(params: GenerateParams): GenerateResponse;
  abort(): void;
  teardown(): Promise<void>;
  
  getState(): RuntimeState;
  getDiagnostics(): DiagnosticsSnapshot;
  subscribe(listener: StateListener): Unsubscribe;
}
```

### 2. Finite State Machine (FSM)

The FSM ensures predictable state transitions and prevents race conditions.

#### States

| State | Description |
|-------|-------------|
| `IDLE` | Initial state, not initialized |
| `BOOTING` | Starting initialization |
| `SELECTING_PROVIDER` | Choosing best available provider |
| `PREFLIGHT_QUOTA` | Checking storage quota |
| `CHECKING_CACHE` | Checking if model is cached |
| `DOWNLOADING` | Downloading model weights |
| `WARMING_UP` | Loading model into GPU/memory |
| `READY` | Ready to generate |
| `GENERATING` | Actively generating tokens |
| `ABORTING` | Abort requested, cleaning up |
| `ERROR` | Error state (may be recoverable) |
| `TEARING_DOWN` | Shutting down |

#### State Diagram

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
┌──────┐      ┌─────────┐      ┌───────────────────┐         │
│ IDLE │─────▶│ BOOTING │─────▶│ SELECTING_PROVIDER│         │
└──────┘      └─────────┘      └───────────────────┘         │
    ▲                                    │                    │
    │                                    ▼                    │
    │                          ┌─────────────────┐           │
    │                          │ PREFLIGHT_QUOTA │           │
    │                          └─────────────────┘           │
    │                                    │                    │
    │                                    ▼                    │
    │                          ┌────────────────┐            │
    │                          │ CHECKING_CACHE │            │
    │                          └────────────────┘            │
    │                                    │                    │
    │              ┌─────────────────────┼─────────────────┐ │
    │              ▼                     ▼                 │ │
    │       ┌─────────────┐       ┌────────────┐          │ │
    │       │ DOWNLOADING │──────▶│ WARMING_UP │          │ │
    │       └─────────────┘       └────────────┘          │ │
    │                                    │                 │ │
    │                                    ▼                 │ │
    │   ┌────────────────────────────────────────────┐    │ │
    │   │                   READY                     │◀───┘ │
    │   └────────────────────────────────────────────┘      │
    │              │                     ▲                   │
    │              ▼                     │                   │
    │       ┌────────────┐        ┌───────────┐             │
    │       │ GENERATING │───────▶│ ABORTING  │             │
    │       └────────────┘        └───────────┘             │
    │              │                                         │
    │              ▼                                         │
    │       ┌───────────┐                                   │
    │       │   ERROR   │───────────────────────────────────┘
    │       └───────────┘
    │              │
    │              ▼
    │       ┌──────────────┐
    └───────│ TEARING_DOWN │
            └──────────────┘
```

### 3. Provider Interface

All providers implement the same interface:

```typescript
interface Provider {
  readonly id: ProviderId;
  
  detect(config: BrowserAIConfig): Promise<DetectResult>;
  init(config: BrowserAIConfig, model?: ModelSpec): Promise<void>;
  generate(params: GenerateParams, onToken: TokenCallback): Promise<GenerateResult>;
  abort(): void;
  teardown(): Promise<void>;
  
  getDownloadProgress(): DownloadProgress;
}
```

### 4. Protocol Layer

#### Epoch/Sequence Anti-Race Protocol

Each generation request is assigned:
- **Epoch**: Increments with each new request
- **Sequence**: Increments with each token in a request

This prevents race conditions when:
- User aborts and starts a new generation
- Multiple rapid requests are made
- Tokens from old requests arrive late

```typescript
interface TokenEvent {
  type: 'token';
  token: string;
  epoch: number;
  seq: number;
}
```

### 5. Selection Algorithm

Provider selection follows this flow:

1. **Privacy Filter**: Remove providers that don't meet privacy requirements
2. **Capability Probe**: Test each provider's `detect()` method
3. **Order Policy**: Select first available provider from the configured order

```typescript
// Example: Privacy-first selection
config = {
  privacyMode: 'strict',
  providerPolicy: { order: ['native', 'webllm'] }
};

// 1. Filter: Both native and webllm pass 'strict' privacy
// 2. Probe: native.detect() → { available: false }
//           webllm.detect() → { available: true }
// 3. Order: Skip native (unavailable), select webllm
```

## Package Structure

```
browser-ai/
├── packages/
│   ├── core/                    # Core library
│   │   ├── src/
│   │   │   ├── browser-ai.ts       # Main class
│   │   │   ├── fsm/                # State machine
│   │   │   ├── protocol/           # Epoch/seq protocol
│   │   │   ├── selection/          # Provider selector
│   │   │   ├── storage/            # OPFS, LRU (v1.0+)
│   │   │   ├── plugins/            # Plugin system (v1.0+)
│   │   │   ├── models/             # Model manager (v1.0+)
│   │   │   ├── types/              # TypeScript types
│   │   │   └── utils/              # Utilities
│   │   └── package.json
│   │
│   ├── providers-native/        # Chrome AI provider (v0.1+)
│   ├── providers-webllm/        # WebLLM provider (v0.1+)
│   ├── providers-webnn/         # WebNN provider (v0.2+)
│   ├── providers-wasm/          # WASM provider (v0.2+)
│   ├── providers-mock/          # Mock provider (v0.1+)
│   │
│   ├── modules/                 # AI Modules (v1.1+)
│   │   ├── audio/                  # ASR, VAD, TTS (v1.1)
│   │   ├── ocr/                    # Image & PDF OCR (v1.2)
│   │   ├── memory/                 # Conversation context (v1.3)
│   │   └── vlm/                    # Vision-Language (v2.0)
│   │
│   ├── cli/                     # CLI tools (v1.0+)
│   ├── react/                   # React bindings
│   └── ui/                      # UI components
│
├── examples/
│   ├── vite-text/               # Text generation
│   ├── vite-audio/              # Audio demo (v1.1+)
│   ├── vite-ocr/                # OCR demo (v1.2+)
│   ├── vite-memory/             # Memory demo (v1.3+)
│   ├── vite-vlm/                # VLM demo (v2.0+)
│   ├── vite-full/               # All modules combined
│   └── nextjs/                  # Next.js example
│
└── docs/                        # Documentation
```

## Data Flow

### Generation Flow

```
1. User calls generate({ messages })
   │
2. FSM transitions: READY → GENERATING
   │
3. Protocol creates envelope with new epoch
   │
4. Provider.generate() called
   │
5. For each token:
   │   ├── Verify epoch matches current
   │   ├── Create TokenEvent with seq++
   │   └── Emit to stream/callback
   │
6. On completion:
   │   ├── Create FinalEvent
   │   └── FSM transitions: GENERATING → READY
   │
7. Return GenerateResult
```

### Error Handling Flow

```
1. Error occurs
   │
2. Wrap in BrowserAIError with:
   │   ├── code: ErrorCode
   │   ├── message: string
   │   ├── recoverability: 'recoverable' | 'non-recoverable'
   │   └── userAction?: string
   │
3. FSM transitions to ERROR state
   │
4. If recoverable:
   │   └── Can transition back to READY
   │
5. If non-recoverable:
       └── Must call teardown() and reinitialize
```

## Watchdog System (v0.2+)

### Healthcheck Watchdog

Monitors generation health and detects stalls:

```typescript
// Timeouts (configurable via timeoutMultiplier)
const PREFILL_TIMEOUT = 60_000;    // Max time before first token
const TOKEN_SILENCE = 30_000;       // Max time between tokens
```

#### State-Aware Monitoring

- **Prefill phase** (`lastTokenAtMs === 0`): Uses `prefillTimeout`
- **Token phase** (`lastTokenAtMs > 0`): Uses `tokenSilenceTimeout`

#### Abort Recovery (v2.1+)

When a user aborts generation:
1. Provider flags engine for recreation
2. On next `generate()`, engine is recreated (~30-60s)
3. Provider calls `onRecreate` callback
4. Core resets FSM timing via `resetGeneratingTiming()`
5. Watchdog starts fresh countdown

```
User aborts → Engine flagged → Next generate()
                                    ↓
                            Engine recreation
                                    ↓
                            onRecreate callback
                                    ↓
                          FSM timing reset (sinceMs = now)
                                    ↓
                          Watchdog starts fresh
```

### Download Watchdog

Detects stuck downloads during model initialization:

- **Stuck threshold**: 5 minutes without progress
- **Checks**: Every 30 seconds during DOWNLOADING state

---

## Security Considerations

### Privacy Modes

| Mode | Native | WebLLM | Description |
|------|--------|--------|-------------|
| `strict` | ✅ | ✅ | Only providers that guarantee local-only processing |
| `relaxed` | ✅ | ✅ | Allows providers that claim on-device processing |
| `any` | ✅ | ✅ | No privacy restrictions |

### Content Security Policy

For WebLLM, ensure your CSP allows:
- `worker-src 'self' blob:`
- `script-src 'self' 'wasm-unsafe-eval'`

### Storage

Models are stored in the browser's Cache API:
- Survives page reloads
- Cleared with browser cache
- ~500MB-5GB per model depending on size

## Performance Characteristics

| Metric | Native | WebLLM (3B) | WebLLM (8B) |
|--------|--------|-------------|-------------|
| Cold start | ~100ms | ~30s | ~60s |
| Warm start | ~50ms | ~2s | ~5s |
| Tokens/sec | ~30 | ~15-25 | ~8-15 |
| Memory | Browser managed | ~2-3GB | ~5-6GB |

*Benchmarks on M1 MacBook Pro, Chrome 127*
