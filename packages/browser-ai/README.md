# @cohesiumai/browser-ai

> **"The jQuery of local AI"** — A unified API that abstracts browser AI runtime fragmentation (Native / WebNN / WebGPU / WASM).

## Installation

```bash
npm install @cohesiumai/browser-ai
```

## Quick Start

```typescript
import { createBrowserAI } from '@cohesiumai/browser-ai';

const ai = createBrowserAI({
  config: { providerPolicy: { order: ['native', 'webllm'] } },
  providers: [/* your providers */],
});

await ai.init();

const { result } = ai.generate({
  messages: [{ role: 'user', content: 'Hello!' }],
});

const response = await result;
console.log(response.text);
```

## Documentation

Full documentation: https://github.com/CohesiumAI/browser-ai

## License

MIT
