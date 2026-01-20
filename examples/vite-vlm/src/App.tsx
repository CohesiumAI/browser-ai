import { useState, useCallback, useRef } from 'react';
import {
  createVlmModule,
  detectTier,
  type VlmModule,
  type VlmConfig,
  type VlmResult,
  type VlmDiagnostics,
  type DeviceTier,
} from '@cohesiumai/modules-vlm';

type Status = 'idle' | 'initializing' | 'ready' | 'processing' | 'error';

interface LogEntry {
  id: number;
  time: string;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

function App() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<VlmResult | null>(null);
  const [prompt, setPrompt] = useState('What is in this image?');
  const [deviceTier] = useState<DeviceTier>(() => detectTier());
  const [diagnostics, setDiagnostics] = useState<VlmDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  const vlmModuleRef = useRef<VlmModule | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logIdRef = useRef(0);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const entry: LogEntry = {
      id: logIdRef.current++,
      time: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setLogs(prev => [...prev.slice(-29), entry]);
  }, []);

  const handleInit = useCallback(async () => {
    setStatus('initializing');
    setError(null);
    addLog('info', '⏳ Initializing VLM module...');
    addLog('info', `   Device tier: ${deviceTier} ${deviceTier === 3 ? '(High-end)' : deviceTier === 2 ? '(Mid-range)' : '(Mobile)'}`);

    try {
      const vlmModule = createVlmModule();

      const config: VlmConfig = {
        privacyMode: 'fully-local-managed',
        requireTier3: false, // Allow demo on any device
      };

      await vlmModule.init(config);
      vlmModuleRef.current = vlmModule;
      
      setDiagnostics(vlmModule.getDiagnostics());
      setStatus('ready');
      
      const state = vlmModule.getState();
      addLog('success', `✅ VLM initialized! Backend: ${state.backend}`);
      addLog('info', `   Model loaded: ${state.modelLoaded ? 'Yes' : 'Placeholder'}`);
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog('error', `❌ Error: ${msg}`);
    }
  }, [addLog, deviceTier]);

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !vlmModuleRef.current) return;

    setStatus('processing');
    addLog('info', `🖼️ Processing: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      const imageBuffer = await file.arrayBuffer();
      const vlmResult = await vlmModuleRef.current.describeImage(imageBuffer);
      
      setResult(vlmResult);
      setDiagnostics(vlmModuleRef.current.getDiagnostics());
      setStatus('ready');

      addLog('success', '✅ Image analysis complete!');
      addLog('info', `   Response: "${vlmResult.text.slice(0, 100)}..."`);
      addLog('info', `   Duration: ${vlmResult.durationMs?.toFixed(0)}ms`);
    } catch (err) {
      setStatus('ready');
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ VLM Error: ${msg}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addLog]);

  const handleChatWithImage = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !vlmModuleRef.current || !prompt.trim()) return;

    setStatus('processing');
    addLog('info', `🖼️💬 Chat with image: ${file.name}`);
    addLog('info', `   Prompt: "${prompt}"`);

    try {
      const imageBuffer = await file.arrayBuffer();
      const vlmResult = await vlmModuleRef.current.chatWithImage({
        image: imageBuffer,
        prompt: prompt,
      });
      
      setResult(vlmResult);
      setDiagnostics(vlmModuleRef.current.getDiagnostics());
      setStatus('ready');

      addLog('success', '✅ Chat response received!');
      addLog('info', `   Response: "${vlmResult.text.slice(0, 100)}..."`);
    } catch (err) {
      setStatus('ready');
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ VLM Error: ${msg}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addLog, prompt]);

  const handleTeardown = useCallback(async () => {
    if (!vlmModuleRef.current) return;

    addLog('info', '🔄 Shutting down VLM module...');
    await vlmModuleRef.current.teardown();
    vlmModuleRef.current = null;
    setStatus('idle');
    setDiagnostics(null);
    setResult(null);
    addLog('success', '✅ Module stopped');
  }, [addLog]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const isReady = status === 'ready';
  const tierColor = deviceTier === 3 ? '#4ade80' : deviceTier === 2 ? '#fbbf24' : '#f87171';

  return (
    <div className="app">
      <header className="header">
        <h1>👁️ browser-ai VLM <span className="version">v2.0</span></h1>
        <p className="subtitle">Local Vision-Language Model — 100% private image understanding</p>
      </header>

      <div className="status-bar">
        <span className="status-indicator">
          {status === 'ready' ? '🟢' : status === 'error' ? '🔴' : status === 'processing' ? '🟡' : '⚪'}{' '}
          {status === 'idle' ? 'Not initialized' : status === 'initializing' ? 'Initializing...' : status === 'ready' ? 'Ready' : status === 'processing' ? 'Processing...' : 'Error'}
        </span>
        <span className="tier-badge" style={{ borderColor: tierColor, color: tierColor }}>
          Tier {deviceTier}
        </span>
        {error && <span className="error-text">— {error}</span>}
      </div>

      <div className="main-grid">
        <section className="card controls-card">
          <h2>🎛️ Controls</h2>
          
          {status === 'idle' ? (
            <>
              <div className="tier-warning">
                {deviceTier < 3 && (
                  <p className="warning-text">
                    ⚠️ VLM works best on Tier 3 devices (8+ CPU cores). 
                    Your device is Tier {deviceTier}. Performance may be limited.
                  </p>
                )}
              </div>
              <button className="btn btn-primary btn-large" onClick={handleInit}>
                ▶️ Initialize VLM Module
              </button>
            </>
          ) : (
            <>
              <div className="section-title">🖼️ Describe Image</div>
              <div className="button-row">
                <button
                  className="btn btn-upload"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!isReady}
                >
                  📷 Upload Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
              </div>

              <div className="section-title">💬 Chat with Image</div>
              <div className="input-group">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your question about the image..."
                  disabled={!isReady}
                />
              </div>
              <div className="button-row">
                <button
                  className="btn btn-chat"
                  onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = 'image/*';
                    input.onchange = (e) => handleChatWithImage(e as unknown as React.ChangeEvent<HTMLInputElement>);
                    input.click();
                  }}
                  disabled={!isReady || !prompt.trim()}
                >
                  🖼️💬 Select Image & Ask
                </button>
              </div>

              {result && (
                <>
                  <div className="section-title">📝 Result</div>
                  <div className="result-box">
                    <p>{result.text}</p>
                    {result.durationMs && (
                      <span className="result-meta">Duration: {result.durationMs.toFixed(0)}ms</span>
                    )}
                  </div>
                </>
              )}

              <div className="divider" />
              
              <button
                className="btn btn-danger"
                onClick={handleTeardown}
                disabled={status === 'processing'}
              >
                ⏹️ Stop Module
              </button>
            </>
          )}
        </section>

        <section className="card logs-card">
          <div className="card-header">
            <h2>📋 Log</h2>
            <button className="btn btn-small" onClick={clearLogs}>Clear</button>
          </div>
          <div className="logs-container">
            {logs.length === 0 ? (
              <p className="logs-empty">No logs. Initialize the module to start.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`log-entry log-${log.type}`}>
                  <span className="log-time">{log.time}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {diagnostics && (
        <section className="card diagnostics-card">
          <div className="card-header">
            <h2>🔧 Diagnostics</h2>
            <button 
              className="btn btn-small"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
            >
              {showDiagnostics ? 'Hide' : 'Show'}
            </button>
          </div>
          {showDiagnostics && (
            <pre className="diagnostics-json">{JSON.stringify(diagnostics, null, 2)}</pre>
          )}
        </section>
      )}

      <footer className="footer">
        <div className="privacy-badge">
          🔒 <strong>100% Local</strong> — All image processing happens on your device.
        </div>
        <p className="footer-note">
          Demo mode: WebGPU VLM model not loaded. API returns placeholder results.
        </p>
      </footer>
    </div>
  );
}

export default App;
