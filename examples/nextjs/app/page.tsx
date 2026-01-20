'use client';

/**
 * browser-ai Next.js example.
 * CDC v2026.8 Annexe A.2 — Minimal Next.js integration.
 */

import { useState, useMemo } from 'react';
import { useLocalCompletion } from '@cohesiumai/react';
import { AIPopover } from '@cohesiumai/ui';
import { createMockProvider } from '@cohesiumai/providers-mock';
import { createNativeProvider } from '@cohesiumai/providers-native';
import { createWebLLMProvider, clearWebLLMModelCache } from '@cohesiumai/providers-webllm';
import type { BrowserAIConfig, ProviderId } from '@cohesiumai/core';

// Runtime mobile detection
function detectMobile(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Get provider order based on device type
function getProviderOrder(): ProviderId[] {
  const isMobile = detectMobile();
  // Note: SmolLM not available in Next.js due to onnxruntime-node incompatibility
  if (isMobile) return ['native', 'mock'];
  return ['native', 'webllm', 'mock'];
}

// Providers available (SmolLM excluded due to Next.js webpack limitations)
const providers = [
  createNativeProvider(),
  createWebLLMProvider(),
  createMockProvider({ scenario: 'happy' }),
];

// Clear caches utility
async function clearAllCaches(): Promise<void> {
  try {
    await clearWebLLMModelCache(['Llama-3.2-1B-Instruct-q4f16_1-MLC']);
  } catch (err) {
    console.warn('[ClearCache] WebLLM purge skipped:', err);
  }
  const cacheNames = await caches.keys();
  for (const name of cacheNames) await caches.delete(name);
}

export default function Home() {
  const [isClearing, setIsClearing] = useState(false);

  const config = useMemo<BrowserAIConfig>(() => ({
    privacyMode: 'any',
    providerPolicy: { order: getProviderOrder() },
  }), []);

  const completion = useLocalCompletion({
    config,
    providers,
    autoInit: true,
  });

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      await clearAllCaches();
      window.location.reload();
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <main style={styles.main}>
      <h1 style={styles.title}>browser-ai + Next.js</h1>
      <p style={styles.subtitle}>Local AI in your browser — zero cloud, zero latency</p>

      <AIPopover completion={completion} placeholder="Ask me anything..." />

      <div style={styles.diagnostics}>
        <button
          onClick={() => {
            const diag = completion.getDiagnostics();
            if (diag) {
              console.log('Diagnostics:', diag);
              alert(`Provider: ${diag.selectionReport?.selected ?? 'none'}\nState: ${diag.state.name}`);
            }
          }}
          style={styles.button}
        >
          Show Diagnostics
        </button>
        <button
          onClick={handleClearCache}
          disabled={isClearing}
          style={styles.clearButton}
        >
          {isClearing ? '🔄 Clearing...' : '🗑️ Clear Cache'}
        </button>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    gap: '24px',
    padding: '40px',
    background: '#f5f5f5',
  },
  title: {
    fontSize: '32px',
    fontWeight: 600,
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: '16px',
    color: '#666',
    marginBottom: '16px',
  },
  diagnostics: {
    marginTop: '16px',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    background: 'white',
    cursor: 'pointer',
    fontSize: '14px',
  },
  clearButton: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: '1px solid #ff9800',
    background: '#fff3e0',
    color: '#e65100',
    cursor: 'pointer',
    fontSize: '14px',
    marginLeft: '8px',
  },
};
