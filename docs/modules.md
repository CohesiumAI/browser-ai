# Modules Guide

browser-ai provides specialized modules for different AI capabilities beyond text generation.

**All modules run 100% locally** — no data leaves the browser.

---

## Table of Contents

- [Audio Module (v1.1)](#audio-module-v11)
- [OCR Module (v1.2)](#ocr-module-v12)
- [Memory Module (v1.3)](#memory-module-v13)
- [VLM Module (v2.0)](#vlm-module-v20)

---

## Audio Module (v1.1)

Local speech-to-text (ASR), voice activity detection (VAD), and text-to-speech (TTS).

### Installation

```bash
pnpm add @browser-ai/modules-audio
```

### Quick Start

```typescript
import { createAudioModule } from '@browser-ai/modules-audio';

const audio = createAudioModule();

await audio.init({
  privacyMode: 'fully-local-managed',
  asr: { enabled: true, model: 'whisper-tiny', language: 'en' },
  vad: { enabled: true, sensitivity: 0.5 },
  tts: { enabled: true },
});

// Speech-to-text
const result = await audio.transcribe(audioBlob);
console.log(result.text);

// Voice activity detection
const vad = await audio.detectVoiceActivity(audioBuffer);
console.log(vad.isSpeech, vad.confidence);

// Text-to-speech
const speech = await audio.synthesize('Hello world!');
```

### Streaming Transcription

```typescript
// Real-time transcription from microphone
const controller = await audio.transcribeStream((result, isFinal) => {
  if (isFinal) {
    console.log('Final:', result.text);
  } else {
    console.log('Interim:', result.text);
  }
});

// Control the stream
controller.pause();
controller.resume();
controller.stop();
```

### Configuration

```typescript
interface AudioConfig {
  privacyMode: 'fully-local-managed'; // Required
  asr?: {
    enabled: boolean;
    model?: 'default' | 'whisper-tiny' | 'whisper-base';
    language?: string; // ISO 639-1 code (e.g., 'en', 'fr')
  };
  vad?: {
    enabled: boolean;
    sensitivity?: number; // 0.0 - 1.0, default 0.5
  };
  tts?: {
    enabled: boolean;
    voice?: string;
    speed?: number;  // 0.5 - 2.0
    pitch?: number;  // 0.5 - 2.0
  };
}
```

### API Reference

| Method | Description |
|--------|-------------|
| `init(config)` | Initialize with ASR/VAD/TTS configuration |
| `transcribe(input)` | Transcribe audio (Blob or ArrayBuffer) |
| `transcribeStream(callback)` | Real-time streaming transcription |
| `detectVoiceActivity(input)` | Detect speech in audio |
| `synthesize(text)` | Convert text to speech |
| `getState()` | Get module state |
| `getDiagnostics()` | Get diagnostics (backend, latency) |
| `teardown()` | Clean up resources |

### Backends

| Feature | Backend | Notes |
|---------|---------|-------|
| ASR | Whisper (Transformers.js) | WASM/WebGPU |
| VAD | Silero (ONNX Runtime) | WASM |
| TTS | Web Speech API | Browser native |

---

## OCR Module (v1.2)

Local OCR for images and PDFs using Tesseract.js.

### Installation

```bash
pnpm add @browser-ai/modules-ocr
```

### Quick Start

```typescript
import { createOcrModule } from '@browser-ai/modules-ocr';

const ocr = createOcrModule();

await ocr.init({
  privacyMode: 'fully-local-managed',
  language: 'eng', // Tesseract language code
  pdf: { preferTextLayer: true },
});

// OCR an image
const imageResult = await ocr.ocrImage(imageBlob);
console.log(imageResult.text);
console.log(imageResult.blocks); // Structured output

// OCR a PDF
const pdfResult = await ocr.ocrPdf(pdfBlob);
console.log(pdfResult.pages);
console.log(pdfResult.text); // Full text
```

### Extractive Pipeline

Extract chunks for RAG workflows:

```typescript
const chunks = await ocr.runExtractivePipeline(text, {
  chunkSizeChars: 1200,
  overlapChars: 150,
  maxChunks: 200,
});

// chunks = [{ text: '...', index: 0 }, ...]
```

### Document Store

Store and retrieve OCR results:

```typescript
import { createDocumentStore } from '@browser-ai/modules-ocr';

const store = createDocumentStore();
await store.init();

// Store document
await store.addDocument({
  id: 'doc-1',
  filename: 'report.pdf',
  text: pdfResult.text,
  chunks: chunks,
});

// Search
const results = await store.search('quarterly revenue');
```

### Configuration

```typescript
interface OcrConfig {
  privacyMode: 'fully-local-managed'; // Required
  language?: string; // Tesseract language code, default 'eng'
  pdf?: {
    preferTextLayer?: boolean; // Extract text before OCR, default true
  };
}
```

### API Reference

| Method | Description |
|--------|-------------|
| `init(config)` | Initialize OCR engine |
| `ocrImage(input)` | OCR a single image |
| `ocrPdf(input)` | OCR a PDF document |
| `runExtractivePipeline(text, config)` | Chunk text for RAG |
| `getState()` | Get module state |
| `getDiagnostics()` | Get diagnostics |
| `teardown()` | Clean up resources |

### Structured Output

```typescript
interface OcrResult {
  text: string;
  confidence: number;
  blocks: OcrBlock[];
  durationMs: number;
}

interface OcrBlock {
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number };
  lines: OcrLine[];
}
```

---

## Memory Module (v1.3)

Local conversation context with IndexedDB storage and semantic search.

### Installation

```bash
pnpm add @browser-ai/modules-memory
```

### Quick Start

```typescript
import { createMemoryModule } from '@browser-ai/modules-memory';

const memory = createMemoryModule();

await memory.init({
  privacyMode: 'fully-local-managed',
  conversationId: 'chat-123',
  maxTurns: 20,
  summaryEveryTurns: 10,
});

// Add conversation turns
await memory.addTurn({
  role: 'user',
  content: 'What is machine learning?',
  createdAtMs: Date.now(),
});

await memory.addTurn({
  role: 'assistant',
  content: 'Machine learning is a subset of AI...',
  createdAtMs: Date.now(),
});

// Get context for prompt injection
const context = await memory.getContext();
console.log(context.summary);      // Auto-generated summary
console.log(context.recentTurns);  // Last N turns
```

### Semantic Search

Search across conversation history:

```typescript
const results = await memory.search('machine learning', {
  topK: 5,
  minScore: 0.5,
});

for (const result of results) {
  console.log(result.turn.content, result.score);
}
```

### Configuration

```typescript
interface MemoryConfig {
  privacyMode: 'fully-local-managed'; // Required
  conversationId: string;             // Unique conversation ID
  maxTurns?: number;                  // Max turns to keep, default 20
  summaryEveryTurns?: number;         // Summarize every N turns, default 10
}
```

### API Reference

| Method | Description |
|--------|-------------|
| `init(config)` | Initialize with conversation ID |
| `addTurn(turn)` | Add a conversation turn |
| `getContext()` | Get summary + recent turns |
| `search(query, options)` | Semantic search across turns |
| `clearConversation()` | Clear all turns |
| `getState()` | Get module state |
| `getDiagnostics()` | Get diagnostics |
| `teardown()` | Clean up resources |

### Features

- **IndexedDB Storage** — Persistent conversation storage
- **Local Embeddings** — Transformers.js for semantic search
- **Rolling Summarization** — Auto-summarize long conversations
- **Multi-Conversation** — Manage multiple conversations

---

## VLM Module (v2.0)

Local Vision-Language Model for image understanding.

**⚠️ Tier 3 only** — Requires high-end device (8+ CPU cores, WebGPU support).

### Installation

```bash
pnpm add @browser-ai/modules-vlm
```

### Quick Start

```typescript
import { createVlmModule, isVlmSupported } from '@browser-ai/modules-vlm';

// Check device support first
const support = isVlmSupported();
if (!support.supported) {
  console.warn('VLM not supported:', support.reason);
  // Fall back to OCR module
}

const vlm = createVlmModule();

await vlm.init({
  privacyMode: 'fully-local-managed',
  requireTier3: true, // Set false to allow on lower-tier devices
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

### Safe Initialization

```typescript
import { tryCreateVlmModule } from '@browser-ai/modules-vlm';
import { createOcrModule } from '@browser-ai/modules-ocr';

// Returns null if device doesn't support VLM
const vlm = tryCreateVlmModule();

if (!vlm) {
  // Automatic fallback to OCR
  const ocr = createOcrModule();
  await ocr.init({ privacyMode: 'fully-local-managed' });
}
```

### Configuration

```typescript
interface VlmConfig {
  privacyMode: 'fully-local-managed'; // Required
  requireTier3?: boolean;             // Default true
}
```

### API Reference

| Method | Description |
|--------|-------------|
| `init(config)` | Initialize VLM (requires WebGPU) |
| `describeImage(image)` | Generate image caption |
| `chatWithImage(input)` | Visual Q&A with image context |
| `getState()` | Get module state |
| `getDiagnostics()` | Get diagnostics |
| `teardown()` | Clean up resources |

### Helper Functions

| Function | Description |
|----------|-------------|
| `detectTier()` | Detect device tier (1, 2, or 3) |
| `isVlmSupported()` | Check if VLM is supported |
| `tryCreateVlmModule()` | Create VLM or return null |

### Device Tiers

| Tier | Criteria | VLM Support |
|------|----------|-------------|
| 1 | Mobile device | ❌ |
| 2 | Desktop < 8 cores | ❌ |
| 3 | Desktop ≥ 8 cores + WebGPU | ✅ |

---

## Privacy Mode

All modules require `privacyMode: 'fully-local-managed'`:

```typescript
await module.init({
  privacyMode: 'fully-local-managed', // Required for all modules
  // ... other config
});
```

This ensures:
- All processing runs locally in the browser
- No data is sent to external servers
- Models are downloaded once and cached locally

---

## Error Handling

Each module defines specific error codes:

```typescript
try {
  await audio.init(config);
} catch (error) {
  switch (error.code) {
    case 'ERROR_AUDIO_ASR_INIT_FAILED':
      console.error('ASR engine failed to initialize');
      break;
    case 'ERROR_AUDIO_PERMISSION_DENIED':
      console.error('Microphone permission denied');
      break;
    // ...
  }
}
```

### Error Codes by Module

| Module | Error Codes |
|--------|-------------|
| Audio | `ERROR_AUDIO_ASR_INIT_FAILED`, `ERROR_AUDIO_VAD_INIT_FAILED`, `ERROR_AUDIO_TTS_INIT_FAILED`, `ERROR_AUDIO_PERMISSION_DENIED` |
| OCR | `ERROR_OCR_INIT_FAILED`, `ERROR_PDF_TEXT_LAYER_PARSE_FAILED` |
| Memory | `ERROR_MEMORY_IDB_FAILED` |
| VLM | `ERROR_VLM_TIER_NOT_SUPPORTED`, `ERROR_VLM_INIT_FAILED` |

---

## Examples

- **[vite-audio](../examples/vite-audio)** — Audio ASR/VAD/TTS demo
- **[vite-ocr](../examples/vite-ocr)** — Image & PDF OCR demo
- **[vite-memory](../examples/vite-memory)** — Conversation memory demo
- **[vite-vlm](../examples/vite-vlm)** — Vision-Language Model demo
- **[vite-full](../examples/vite-full)** — All modules combined
