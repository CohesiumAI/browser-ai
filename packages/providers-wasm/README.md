# @cohesiumai/providers-wasm

> WASM provider for browser-ai — Universal fallback using WebAssembly.

## Installation

```bash
pnpm add @cohesiumai/providers-wasm
```

## Usage

```typescript
import { createWASMProvider } from '@cohesiumai/providers-wasm';

const provider = createWASMProvider();

// Check availability (always true in modern browsers)
const result = await provider.detect();
if (result.available) {
  console.log('WASM is available');
}
```

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | ✅ Full |
| Edge | ✅ Full |
| Firefox | ✅ Full |
| Safari | ✅ Full |
| Mobile browsers | ✅ Full |

## Features

- **Universal Compatibility** — Works in all modern browsers
- **No GPU Required** — CPU-based inference
- **Reliable Fallback** — Always available option
- **Smaller Models** — Optimized for quantized models

## API

### `createWASMProvider(options?)`

Creates a new WASM provider instance.

```typescript
interface WASMProviderOptions {
  numThreads?: number;  // Worker threads (default: navigator.hardwareConcurrency)
  simd?: boolean;       // Use SIMD if available (default: true)
}
```

### Provider Interface

- `detect()` — Check if WASM is available
- `init(config, modelSpec)` — Initialize with model
- `generate(params)` — Run inference
- `abort()` — Cancel current generation
- `teardown()` — Cleanup resources
- `getDownloadProgress()` — Get model download status

## Performance Notes

WASM inference is slower than WebGPU or WebNN but provides:
- Consistent behavior across all browsers
- No GPU memory constraints
- Works on low-end devices

Recommended for:
- Fallback when other providers unavailable
- Small quantized models (Q4, Q8)
- Text-only tasks with moderate latency tolerance

## V0.2+

This provider was introduced in browser-ai V0.2.

## License

MIT © 2026
