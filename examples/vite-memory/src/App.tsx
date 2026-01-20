import { useState, useCallback, useRef } from 'react';
import {
  createMemoryModule,
  type MemoryModule,
  type MemoryConfig,
  type Turn,
  type ConversationContext,
  type MemoryDiagnostics,
} from '@cohesiumai/modules-memory';

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
  const [context, setContext] = useState<ConversationContext | null>(null);
  const [userInput, setUserInput] = useState('');
  const [diagnostics, setDiagnostics] = useState<MemoryDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  const memoryModuleRef = useRef<MemoryModule | null>(null);
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
    addLog('info', '⏳ Initializing Memory module...');

    try {
      const memoryModule = createMemoryModule();

      const config: MemoryConfig = {
        privacyMode: 'fully-local-managed',
        conversationId: `conv-${Date.now()}`,
        maxTurns: 20,
        summaryEveryTurns: 10,
      };

      await memoryModule.init(config);
      memoryModuleRef.current = memoryModule;
      
      setDiagnostics(memoryModule.getDiagnostics());
      setStatus('ready');
      
      const state = memoryModule.getState();
      addLog('success', `✅ Memory initialized! Backend: ${state.backend}`);
      addLog('info', `   Conversation: ${state.conversationId}`);
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog('error', `❌ Error: ${msg}`);
    }
  }, [addLog]);

  const handleAddMessage = useCallback(async (role: 'user' | 'assistant') => {
    if (!memoryModuleRef.current || !userInput.trim()) return;

    setStatus('processing');
    const content = role === 'user' ? userInput : `[AI Response to: "${userInput.slice(0, 30)}..."]`;
    
    addLog('info', `💬 Adding ${role} message...`);

    try {
      const turn: Turn = {
        role,
        content,
        createdAtMs: Date.now(),
      };

      await memoryModuleRef.current.addTurn(turn);
      
      const newContext = await memoryModuleRef.current.getContext();
      setContext(newContext);
      setDiagnostics(memoryModuleRef.current.getDiagnostics());
      setStatus('ready');

      addLog('success', `✅ Added ${role} turn`);
      addLog('info', `   Total turns: ${newContext.totalTurns}`);
      
      if (role === 'user') {
        setUserInput('');
      }
    } catch (err) {
      setStatus('ready');
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ Error: ${msg}`);
    }
  }, [addLog, userInput]);

  const handleGetContext = useCallback(async () => {
    if (!memoryModuleRef.current) return;

    setStatus('processing');
    addLog('info', '📋 Loading conversation context...');

    try {
      const ctx = await memoryModuleRef.current.getContext();
      setContext(ctx);
      setStatus('ready');

      addLog('success', `✅ Context loaded`);
      addLog('info', `   Recent turns: ${ctx.recentTurns.length} | Total: ${ctx.totalTurns}`);
      if (ctx.summary) {
        addLog('info', `   Summary available: ${ctx.summary.length} chars`);
      }
    } catch (err) {
      setStatus('ready');
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ Error: ${msg}`);
    }
  }, [addLog]);

  const handleClear = useCallback(async () => {
    if (!memoryModuleRef.current) return;

    addLog('info', '🗑️ Clearing conversation...');
    
    try {
      await memoryModuleRef.current.clearConversation();
      setContext(null);
      setDiagnostics(memoryModuleRef.current.getDiagnostics());
      addLog('success', '✅ Conversation cleared');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ Error: ${msg}`);
    }
  }, [addLog]);

  const handleTeardown = useCallback(async () => {
    if (!memoryModuleRef.current) return;

    addLog('info', '🔄 Shutting down Memory module...');
    await memoryModuleRef.current.teardown();
    memoryModuleRef.current = null;
    setStatus('idle');
    setDiagnostics(null);
    setContext(null);
    addLog('success', '✅ Module stopped');
  }, [addLog]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const isReady = status === 'ready';

  return (
    <div className="app">
      <header className="header">
        <h1>🧠 browser-ai Memory <span className="version">v1.3</span></h1>
        <p className="subtitle">Local conversation context with IndexedDB — 100% private</p>
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
              ▶️ Initialize Memory Module
            </button>
          ) : (
            <>
              <div className="section-title">💬 Add Message</div>
              <div className="input-group">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Type a message..."
                  disabled={!isReady}
                />
                <button
                  className="btn btn-user"
                  onClick={() => handleAddMessage('user')}
                  disabled={!isReady || !userInput.trim()}
                >
                  👤 User
                </button>
                <button
                  className="btn btn-assistant"
                  onClick={() => handleAddMessage('assistant')}
                  disabled={!isReady || !userInput.trim()}
                >
                  🤖 AI
                </button>
              </div>

              <div className="section-title">📋 Actions</div>
              <div className="button-row">
                <button className="btn" onClick={handleGetContext} disabled={!isReady}>
                  📖 Load Context
                </button>
                <button className="btn btn-warning" onClick={handleClear} disabled={!isReady}>
                  🗑️ Clear
                </button>
              </div>

              {context && context.recentTurns.length > 0 && (
                <>
                  <div className="section-title">💬 Recent Turns ({context.recentTurns.length})</div>
                  <div className="turns-list">
                    {context.recentTurns.slice(-5).map((turn, i) => (
                      <div key={i} className={`turn-item turn-${turn.role}`}>
                        <strong>{turn.role === 'user' ? '👤' : '🤖'}</strong>
                        <span>{turn.content.slice(0, 100)}{turn.content.length > 100 ? '...' : ''}</span>
                      </div>
                    ))}
                  </div>
                  {context.summary && (
                    <div className="summary-box">
                      <strong>📝 Summary:</strong>
                      <p>{context.summary}</p>
                    </div>
                  )}
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
          🔒 <strong>100% Local</strong> — All data stored in IndexedDB, never leaves your browser.
        </div>
        <p className="footer-note">
          Demo mode: Summary generation requires local text model integration.
        </p>
      </footer>
    </div>
  );
}

export default App;
