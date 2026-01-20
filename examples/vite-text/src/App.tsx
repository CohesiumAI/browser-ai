/**
 * browser-ai Vite + React example.
 * CDC v2026.8 Annexe A.2 — Minimal text completion demo.
 */

import { useState, useEffect, useMemo } from 'react';
import { useLocalCompletion } from '@cohesiumai/react';
import { AIPopover } from '@cohesiumai/ui';
import { createMockProvider } from '@cohesiumai/providers-mock';
import { createNativeProvider } from '@cohesiumai/providers-native';
import { createWebLLMProvider, clearWebLLMModelCache } from '@cohesiumai/providers-webllm';
import { createSmolLMProvider } from '@cohesiumai/providers-smollm';
import type { BrowserAIConfig, DiagnosticsSnapshot, ProviderId } from '@cohesiumai/core';

// Runtime mobile detection
function detectMobile(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Get provider order based on device type
function getProviderOrder(): ProviderId[] {
  const isMobile = detectMobile();
  console.log('[browser-ai] Device detection:', isMobile ? 'MOBILE' : 'DESKTOP');
  
  if (isMobile) {
    // Mobile: SmolLM (lightweight) first
    return ['smollm', 'native', 'mock'];
  }
  // Desktop: Native → WebLLM → SmolLM → Mock
  return ['native', 'webllm', 'smollm', 'mock'];
}

// All providers available
const providers = [
  createNativeProvider(),
  createWebLLMProvider(),
  createSmolLMProvider(),
  createMockProvider({ scenario: 'happy' }),
];

// Clear all caches utility
async function clearAllCaches(): Promise<void> {
  try {
    await clearWebLLMModelCache(['Llama-3.2-1B-Instruct-q4f16_1-MLC']);
  } catch (err) {
    console.warn('[ClearCache] WebLLM cache purge skipped:', err);
  }
  const cacheNames = await caches.keys();
  for (const name of cacheNames) {
    await caches.delete(name);
  }
  console.log('[ClearCache] ✅ All caches cleared');
}

function App() {
  const [isClearing, setIsClearing] = useState(false);

  // Create config at runtime with mobile detection
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

  const [diagnostics, setDiagnostics] = useState<DiagnosticsSnapshot | null>(null);
  const [copied, setCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Auto-refresh diagnostics every 500ms when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      setDiagnostics(completion.getDiagnostics());
    }, 500);
    return () => clearInterval(interval);
  }, [autoRefresh, completion]);

  const handleShowDiagnostics = () => {
    const diag = completion.getDiagnostics();
    setDiagnostics(diag);
    setCopied(false);
    setAutoRefresh(true);
  };

  const handleCopyDiagnostics = async () => {
    if (!diagnostics) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDiagnostics = (diag: DiagnosticsSnapshot): string => {
    const lines: string[] = [];
    lines.push(`State: ${diag.state.name}`);
    lines.push(`Provider: ${diag.selectionReport?.selected ?? 'none'}`);
    if (diag.timings?.bootMs) {
      lines.push(`Boot: ${diag.timings.bootMs}ms`);
    }
    if (diag.storage) {
      const usedMB = Math.round((diag.storage.usageBytes ?? 0) / 1024 / 1024);
      const quotaMB = Math.round((diag.storage.quotaBytes ?? 0) / 1024 / 1024);
      lines.push(`Storage: ${usedMB}MB / ${quotaMB}MB`);
    }
    if (diag.selectionReport?.reasons) {
      const providers = diag.selectionReport.reasons.map(r => r.providerId);
      lines.push(`Candidates: ${providers.join(', ')}`);
    }
    return lines.join('\n');
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>browser-ai Demo</h1>
      <p style={styles.subtitle}>Local AI in your browser — zero cloud, zero latency</p>
      
      {diagnostics?.cache?.modelId && (
        <div style={styles.modelBadge}>
          Model: <strong>{diagnostics.cache.modelId}</strong>
        </div>
      )}
      
      <AIPopover completion={completion} placeholder="Ask me anything..." />

      <div style={styles.diagnosticsSection}>
        <div style={styles.buttonRow}>
          <button onClick={handleShowDiagnostics} style={styles.diagButton}>
            {autoRefresh ? '⟳ Auto-Refresh ON' : 'Show Diagnostics'}
          </button>
          {autoRefresh && (
            <button onClick={() => setAutoRefresh(false)} style={styles.stopButton}>
              Stop Auto-Refresh
            </button>
          )}
          <button 
            onClick={handleClearCache} 
            disabled={isClearing}
            style={styles.clearButton}
          >
            {isClearing ? '🔄 Clearing...' : '🗑️ Clear Cache'}
          </button>
        </div>

        {diagnostics && (
          <div style={styles.diagnosticsPanel}>
            <div style={styles.diagnosticsHeader}>
              <span style={styles.diagnosticsTitle}>Diagnostics</span>
              <button onClick={handleCopyDiagnostics} style={styles.copyButton}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <pre style={styles.diagnosticsContent}>
              {formatDiagnostics(diagnostics)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    padding: '40px',
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
  modelBadge: {
    padding: '8px 16px',
    backgroundColor: '#e8f4e8',
    border: '1px solid #4caf50',
    borderRadius: '20px',
    fontSize: '14px',
    color: '#2e7d32',
  },
  diagnosticsSection: {
    marginTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  diagButton: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    background: 'white',
    cursor: 'pointer',
    fontSize: '14px',
  },
  stopButton: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #f44336',
    background: '#ffebee',
    color: '#c62828',
    cursor: 'pointer',
    fontSize: '12px',
  },
  buttonRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  clearButton: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: '1px solid #ff9800',
    background: '#fff3e0',
    color: '#e65100',
    cursor: 'pointer',
    fontSize: '14px',
  },
  diagnosticsPanel: {
    width: '400px',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    backgroundColor: '#f8f9fa',
    overflow: 'hidden',
  },
  diagnosticsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: '#e9ecef',
    borderBottom: '1px solid #e0e0e0',
  },
  diagnosticsTitle: {
    fontWeight: 600,
    fontSize: '14px',
    color: '#333',
  },
  copyButton: {
    padding: '4px 10px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    background: 'white',
    cursor: 'pointer',
    fontSize: '12px',
  },
  diagnosticsContent: {
    padding: '12px',
    margin: 0,
    fontSize: '13px',
    fontFamily: 'monospace',
    whiteSpace: 'pre-wrap',
    color: '#333',
    lineHeight: 1.5,
  },
};

export default App;
