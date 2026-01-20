# Providers Guide

browser-ai supports multiple AI runtime providers. This guide covers each provider in detail.

## Overview

| Provider | Version | Runtime | Browser Support | Model Download | Privacy |
|----------|---------|---------|-----------------|----------------|---------|
| Native | v0.1+ | Chrome AI | Chrome 127+ | No | On-device |
| WebLLM | v0.1+ | WebGPU | Chrome, Edge, Firefox | Yes (~500MB-5GB) | On-device |
| WebNN | v0.2+ | WebNN | Chrome 127+, Edge 127+ | Yes | On-device |
| WASM | v0.2+ | WASM | All modern browsers | Yes | On-device |
| Mock | v0.1+ | None | All | No | N/A |

## Native Provider

The Native provider uses Chrome's built-in AI capabilities (Prompt API with Gemini Nano).

### Requirements

1. **Chrome 127+** or Edge 127+
2. Enable the experimental flag:
   - Navigate to `chrome://flags/#prompt-api-for-gemini-nano`
   - Set to "Enabled"
   - Restart browser

### Usage

```typescript
import { createNativeProvider } from '@cohesiumai/providers-native';

const provider = createNativeProvider();
```

### Characteristics

| Property | Value |
|----------|-------|
| ID | `native` |
| Cold start | ~100ms |
| Warm start | ~50ms |
| Tokens/sec | ~30 |
| Model size | Pre-installed |
| Privacy | Fully on-device |

### Detection

The provider checks for:
1. `window.ai` API availability
2. `window.ai.languageModel.capabilities()` returning valid capabilities

```typescript
const result = await provider.detect(config);
// { available: true } or { available: false, reason: '...' }
```

### Limitations

- Chrome/Edge only
- Limited model customization
- No streaming (simulated)
- May require user opt-in

---

## WebLLM Provider

The WebLLM provider runs open-source LLMs directly in the browser using WebGPU.

### Requirements

1. **WebGPU-capable browser**:
   - Chrome 113+
   - Edge 113+
   - Firefox 118+ (with flag)
   - Safari 18+ (experimental)

2. **Sufficient storage** for model weights

3. **Cross-Origin Isolation** (recommended for SharedArrayBuffer):
   ```
   Cross-Origin-Embedder-Policy: require-corp
   Cross-Origin-Opener-Policy: same-origin
   ```

### Usage

```typescript
import { createWebLLMProvider } from '@cohesiumai/providers-webllm';

const provider = createWebLLMProvider();
```

### Available Models

browser-ai v0.1 uses these default models:

| Tier | Model | Size | VRAM | Use Case |
|------|-------|------|------|----------|
| Nano | Llama-3.2-1B-Instruct | ~879MB | ~1GB | Mobile, low-end |
| Standard | Llama-3.2-3B-Instruct | ~2.3GB | ~3GB | Desktop |

Model selection is automatic based on device tier detection:
- **Tier 1** (mobile): Nano model
- **Tier 2** (4-7 cores): Standard model
- **Tier 3** (8+ cores): Standard model

### Characteristics

| Property | Value |
|----------|-------|
| ID | `webllm` |
| Cold start | 30-60s (download) |
| Warm start | 2-5s |
| Tokens/sec | 8-25 (depends on GPU) |
| Model size | 500MB-5GB |
| Privacy | Fully on-device |

### Download Progress

Monitor model download progress:

```typescript
const progress = provider.getDownloadProgress();
// {
//   downloadedBytes: 50,  // percentage (0-100)
//   totalBytes: 100,
//   text: 'Loading model...'
// }
```

Progress is also logged to console:
```
[WebLLM] 25% - Fetching model weights...
[WebLLM] 50% - Loading into GPU...
[WebLLM] 100% - Model loaded
```

### CSP Configuration

If using Content Security Policy, add:

```html
<meta http-equiv="Content-Security-Policy" content="
  worker-src 'self' blob:;
  script-src 'self' 'wasm-unsafe-eval';
">
```

### Caching

Models are cached in the browser's Cache API:
- Persists across page reloads
- Cleared with "Clear browsing data"
- Check cache status: `chrome://cache`

---

## WebNN Provider (v0.2+)

The WebNN provider uses the Web Neural Network API for hardware-accelerated inference.

### Installation

```bash
pnpm add @cohesiumai/providers-webnn
```

### Requirements

1. **Chrome 127+** or **Edge 127+** with WebNN support
2. Compatible GPU/NPU hardware

### Usage

```typescript
import { createWebNNProvider } from '@cohesiumai/providers-webnn';

const provider = createWebNNProvider();
```

### Characteristics

| Property | Value |
|----------|-------|
| ID | `webnn` |
| Cold start | ~5-10s |
| Warm start | ~1-2s |
| Tokens/sec | 15-40 (hardware dependent) |
| Privacy | Fully on-device |

### Detection

The provider checks for:
1. `navigator.ml` API availability
2. WebNN context creation success

```typescript
const result = await provider.detect(config);
// { available: true, privacyClaim: 'on-device-claimed' }
```

### Advantages

- **Hardware acceleration** — Uses GPU/NPU for faster inference
- **Lower memory** — More efficient than WebGPU for some models
- **Battery efficient** — Better for mobile devices

### Limitations

- Limited browser support (Chromium only)
- Fewer model options than WebLLM
- API still evolving

---

## WASM Provider (v0.2+)

The WASM provider is a universal fallback using Transformers.js with WebAssembly backend.

### Installation

```bash
pnpm add @cohesiumai/providers-wasm
```

### Requirements

1. **Any modern browser** with WASM support
2. Sufficient memory for model

### Usage

```typescript
import { createWASMProvider } from '@cohesiumai/providers-wasm';

const provider = createWASMProvider();
```

### Characteristics

| Property | Value |
|----------|-------|
| ID | `wasm` |
| Cold start | ~10-30s |
| Warm start | ~2-5s |
| Tokens/sec | 2-8 (CPU only) |
| Privacy | Fully on-device |

### Detection

The provider checks for:
1. WebAssembly support
2. Sufficient memory

```typescript
const result = await provider.detect(config);
// { available: true }
```

### Advantages

- **Universal compatibility** — Works in all browsers
- **No GPU required** — Pure CPU execution
- **Reliable fallback** — Always available

### Limitations

- Slower than GPU-based providers
- Higher CPU usage
- Limited to smaller models

### When to Use

Use WASM as the last fallback in your provider order:

```typescript
const config = {
  providerPolicy: {
    order: ['native', 'webllm', 'webnn', 'wasm'], // WASM last
  },
};
```

---

## Mock Provider

The Mock provider simulates AI responses for testing without GPU requirements.

### Usage

```typescript
import { createMockProvider } from '@cohesiumai/providers-mock';

// Happy path
const happyProvider = createMockProvider({ scenario: 'happy' });

// Slow responses (for loading state testing)
const slowProvider = createMockProvider({ scenario: 'slow' });

// Error simulation
const errorProvider = createMockProvider({ scenario: 'error' });
```

### Scenarios

#### Happy (default)

Returns successful responses immediately.

```typescript
const provider = createMockProvider({ scenario: 'happy' });
// Generates: "This is a mock response for testing purposes."
```

#### Slow

Adds artificial delay to simulate real model latency.

```typescript
const provider = createMockProvider({ scenario: 'slow' });
// Same response, but with 2-3 second delay
```

#### Error

Always throws an error (useful for error handling tests).

```typescript
const provider = createMockProvider({ scenario: 'error' });
// Throws: MockError('Simulated error')
```

### CI Integration

Use the mock provider in CI/CD pipelines:

```typescript
// test/setup.ts
import { createMockProvider } from '@cohesiumai/providers-mock';

export const testProviders = [
  createMockProvider({ scenario: 'happy' }),
];

export const testConfig = {
  providerPolicy: { order: ['mock'] },
};
```

```typescript
// test/app.test.tsx
import { render, waitFor } from '@testing-library/react';
import { testConfig, testProviders } from './setup';

test('generates response', async () => {
  render(
    <App config={testConfig} providers={testProviders} />
  );
  
  // Click generate button
  fireEvent.click(screen.getByText('Generate'));
  
  // Wait for mock response
  await waitFor(() => {
    expect(screen.getByText(/mock response/)).toBeInTheDocument();
  });
});
```

---

## Provider Selection

### Algorithm

1. **Filter by privacy mode**
2. **Probe each provider** (call `detect()`)
3. **Select first available** in order

```typescript
const config = {
  privacyMode: 'strict',
  providerPolicy: { order: ['native', 'webllm', 'mock'] },
};

// Selection flow:
// 1. Check native.detect() → { available: false }
// 2. Check webllm.detect() → { available: true }
// 3. Select 'webllm'
```

### Selection Report

The selection process generates a report accessible via diagnostics:

```typescript
const { selectionReport } = ai.getDiagnostics();

// {
//   id: 'uuid',
//   selected: 'webllm',
//   policyOrder: ['native', 'webllm', 'mock'],
//   reasons: [
//     { providerId: 'native', ok: false, reason: 'PROBE_FAILED' },
//     { providerId: 'webllm', ok: true, reason: 'ORDER_POLICY' },
//   ]
// }
```

---

## Creating Custom Providers

Implement the `Provider` interface:

```typescript
import type { Provider, BrowserAIConfig, GenerateParams } from '@cohesiumai/core';

class MyCustomProvider implements Provider {
  readonly id = 'custom' as const;

  async detect(config: BrowserAIConfig) {
    // Check if provider is available
    return { available: true };
  }

  async init(config: BrowserAIConfig, model?: ModelSpec) {
    // Initialize resources
  }

  async generate(params: GenerateParams, onToken: (token: string) => void) {
    // Generate response
    onToken('Hello');
    onToken(' world');
    
    return {
      text: 'Hello world',
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
    };
  }

  abort() {
    // Cancel ongoing generation
  }

  async teardown() {
    // Clean up resources
  }

  getDownloadProgress() {
    return {};
  }
}
```

Register with browser-ai:

```typescript
const ai = createBrowserAI({
  config: { providerPolicy: { order: ['custom'] } },
  providers: [new MyCustomProvider()],
});
```
