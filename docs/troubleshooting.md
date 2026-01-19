# Troubleshooting

Common issues and solutions for browser-ai v0.1 to v2.1.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Runtime Errors](#runtime-errors)
- [Module Errors (v1.1+)](#module-errors-v11)
- [Performance Issues](#performance-issues)
- [Browser-Specific Issues](#browser-specific-issues)

---

## Installation Issues

### `Module not found: @browser-ai/core`

**Cause**: Package not installed or incorrect import path.

**Solution**:
```bash
# Ensure all packages are installed
pnpm add @browser-ai/core @browser-ai/react @browser-ai/providers-webllm
```

### TypeScript errors with strict mode

**Cause**: Missing type declarations.

**Solution**: Ensure `@types/react` is installed for React projects:
```bash
pnpm add -D @types/react @types/react-dom
```

---

## Runtime Errors

### `ModelNotFoundError: Cannot find model record in appConfig`

**Cause**: The model ID doesn't exist in WebLLM's model list.

**Solution**: browser-ai v0.1 uses these validated models:
- `Llama-3.2-1B-Instruct-q4f16_1-MLC` (Nano)
- `Llama-3.2-3B-Instruct-q4f16_1-MLC` (Standard)

If you see this error, clear browser cache and reload.

### `ERROR_QUOTA_PREFLIGHT_FAIL: Insufficient storage`

**Cause**: Not enough storage space for model download.

**Solution**:
1. Clear browser cache: `chrome://settings/clearBrowserData`
2. Free up disk space
3. Use a smaller model (Nano tier)

### `ERROR_NATIVE_UNAVAILABLE: No provider available`

**Cause**: No configured provider is available.

**Solution**:
1. Check browser compatibility (WebGPU required for WebLLM)
2. Ensure at least one provider can be detected:
```typescript
// Check diagnostics
const diag = ai.getDiagnostics();
console.log('Capabilities:', diag.capabilities);
console.log('Selection reasons:', diag.selectionReport?.reasons);
```

### `WebGPU not available`

**Cause**: Browser doesn't support WebGPU.

**Solution**:
1. Update browser to latest version
2. For Firefox, enable `dom.webgpu.enabled` in `about:config`
3. Check GPU drivers are up to date
4. Try a different browser (Chrome recommended)

### `ERROR_ABORTED: Generation aborted by user`

**Cause**: `abort()` was called during generation.

**Solution**: This is expected behavior. Handle gracefully:
```typescript
try {
  const { result } = ai.generate({ messages });
  await result;
} catch (error) {
  if (error.code === 'ERROR_ABORTED') {
    console.log('User cancelled generation');
    return; // Don't treat as error
  }
  throw error;
}
```

### React: `getSnapshot should be cached`

**Cause**: React StrictMode warning about unstable getSnapshot.

**Solution**: This was fixed in v0.1. Ensure you're using the latest version:
```bash
pnpm update @browser-ai/react
```

### `GENERATION_STALLED` after abort

**Cause**: (Fixed in v2.1) Watchdog incorrectly detecting stall after engine recreation.

**Solution**: Update to v2.1+. If you're on an older version:
```typescript
// Workaround: increase timeout multiplier
const config = {
  timeouts: { timeoutMultiplier: 2.0 }, // Double all timeouts
};
```

### Generation doesn't respond after abort

**Cause**: (Fixed in v2.1) Engine recreation time was counted toward watchdog timeout.

**Solution**: Update to v2.1+. The fix ensures:
1. Engine recreation triggers `onRecreate` callback
2. FSM timing is reset via `resetGeneratingTiming()`
3. Watchdog starts fresh countdown after recreation

**Verification**: Look for this log after abort + new generation:
```
[browser-ai] Engine recreated, watchdog timing reset
```

---

## Module Errors (v1.1+)

### Audio Module

#### `ERROR_AUDIO_ASR_INIT_FAILED`

**Cause**: Whisper model failed to load.

**Solution**:
1. Ensure sufficient memory for model (~100-300MB)
2. Check browser WebAssembly support
3. Clear browser cache and retry

#### `ERROR_AUDIO_PERMISSION_DENIED`

**Cause**: Microphone access denied for streaming transcription.

**Solution**:
```typescript
// Check permission before calling transcribeStream
const permission = await navigator.permissions.query({ name: 'microphone' });
if (permission.state === 'denied') {
  alert('Microphone access is required for live transcription');
}
```

### OCR Module

#### `ERROR_OCR_INIT_FAILED`

**Cause**: Tesseract.js failed to initialize.

**Solution**:
1. Check network connectivity (language data downloaded on first use)
2. Verify language code is valid (e.g., `'eng'`, `'fra'`, `'deu'`)
3. Check browser console for CORS errors

#### `ERROR_PDF_TEXT_LAYER_PARSE_FAILED`

**Cause**: PDF text extraction failed.

**Solution**:
1. PDF may be image-only — OCR will be used automatically
2. Check PDF is not password-protected
3. Try with a different PDF file

### Memory Module

#### `ERROR_MEMORY_IDB_FAILED`

**Cause**: IndexedDB storage failed.

**Solution**:
1. Check if IndexedDB is available:
```typescript
if (!window.indexedDB) {
  console.error('IndexedDB not supported');
}
```
2. Clear IndexedDB storage in browser settings
3. Check storage quota is not exceeded

### VLM Module

#### `ERROR_VLM_TIER_NOT_SUPPORTED`

**Cause**: Device doesn't meet tier 3 requirements for VLM.

**Solution**:
```typescript
import { isVlmSupported, createOcrModule } from '@browser-ai/modules-vlm';

const support = isVlmSupported();
if (!support.supported) {
  console.warn('VLM not supported:', support.reason);
  // Fall back to OCR for image text extraction
  const ocr = createOcrModule();
  await ocr.init({ privacyMode: 'fully-local-managed' });
}
```

**Requirements**:
- 8+ CPU cores
- WebGPU support
- Desktop device (not mobile)

#### `ERROR_VLM_INIT_FAILED`

**Cause**: VLM model failed to load.

**Solution**:
1. Ensure WebGPU is available:
```typescript
if (!navigator.gpu) {
  console.error('WebGPU not available');
}
```
2. Check GPU memory is sufficient (~2GB+)
3. Update GPU drivers

---

## Performance Issues

### Model download is very slow

**Cause**: Large model size and/or slow network.

**Solution**:
1. Models are cached after first download
2. Use smaller model for testing:
```typescript
// Force nano model selection
// (automatic on mobile devices)
```

3. Check download progress in console:
```
[WebLLM] 25% - Fetching model weights...
```

### Generation is slow

**Cause**: GPU not being utilized efficiently.

**Solution**:
1. Ensure hardware acceleration is enabled:
   - Chrome: `chrome://settings/system` → Use hardware acceleration
2. Close other GPU-intensive applications
3. Check WebGPU adapter info:
```typescript
const adapter = await navigator.gpu.requestAdapter();
console.log(adapter?.name, adapter?.features);
```

### High memory usage

**Cause**: Model weights loaded in GPU memory.

**Solution**:
1. Call `teardown()` when done to release memory
2. Use smaller models for memory-constrained devices
3. Close browser tabs not in use

### UI freezes during loading

**Cause**: Heavy operations on main thread.

**Solution**: Show loading UI and disable interactions:
```tsx
const { state } = useLocalCompletion({ ... });

const isLoading = ['DOWNLOADING', 'WARMING_UP'].includes(state.name);

return (
  <div>
    {isLoading && <LoadingSpinner />}
    <button disabled={state.name !== 'READY'}>Generate</button>
  </div>
);
```

---

## Browser-Specific Issues

### Chrome

#### Native AI not available

1. Check Chrome version (127+ required)
2. Enable flag: `chrome://flags/#prompt-api-for-gemini-nano`
3. Restart browser
4. Wait for model download (happens in background)

#### WebGPU errors

1. Update Chrome to latest version
2. Check `chrome://gpu` for WebGPU status
3. Update GPU drivers

### Firefox

#### WebGPU not available

1. Navigate to `about:config`
2. Set `dom.webgpu.enabled` = `true`
3. Restart Firefox

#### SharedArrayBuffer errors

Add headers to your server:
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

### Safari

#### WebGPU experimental

Safari 18+ has experimental WebGPU support:
1. Enable: Develop → Experimental Features → WebGPU
2. Performance may vary

### Edge

Same as Chrome (Chromium-based). Follow Chrome instructions.

---

## Debugging

### Enable verbose logging

```typescript
// Check state transitions
ai.subscribe((state, prev) => {
  console.log(`[browser-ai] ${prev.name} → ${state.name}`);
});
```

### Inspect diagnostics

```typescript
const diag = ai.getDiagnostics();
console.log(JSON.stringify(diag, null, 2));

// Key fields to check:
// - diag.capabilities: Browser feature support
// - diag.selectionReport: Why provider was selected
// - diag.state: Current state and errors
// - diag.recentErrors: Error history
```

### Check WebGPU support

```javascript
async function checkWebGPU() {
  if (!navigator.gpu) {
    console.log('WebGPU not supported');
    return;
  }
  
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.log('No GPU adapter found');
    return;
  }
  
  console.log('WebGPU adapter:', adapter.name);
  console.log('Features:', [...adapter.features]);
  console.log('Limits:', adapter.limits);
}

checkWebGPU();
```

### Clear model cache

If you suspect cache corruption:

```javascript
// Clear all cached models
caches.keys().then(keys => {
  keys.filter(k => k.includes('webllm')).forEach(k => {
    caches.delete(k);
    console.log('Deleted cache:', k);
  });
});
```

---

## Getting Help

If you're still stuck:

1. **Check existing issues**: [GitHub Issues](https://github.com/example/browser-ai/issues)
2. **Create a new issue** with:
   - browser-ai version
   - Browser and version
   - Operating system
   - Diagnostics snapshot (`ai.getDiagnostics()`)
   - Steps to reproduce
   - Error messages and stack traces
