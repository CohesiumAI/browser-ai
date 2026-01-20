# Getting Started

This guide will help you integrate browser-ai into your project in under 5 minutes.

## Prerequisites

- **Node.js** 18+ (for development)
- **Modern browser** with WebGPU support (Chrome 113+, Edge 113+, Firefox 118+)
- **pnpm**, **npm**, or **yarn**

## Installation

### Core (Text Generation)

```bash
# React projects
pnpm add @cohesiumai/core @cohesiumai/react @cohesiumai/providers-webllm

# Vanilla JS/TS projects
pnpm add @cohesiumai/core @cohesiumai/providers-webllm
```

### Additional Providers (v0.2+)

```bash
# Chrome AI Native provider
pnpm add @cohesiumai/providers-native

# WebNN hardware-accelerated provider
pnpm add @cohesiumai/providers-webnn

# WASM universal fallback provider
pnpm add @cohesiumai/providers-wasm

# Mock provider for testing
pnpm add @cohesiumai/providers-mock
```

### Modules (v1.1+)

```bash
# Audio: ASR, VAD, TTS
pnpm add @cohesiumai/modules-audio

# OCR: Images & PDFs
pnpm add @cohesiumai/modules-ocr

# Memory: Conversation context
pnpm add @cohesiumai/modules-memory

# VLM: Vision-Language Model (tier 3 only)
pnpm add @cohesiumai/modules-vlm
```

### CLI Tools (v1.0+)

```bash
# Global installation
pnpm add -g @cohesiumai/cli

# Or use npx
npx browser-ai eject-worker
```

## Basic Setup

### Step 1: Configure Providers

```typescript
import { createNativeProvider } from '@cohesiumai/providers-native';
import { createWebLLMProvider } from '@cohesiumai/providers-webllm';
import type { BrowserAIConfig } from '@cohesiumai/core';

// Configuration
const config: BrowserAIConfig = {
  privacyMode: 'any', // 'strict' | 'relaxed' | 'any'
  providerPolicy: {
    order: ['native', 'webllm'], // Try native first, fallback to WebLLM
  },
};

// Create providers
const providers = [
  createNativeProvider(),
  createWebLLMProvider(),
];
```

### Step 2: Initialize (React)

```tsx
import { useLocalCompletion } from '@cohesiumai/react';

function App() {
  const completion = useLocalCompletion({
    config,
    providers,
    autoInit: true, // Automatically initialize on mount
  });

  const { state, output, generate, abort, error } = completion;

  return (
    <div>
      <p>Status: {state.name}</p>
      {state.name === 'READY' && (
        <button onClick={() => generate({
          messages: [{ role: 'user', content: 'Hello!' }]
        })}>
          Generate
        </button>
      )}
      <pre>{output}</pre>
    </div>
  );
}
```

### Step 2: Initialize (Vanilla JS)

```typescript
import { createBrowserAI } from '@cohesiumai/core';

const ai = createBrowserAI({ config, providers });

// Initialize (downloads model if needed)
await ai.init();

// Generate
const { result } = ai.generate({
  messages: [{ role: 'user', content: 'Hello!' }],
});

const response = await result;
console.log(response.text);
```

## Understanding States

browser-ai uses a state machine. Here are the key states you'll encounter:

| State | Description | User Action |
|-------|-------------|-------------|
| `IDLE` | Not initialized | Call `init()` or set `autoInit: true` |
| `BOOTING` | Starting up | Wait |
| `DOWNLOADING` | Downloading model | Wait (show progress) |
| `WARMING_UP` | Loading model into memory | Wait |
| `READY` | Ready to generate | Call `generate()` |
| `GENERATING` | Generating response | Wait or call `abort()` |
| `ERROR` | An error occurred | Check `error`, may recover |

## Handling Errors

```typescript
const { state, error } = useLocalCompletion({ config, providers, autoInit: true });

if (state.name === 'ERROR') {
  console.error('Error:', error?.message);
  console.error('Code:', error?.code);
  console.error('Recoverable:', error?.recoverability);
  
  if (error?.userAction) {
    // Show this to the user
    alert(error.userAction);
  }
}
```

## Streaming Responses

```typescript
const { stream, result } = ai.generate({
  messages: [{ role: 'user', content: 'Write a poem' }],
  stream: true,
});

// Stream tokens as they arrive
for await (const event of stream!) {
  if (event.type === 'token') {
    process.stdout.write(event.token);
  } else if (event.type === 'final') {
    console.log('\n\nDone! Total tokens:', event.usage?.totalTokens);
  }
}
```

## Generation Parameters

```typescript
generate({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2?' },
  ],
  maxTokens: 100,      // Max tokens to generate (default: 512)
  temperature: 0.7,    // Randomness 0-1 (default: 0.6)
  topP: 0.9,           // Nucleus sampling (default: 0.95)
  stream: true,        // Enable streaming (default: false)
  onToken: (token) => {
    // Called for each token (alternative to stream)
    console.log(token);
  },
});
```

## Using Modules (v1.1+)

### Audio Module

```typescript
import { createAudioModule } from '@cohesiumai/modules-audio';

const audio = createAudioModule();
await audio.init({
  privacyMode: 'fully-local-managed',
  asr: { enabled: true },
  tts: { enabled: true },
});

// Speech-to-text
const result = await audio.transcribe(audioBlob);
console.log(result.text);
```

### OCR Module

```typescript
import { createOcrModule } from '@cohesiumai/modules-ocr';

const ocr = createOcrModule();
await ocr.init({
  privacyMode: 'fully-local-managed',
  language: 'eng',
});

// OCR an image
const result = await ocr.ocrImage(imageBlob);
console.log(result.text);
```

### Memory Module

```typescript
import { createMemoryModule } from '@cohesiumai/modules-memory';

const memory = createMemoryModule();
await memory.init({
  privacyMode: 'fully-local-managed',
  conversationId: 'chat-1',
});

// Add turns and get context
await memory.addTurn({ role: 'user', content: 'Hello', createdAtMs: Date.now() });
const context = await memory.getContext();
```

### VLM Module (Tier 3 Only)

```typescript
import { createVlmModule, isVlmSupported } from '@cohesiumai/modules-vlm';

// Check support first
if (!isVlmSupported().supported) {
  console.warn('VLM requires tier 3 device');
}

const vlm = createVlmModule();
await vlm.init({ privacyMode: 'fully-local-managed' });

// Describe an image
const result = await vlm.describeImage(imageBlob);
console.log(result.text);
```

---

## Next Steps

- [Architecture Overview](./architecture.md) — Understand how browser-ai works
- [API Reference](./api.md) — Complete API documentation
- [Providers Guide](./providers.md) — Deep dive into providers
- [Modules Guide](./modules.md) — Audio, OCR, Memory, VLM modules
- [Troubleshooting](./troubleshooting.md) — Common issues and solutions
