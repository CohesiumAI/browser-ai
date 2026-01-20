import { useState, useCallback, useRef } from 'react';
import {
  createOcrModule,
  type OcrModule,
  type OcrConfig,
  type OcrResult,
  type OcrDiagnostics,
} from '@cohesiumai/modules-ocr';

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
  const [extractedText, setExtractedText] = useState<string>('');
  const [chunks, setChunks] = useState<string[]>([]);
  const [diagnostics, setDiagnostics] = useState<OcrDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  const ocrModuleRef = useRef<OcrModule | null>(null);
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
    addLog('info', '⏳ Initializing OCR module...');

    try {
      const ocrModule = createOcrModule();

      const config: OcrConfig = {
        privacyMode: 'fully-local-managed',
        language: 'eng',
        pdf: { preferTextLayer: true },
      };

      await ocrModule.init(config);
      ocrModuleRef.current = ocrModule;
      
      setDiagnostics(ocrModule.getDiagnostics());
      setStatus('ready');
      
      const state = ocrModule.getState();
      addLog('success', `✅ OCR initialized! Backend: ${state.backend}`);
      addLog('info', `   Language: ${state.language} | PDF text layer: ${state.pdfTextLayerPreferred ? 'preferred' : 'OCR only'}`);
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog('error', `❌ Error: ${msg}`);
    }
  }, [addLog]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !ocrModuleRef.current) return;

    setStatus('processing');
    addLog('info', `📂 Processing: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      let result: OcrResult;
      
      if (file.type === 'application/pdf') {
        addLog('info', '📄 Extracting text from PDF...');
        result = await ocrModuleRef.current.ocrPdf(file);
      } else if (file.type.startsWith('image/')) {
        addLog('info', '🖼️ Running OCR on image...');
        result = await ocrModuleRef.current.ocrImage(file);
      } else {
        throw new Error(`Unsupported file type: ${file.type}`);
      }

      setExtractedText(result.text);
      setDiagnostics(ocrModuleRef.current.getDiagnostics());
      setStatus('ready');

      addLog('success', '✅ Text extraction complete!');
      addLog('info', `   Characters: ${result.text.length} | Confidence: ${((result.confidence || 0) * 100).toFixed(0)}%`);
      if (result.pages) {
        addLog('info', `   Pages: ${result.pages.length}`);
      }
    } catch (err) {
      setStatus('ready');
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ OCR Error: ${msg}`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addLog]);

  const handleExtractChunks = useCallback(async () => {
    if (!ocrModuleRef.current || !extractedText) return;

    setStatus('processing');
    addLog('info', '📑 Splitting text into chunks...');

    try {
      const result = await ocrModuleRef.current.extractChunks(extractedText, {
        chunkSizeChars: 1000,
        overlapChars: 100,
        maxChunks: 50,
      });

      setChunks(result);
      setStatus('ready');

      addLog('success', `✅ Created ${result.length} chunks`);
      addLog('info', `   Avg chunk size: ${Math.round(result.reduce((a, c) => a + c.length, 0) / result.length)} chars`);
    } catch (err) {
      setStatus('ready');
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ Chunking error: ${msg}`);
    }
  }, [addLog, extractedText]);

  const handleTeardown = useCallback(async () => {
    if (!ocrModuleRef.current) return;

    addLog('info', '🔄 Shutting down OCR module...');
    await ocrModuleRef.current.teardown();
    ocrModuleRef.current = null;
    setStatus('idle');
    setDiagnostics(null);
    setExtractedText('');
    setChunks([]);
    addLog('success', '✅ Module stopped');
  }, [addLog]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const isReady = status === 'ready';

  return (
    <div className="app">
      <header className="header">
        <h1>📄 browser-ai OCR <span className="version">v1.2</span></h1>
        <p className="subtitle">Local image &amp; PDF text extraction — 100% private</p>
      </header>

      <div className="status-bar">
        <span className="status-indicator">
          {status === 'ready' ? '🟢' : status === 'error' ? '🔴' : status === 'processing' ? '🟡' : '⚪'}{' '}
          {status === 'idle' ? 'Not initialized' : status === 'initializing' ? 'Initializing...' : status === 'ready' ? 'Ready' : status === 'processing' ? 'Processing...' : 'Error'}
        </span>
        {error && <span className="error-text">— {error}</span>}
      </div>

      <div className="main-grid">
        <section className="card controls-card">
          <h2>🎛️ Controls</h2>
          
          {status === 'idle' ? (
            <button className="btn btn-primary btn-large" onClick={handleInit}>
              ▶️ Initialize OCR Module
            </button>
          ) : (
            <>
              <div className="section-title">📂 Upload File</div>
              <div className="button-row">
                <button
                  className="btn btn-upload"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!isReady}
                >
                  📷 Image / 📄 PDF
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </div>

              {extractedText && (
                <>
                  <div className="section-title">📝 Extracted Text</div>
                  <div className="text-preview">
                    {extractedText.slice(0, 500)}{extractedText.length > 500 ? '...' : ''}
                  </div>
                  <button
                    className="btn"
                    onClick={handleExtractChunks}
                    disabled={!isReady}
                  >
                    📑 Extract Chunks
                  </button>
                </>
              )}

              {chunks.length > 0 && (
                <>
                  <div className="section-title">📑 Chunks ({chunks.length})</div>
                  <div className="chunks-list">
                    {chunks.slice(0, 5).map((chunk, i) => (
                      <div key={i} className="chunk-item">
                        <strong>Chunk {i + 1}:</strong> {chunk.slice(0, 100)}...
                      </div>
                    ))}
                    {chunks.length > 5 && <p className="more-chunks">+ {chunks.length - 5} more chunks</p>}
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
          🔒 <strong>100% Local</strong> — All OCR processing happens in your browser.
        </div>
        <p className="footer-note">
          Demo mode: Tesseract.js WASM not loaded. API returns placeholder results.
        </p>
      </footer>
    </div>
  );
}

export default App;
