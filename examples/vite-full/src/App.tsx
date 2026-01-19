/**
 * vite-full example — Full ChatGPT-like interface.
 * Uses @browser-ai/ui ChatApp with all features: Multi-chat, TTS, ASR, OCR, File attachments.
 * Model download triggers after first message.
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { useLocalCompletion } from '@browser-ai/react';
import { ChatApp } from '@browser-ai/ui';
import { clearWebLLMModelCache } from '@browser-ai/providers-webllm';

/**
 * Clear all browser caches (Cache Storage + IndexedDB) and reload.
 * Useful for fixing corrupted model downloads.
 */
async function clearAllCaches(): Promise<void> {
  // Best-effort: explicitly clear WebLLM caches (may include internal stores beyond Cache Storage)
  try {
    const modelIds = [
      'Llama-3.1-8B-Instruct-q4f16_1-MLC',
      'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      'Llama-3.2-1B-Instruct-q4f32_1-MLC',
    ];

    await clearWebLLMModelCache(modelIds);
  } catch (err) {
    console.warn('[ClearCache] WebLLM cache purge skipped:', err);
  }

  // Clear Cache Storage
  const cacheNames = await caches.keys();
  for (const name of cacheNames) {
    await caches.delete(name);
    console.log('[ClearCache] Deleted cache:', name);
  }
  
  // Clear IndexedDB
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) {
      indexedDB.deleteDatabase(db.name);
      console.log('[ClearCache] Deleted IndexedDB:', db.name);
    }
  }
  
  console.log('[ClearCache] ✅ All caches cleared, reloading...');
}
import { createMockProvider } from '@browser-ai/providers-mock';
import { createNativeProvider } from '@browser-ai/providers-native';
import { createWebLLMProvider } from '@browser-ai/providers-webllm';
import { createWASMProvider } from '@browser-ai/providers-wasm';
import { createSmolLMProvider } from '@browser-ai/providers-smollm';
import { createOcrModule, createDocumentStore, type OcrModule, type DocumentStore } from '@browser-ai/modules-ocr';
import type { BrowserAIConfig, ProviderId } from '@browser-ai/core';

// Runtime mobile detection (evaluated in browser, not at build time)
function detectMobile(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Get provider order based on device type
function getProviderOrder(): ProviderId[] {
  const isMobile = detectMobile();
  console.log('[browser-ai] Device detection:', isMobile ? 'MOBILE' : 'DESKTOP');
  
  if (isMobile) {
    // Mobile: SmolLM (lightweight Transformers.js) first
    return ['smollm', 'native', 'mock'];
  }
  // Desktop: Native → WebLLM → WASM → SmolLM → Mock
  return ['native', 'webllm', 'wasm', 'smollm', 'mock'];
}

// All providers available - selection based on policy order
const providers = [
  createNativeProvider(),
  createWebLLMProvider(),
  createSmolLMProvider(),
  createMockProvider({ scenario: 'happy' }),
  createWASMProvider(),
];

function App() {
  const [isClearing, setIsClearing] = useState(false);

  // Create config at runtime with mobile detection
  const config = useMemo<BrowserAIConfig>(() => ({
    privacyMode: 'any',
    providerPolicy: { order: getProviderOrder() },
    publicBaseUrl: '/assets',
  }), []);

  const completion = useLocalCompletion({
    config,
    providers,
    autoInit: false,
  });

  // Handle clear cache button click
  const handleClearCache = useCallback(async () => {
    if (isClearing) return;
    
    const confirmed = window.confirm(
      'Clear all cached models and reload?\n\nThis will delete downloaded AI models and force a fresh download.'
    );
    if (!confirmed) return;

    setIsClearing(true);
    try {
      await clearAllCaches();
      window.location.reload();
    } catch (err) {
      console.error('[ClearCache] Error:', err);
      setIsClearing(false);
      alert('Failed to clear cache. Check console for details.');
    }
  }, [isClearing]);

  // OCR module and DocumentStore instances
  const ocrRef = useRef<OcrModule | null>(null);
  const docStoreRef = useRef<DocumentStore | null>(null);

  // Initialize OCR module and DocumentStore
  useEffect(() => {
    const initOcr = async () => {
      if (!ocrRef.current) {
        ocrRef.current = createOcrModule();
        docStoreRef.current = createDocumentStore();
        try {
          await ocrRef.current.init({
            privacyMode: 'fully-local-managed',
            language: 'eng',
          });
          console.log('[App] OCR module initialized');
        } catch (err) {
          console.error('[App] OCR init failed:', err);
        }
      }
    };
    initOcr();
  }, []);

  // Process files: OCR + store in DocumentStore, return only display text
  const processFile = useCallback(async (file: File): Promise<string> => {
    const ocr = ocrRef.current;
    const store = docStoreRef.current;

    // Text files
    if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const content = await file.text();
      if (store && ocr) {
        const chunks = await ocr.extractChunks(content, { chunkSizeChars: 1500, overlapChars: 150 });
        store.addDocument(file.name, 'text', chunks);
      }
      return `📄 ${file.name} (${Math.round(file.size / 1024)} KB) - indexed`;
    }

    // Images: OCR then store
    if (file.type.startsWith('image/')) {
      if (ocr && store) {
        try {
          const result = await ocr.ocrImage(file);
          const chunks = await ocr.extractChunks(result.text, { chunkSizeChars: 1500, overlapChars: 150 });
          store.addDocument(file.name, 'image', chunks);
          return `🖼️ ${file.name} - OCR done, ${result.text.length} chars indexed`;
        } catch (err) {
          console.error('[App] Image OCR failed:', err);
          return `🖼️ ${file.name} - OCR failed`;
        }
      }
      return `🖼️ ${file.name} - ${Math.round(file.size / 1024)} KB`;
    }

    // PDFs: OCR then store
    if (file.type === 'application/pdf') {
      if (ocr && store) {
        try {
          const result = await ocr.ocrPdf(file);
          const chunks = await ocr.extractChunks(result.text, { chunkSizeChars: 1500, overlapChars: 150 });
          store.addDocument(file.name, 'pdf', chunks);
          const pages = result.pages?.length || 1;
          return `📑 ${file.name} (${pages} pages) - indexed, ${chunks.length} chunks`;
        } catch (err) {
          console.error('[App] PDF OCR failed:', err);
          return `📑 ${file.name} - OCR failed`;
        }
      }
      return `📑 ${file.name} - ${Math.round(file.size / 1024)} KB`;
    }

    return `📎 ${file.name} - ${Math.round(file.size / 1024)} KB`;
  }, []);

  // RAG: search DocumentStore for relevant context
  const getContext = useCallback(async (query: string): Promise<string> => {
    const store = docStoreRef.current;
    if (!store) return '';

    const results = store.search(query, 5);
    if (results.length === 0) return '';

    // Build context from top chunks
    const contextParts = results.map((r) => 
      `[${r.chunk.documentName}${r.chunk.pageNumber ? ` p.${r.chunk.pageNumber}` : ''}]\n${r.chunk.text}`
    );

    const context = contextParts.join('\n\n---\n\n');
    console.log(`[App] RAG: found ${results.length} chunks for query`);

    // Limit context size (~6000 chars = ~1500 tokens)
    if (context.length > 6000) {
      return context.slice(0, 6000) + '\n\n[... more context truncated ...]';
    }
    return context;
  }, []);

  // Clear cache button for header
  const clearCacheButton = (
    <button
      onClick={handleClearCache}
      disabled={isClearing}
      title="Clear cached models and reload"
      style={{
        background: 'transparent',
        border: '1px solid #666',
        borderRadius: '6px',
        padding: '4px 10px',
        color: '#ccc',
        cursor: isClearing ? 'wait' : 'pointer',
        fontSize: '13px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
      }}
    >
      {isClearing ? '⏳' : '🗑️'} {isClearing ? 'Clearing...' : 'Clear Cache'}
    </button>
  );

  return (
    <ChatApp
      completion={completion}
      title="browser-ai"
      welcomeMessage="Welcome! I am browser-ai, a 100% local AI. Send a message to start!"
      placeholder="Type your message..."
      enableTTS={true}
      enableASR={true}
      enableOCR={true}
      enableFileAttach={true}
      onProcessFile={processFile}
      onGetContext={getContext}
      headerActions={clearCacheButton}
    />
  );
}

export default App;
