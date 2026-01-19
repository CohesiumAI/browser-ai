# browser-ai Documentation

> **"The jQuery of local AI"** — A unified API for running AI models locally in the browser.

**Current Version: 2.1.0**

---

## Quick Links

| Document | Description |
|----------|-------------|
| [Getting Started](./getting-started.md) | Installation and basic setup |
| [Architecture](./architecture.md) | How browser-ai works internally |
| [API Reference](./api.md) | Complete API documentation |
| [Providers Guide](./providers.md) | Deep dive into providers |
| [Modules Guide](./modules.md) | Audio, OCR, Memory, VLM modules |
| [Troubleshooting](./troubleshooting.md) | Common issues and solutions |

---

## Overview

browser-ai abstracts the complexity of running AI models in the browser by providing:

- **Unified API** — Same interface regardless of runtime (Native/WebGPU/WebNN/WASM)
- **Automatic fallback** — Tries native first, falls back to WebLLM/WASM
- **Privacy-first** — All inference runs 100% locally, no data leaves the browser
- **Production-ready** — State machine, error handling, diagnostics
- **Modular** — Text generation + Audio + OCR + Memory + Vision modules

---

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Your Application                             │
├─────────────────────────────────────────────────────────────────────┤
│  @browser-ai/react    │    @browser-ai/ui    │    @browser-ai/cli   │
├─────────────────────────────────────────────────────────────────────┤
│                         @browser-ai/core                             │
│   FSM │ Protocol │ Diagnostics │ Storage │ Plugins │ Models        │
├─────────────────────────────────────────────────────────────────────┤
│                         Provider Layer                               │
│   Native │ WebLLM │ WebNN │ WASM │ Mock                             │
├─────────────────────────────────────────────────────────────────────┤
│                         Modules (v1.1+)                              │
│   Audio │ OCR │ Memory │ VLM                                        │
├─────────────────────────────────────────────────────────────────────┤
│                      Browser Runtime                                 │
│   Prompt API │ WebGPU │ WebNN │ WASM │ IndexedDB │ OPFS            │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Installation

### Core (Text Generation)

```bash
pnpm add @browser-ai/core @browser-ai/react @browser-ai/providers-webllm
```

### Modules (v1.1+)

```bash
# Audio (ASR, VAD, TTS)
pnpm add @browser-ai/modules-audio

# OCR (Images, PDFs)
pnpm add @browser-ai/modules-ocr

# Memory (Conversation Context)
pnpm add @browser-ai/modules-memory

# VLM (Vision-Language, tier 3 only)
pnpm add @browser-ai/modules-vlm
```

---

## 30-Second Example

```tsx
import { useLocalCompletion } from '@browser-ai/react';
import { createWebLLMProvider } from '@browser-ai/providers-webllm';

function App() {
  const { state, output, generate } = useLocalCompletion({
    config: { providerPolicy: { order: ['webllm'] } },
    providers: [createWebLLMProvider()],
    autoInit: true,
  });

  return (
    <div>
      <p>Status: {state.name}</p>
      <button 
        onClick={() => generate({ messages: [{ role: 'user', content: 'Hi!' }] })}
        disabled={state.name !== 'READY'}
      >
        Generate
      </button>
      <pre>{output}</pre>
    </div>
  );
}
```

---

## Package Overview

### Core & Providers

| Package | Version | Description |
|---------|---------|-------------|
| `@browser-ai/core` | v0.1+ | Core types, FSM, protocol, diagnostics |
| `@browser-ai/providers-native` | v0.1+ | Chrome AI (Prompt API) |
| `@browser-ai/providers-webllm` | v0.1+ | WebGPU/WebLLM |
| `@browser-ai/providers-webnn` | v0.2+ | WebNN hardware-accelerated |
| `@browser-ai/providers-wasm` | v0.2+ | WASM universal fallback |
| `@browser-ai/providers-mock` | v0.1+ | Mock for CI testing |
| `@browser-ai/react` | v0.1+ | React hooks |
| `@browser-ai/ui` | v0.1+ | Pre-built UI components |
| `@browser-ai/cli` | v1.0+ | CLI tools |

### Modules

| Package | Version | Description |
|---------|---------|-------------|
| `@browser-ai/modules-audio` | v1.1+ | ASR, VAD, TTS (local) |
| `@browser-ai/modules-ocr` | v1.2+ | Image & PDF OCR (local) |
| `@browser-ai/modules-memory` | v1.3+ | Conversation context |
| `@browser-ai/modules-vlm` | v2.0+ | Vision-Language Model |

---

## Version History

| Version | Release | Key Features |
|---------|---------|--------------|
| **v2.1** | 2026-01-19 | Unified Model Registry, Abort Recovery Fix |
| **v2.0** | 2026-01-13 | VLM module (tier 3 only) |
| **v1.3** | 2026-01-13 | Memory module with semantic search |
| **v1.2** | 2026-01-13 | OCR module (Tesseract.js) |
| **v1.1** | 2026-01-13 | Audio module (Whisper, Silero) |
| **v1.0** | 2026-01-12 | CLI, OPFS, LRU, Plugins |
| **v0.2** | 2026-01-11 | WebNN, WASM providers |
| **v0.1** | 2026-01-11 | Core, Native/WebLLM/Mock |

---

## Support

- [GitHub Issues](https://github.com/example/browser-ai/issues) — Bug reports
- [GitHub Discussions](https://github.com/example/browser-ai/discussions) — Questions
- [Changelog](../CHANGELOG.md) — Complete version history
- [Contributing](../CONTRIBUTING.md) — How to contribute
