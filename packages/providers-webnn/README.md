# @cohesiumai/providers-webnn

> WebNN provider for browser-ai — Hardware-accelerated inference via Web Neural Network API.

## Installation

```bash
pnpm add @cohesiumai/providers-webnn
```

## Usage

```typescript
import { createWebNNProvider } from '@cohesiumai/providers-webnn';

const provider = createWebNNProvider();

// Check availability
const result = await provider.detect();
if (result.available) {
  console.log('WebNN is available');
}
```

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome 127+ | ✅ Full |
| Edge 127+ | ✅ Full |
| Chrome <127 | ⚠️ Flag required |
| Firefox | ❌ Not supported |
| Safari | ❌ Not supported |

## Features

- **Hardware Acceleration** — Uses GPU/NPU when available
- **Native Performance** — Direct access to ML accelerators
- **Automatic Fallback** — Works with browser-ai's provider selection

## API

### `createWebNNProvider(options?)`

Creates a new WebNN provider instance.

```typescript
interface WebNNProviderOptions {
  devicePreference?: 'gpu' | 'cpu' | 'npu';
}
```

### Provider Interface

- `detect()` — Check if WebNN is available
- `init(config, modelSpec)` — Initialize with model
- `generate(params)` — Run inference
- `abort()` — Cancel current generation
- `teardown()` — Cleanup resources

## V0.2+

This provider was introduced in browser-ai V0.2.

## License

MIT © 2026
