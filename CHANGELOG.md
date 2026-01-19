# Changelog

All notable changes to browser-ai will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.1.0] - 2026-01-19

### Added

#### Unified Model Registry (`@browser-ai/core`)
- **`getGlobalRegistry()`** — Central memory management for all AI models across core and modules
  - Reference counting for shared model instances
  - Auto-teardown after configurable idle timeout
  - LRU eviction when memory limit reached
  - Methods: `acquire`, `release`, `evictLRU`, `getMemoryUsage`

#### Abort Recovery Improvements
- **`GenerateParams.onRecreate`** — Callback notifying core when provider recreates engine after abort
- **`StateMachine.resetGeneratingTiming()`** — Reset GENERATING state timing after engine recreation
- **Watchdog timing reset** — Prevents premature abort detection after engine recreation

### Fixed

- **WebLLM abort recovery** — Fixed issue where watchdog would prematurely abort after engine recreation
  - Engine recreation time (~30-60s) no longer counts toward prefill timeout
  - Core is notified via `onRecreate` callback to reset watchdog timing
- **Healthcheck watchdog** — `lastTokenAtMs` properly reset to 0 on new GENERATING state

### Tests
- CI stability with `--passWithNoTests` flag for packages without tests
- Fixed Node environment mocks for OCR, VLM, and Audio module tests

---

## [2.0.0] - 2026-01-13

### Added

#### VLM Module (`@browser-ai/modules-vlm`)
- **`createVlmModule()`** — Local Vision-Language Model for image understanding
  - **Tier 3 only** — Requires high-end device (8+ CPU cores, WebGPU)
  - Image captioning with `describeImage()`
  - Visual Q&A with `chatWithImage()`
  - WebGPU backend using Transformers.js
- **`isVlmSupported()`** — Check device support before initialization
- **`tryCreateVlmModule()`** — Safe creation with automatic fallback
- **`detectTier()`** — Device capability detection

#### Error Codes
- `ERROR_VLM_TIER_NOT_SUPPORTED` — Device doesn't meet VLM requirements
- `ERROR_VLM_INIT_FAILED` — VLM initialization failure

### Tests
- VLM Module unit tests with tier gating validation

---

## [1.3.0] - 2026-01-13

### Added

#### Memory Module (`@browser-ai/modules-memory`)
- **`createMemoryModule()`** — Local conversation context with IndexedDB storage
  - `addTurn()` — Add conversation turns
  - `getContext()` — Get context for prompt injection (summary + recent turns)
  - `clearConversation()` — Clear conversation history
  - `search()` — Semantic search across turns
- **Local Embeddings** — Transformers.js embeddings for semantic search
- **Rolling Summarization** — Auto-summarize after N turns
- **MemoryDiagnostics** — Storage and embedding stats

#### Error Codes
- `ERROR_MEMORY_IDB_FAILED` — IndexedDB storage failure

### Example
- **`examples/vite-memory`** — Conversation memory demo

---

## [1.2.0] - 2026-01-13

### Added

#### OCR Module (`@browser-ai/modules-ocr`)
- **`createOcrModule()`** — Local OCR for images and PDFs
  - `ocrImage()` — OCR a single image (Tesseract.js WASM)
  - `ocrPdf()` — OCR a PDF (text layer extraction + OCR fallback)
  - `runExtractivePipeline()` — Chunk text for RAG workflows
- **DocumentStore** — Store and retrieve OCR results
- **Structured Output** — Blocks, lines, words with bounding boxes
- **OcrDiagnostics** — Processing stats and backend info

#### Error Codes
- `ERROR_OCR_INIT_FAILED` — OCR engine initialization failure
- `ERROR_PDF_TEXT_LAYER_PARSE_FAILED` — PDF parsing failure

### Example
- **`examples/vite-ocr`** — Image & PDF OCR demo

---

## [1.1.0] - 2026-01-13

### Added

#### Audio Module (`@browser-ai/modules-audio`)
- **`createAudioModule()`** — Local audio processing (ASR, VAD, TTS)
  - `transcribe()` — Speech-to-text with Whisper (Transformers.js)
  - `transcribeStream()` — Real-time streaming transcription
  - `detectVoiceActivity()` — VAD with Silero (ONNX Runtime)
  - `synthesize()` — Text-to-speech (Web Speech API)
- **StreamController** — Control streaming transcription (pause/resume/stop)
- **AudioDiagnostics** — Backend info, latency P95

#### Error Codes
- `ERROR_AUDIO_ASR_INIT_FAILED` — ASR engine initialization failure
- `ERROR_AUDIO_VAD_INIT_FAILED` — VAD engine initialization failure
- `ERROR_AUDIO_TTS_INIT_FAILED` — TTS engine initialization failure
- `ERROR_AUDIO_PERMISSION_DENIED` — Microphone permission denied

### Example
- **`examples/vite-audio`** — Audio ASR/VAD/TTS demo

---

## [1.0.0] - 2026-01-12

### Added

#### CLI (`@browser-ai/cli`)
- **`npx browser-ai eject-worker`** — Eject worker files for CSP compliance
  - Options: `--output <dir>`, `--force`, `--provider <provider>`
  - Generates `webllm-worker.js`, `wasm-worker.js`, `browser-ai.config.js`
  - COOP/COEP headers documentation

#### OPFS Storage (`@browser-ai/core`)
- **`createOPFSManager()`** — Origin Private File System storage
  - Persistent storage (survives cache clearing)
  - Shard-based storage for large model files
  - Metadata tracking with access times
  - Methods: `storeShard`, `readShard`, `hasModel`, `deleteModel`, `purgeAll`

#### LRU Cache Management (`@browser-ai/core`)
- **`createLRUCacheManager()`** — Automatic model eviction
  - Configurable `maxUsageRatio` (default 80%)
  - Configurable `minFreeBytes` (default 500MB)
  - Methods: `getModels`, `evictForSpace`, `autoEvict`, `getStats`

#### Multi-Model Support (`@browser-ai/core`)
- **`createModelManager()`** — Load multiple models simultaneously
  - Configurable `maxLoadedModels` (default 2)
  - `autoUnload` for automatic LRU eviction
  - Background preloading with `preloadEnabled`
  - Methods: `loadModel`, `unloadModel`, `setActiveModel`, `getActiveModel`

#### Plugin Architecture (`@browser-ai/core`)
- **`createPluginManager()`** — Extensible plugin system
  - Lifecycle hooks: `beforeInit`, `afterInit`, `beforeGenerate`, `afterGenerate`
  - Sync hooks: `onToken`, `onStateChange`
  - Error handling: `onError`
  - Cleanup hooks: `beforeTeardown`, `afterTeardown`
- **`createLoggingPlugin()`** — Built-in logging plugin
- **`createTelemetryPlugin()`** — Local-only telemetry plugin

### Tests
- 11 tests for OPFS Manager
- 10 tests for LRU Cache Manager
- 21 tests for Model Manager
- 22 tests for Plugin Manager

---

## [0.2.0] - 2026-01-11

### Added

#### New Providers
- **`@browser-ai/providers-webnn`** — WebNN hardware-accelerated inference
  - Web Neural Network API support
  - GPU/NPU acceleration
  - Chrome 127+ and Edge 127+ support
- **`@browser-ai/providers-wasm`** — WASM universal fallback
  - Works in all modern browsers
  - Transformers.js WASM backend
  - CPU-based inference

#### Core Improvements (`@browser-ai/core`)
- **Healthcheck Token-Aware** — Smarter stall detection
  - `HealthcheckWatchdog` with configurable intervals
  - Token-aware during GENERATING state
- **Download Watchdog** — Stuck download detection
  - `DownloadWatchdog` for indeterminate downloads
  - 5-minute stuck threshold (CDC §5.4)
- **`tierOverride` Config** — Force specific device tier
  - `getEffectiveTier()` respects override
  - `pickDefaultModelId()` uses effective tier
- **Transferables Protocol** — Zero-copy ArrayBuffer transfer
  - `extractTransferables()` utility
  - `postMessageWithTransfer()` helper

#### Validation
- **`validateConfig()`** — Config validation at init
- **`checkPublicBaseUrlRequired()`** — CDC Table 16.6 compliance

### Tests
- 11 tests for HealthcheckManager
- 8 tests for DownloadWatchdog
- 14 tests for tier detection

---

## [0.1.0] - 2026-01-11

### Added

#### Core (`@browser-ai/core`)
- **`createBrowserAI()`** — Main entry point with full lifecycle management
- **FSM with 12 states** — Predictable state machine (CDC §5.1)
  - IDLE, BOOTING, SELECTING_PROVIDER, PREFLIGHT_QUOTA, CHECKING_CACHE
  - DOWNLOADING, WARMING_UP, READY, GENERATING
  - ERROR, REHYDRATING, TEARING_DOWN
- **Epoch/Sequence Protocol** — Race condition prevention (CDC §6)
- **Provider Selection** — Automatic best-provider with privacy filtering
- **Diagnostics API** — Runtime introspection with SelectionReport
- **Quota Preflight** — Storage verification before download (CDC §15)
- **Error Catalog** — Typed errors with recovery hints (CDC §14)
- **Retry Budgeter** — Cumulative retry with 0.8 factor (CDC §11.2)
- **Message Adapter** — System prompt flattening (CDC §8.3)

#### Model Catalog
- **nano** — Llama 3.2 1B Instruct (q4f16) ~705MB
- **micro** — Llama 3.2 1B Instruct (q4f32) ~600MB
- **standard** — Llama 3.1 8B Instruct (q4f16) ~4.5GB

#### Providers
- **`@browser-ai/providers-native`** — Chrome AI (Prompt API)
  - ChromeWindowAiDriver + UnknownDriver
- **`@browser-ai/providers-webllm`** — WebGPU/WebLLM
  - WebLLM v0.2.73 pinned
- **`@browser-ai/providers-mock`** — Mock for CI testing
  - Scenarios: happy, slow, hang, crash, quota

#### React (`@browser-ai/react`)
- **`useLocalCompletion`** — React hook with streaming
- **`useBrowserAI`** — Lower-level hook

#### UI (`@browser-ai/ui`)
- **`AIPopover`** — Pre-built chat popover
- **`ProgressBar`** — Download progress component

#### CI/CD
- **SLO Hard Gate** — Worker chunk gzip ≤10MB (CDC §19.1)
- **Coverage Gate** — 80% lines soft gate (CDC §21.3)

### Tests
- 166 unit tests covering FSM, protocol, storage, utilities
- E2E tests with MockProvider scenarios

---

## Version Compatibility

| Version | CDC Reference | Key Features |
|---------|---------------|--------------|
| v0.1 | CDC v2026.8 | Core, Native/WebLLM/Mock providers |
| v0.2 | CDC v2026.8 §20.3 | WebNN, WASM, tierOverride |
| v1.0 | CDC v2026.8 §16.4 | CLI, OPFS, LRU, Plugins |
| v1.1 | CDC v2026.9 §9 | Audio (ASR, VAD, TTS) |
| v1.2 | CDC v2026.9 §10 | OCR (Images, PDFs) |
| v1.3 | CDC v2026.9 §11 | Memory (Context, RAG) |
| v2.0 | CDC v2026.9 §12 | VLM (Vision-Language) |
| v2.1 | CDC v2026.9 §13 | Unified Registry, Abort Recovery |

---

## License

MIT © 2026
