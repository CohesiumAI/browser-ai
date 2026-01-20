import { useState, useCallback, useRef } from 'react';
import {
  createAudioModule,
  type AudioModule,
  type AudioConfig,
  type AsrResult,
  type AudioDiagnostics,
} from '@cohesiumai/modules-audio';

type Status = 'idle' | 'initializing' | 'ready' | 'processing' | 'recording' | 'error';

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
  const [ttsText, setTtsText] = useState('Bonjour ! Ceci est un test du système de synthèse vocale local.');
  const [transcript, setTranscript] = useState<string>('');
  const [diagnostics, setDiagnostics] = useState<AudioDiagnostics | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  
  const audioModuleRef = useRef<AudioModule | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
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
    addLog('info', '⏳ Initialisation du module audio...');

    try {
      const audioModule = createAudioModule();

      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        asr: { enabled: true, model: 'default', language: 'fr' },
        vad: { enabled: true, sensitivity: 0.5 },
        tts: { enabled: true, voice: 'neutral', speed: 1.0 },
      };

      await audioModule.init(config);
      audioModuleRef.current = audioModule;
      
      const state = audioModule.getState();
      setDiagnostics(audioModule.getDiagnostics());
      setStatus('ready');
      
      addLog('success', `✅ Module initialisé ! Backend: ${state.backend}`);
      addLog('info', `   ASR: ${state.asrReady ? '✓' : '✗'} | VAD: ${state.vadReady ? '✓' : '✗'} | TTS: ${state.ttsReady ? '✓' : '✗'}`);
    } catch (err) {
      setStatus('error');
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      addLog('error', `❌ Erreur: ${msg}`);
    }
  }, [addLog]);

  const startRecording = useCallback(async () => {
    try {
      addLog('info', '🎙️ Demande accès microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        addLog('info', `📁 Audio enregistré: ${(audioBlob.size / 1024).toFixed(1)} KB`);
        
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setStatus('recording');
      addLog('success', '🔴 Enregistrement en cours... Parlez maintenant !');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ Erreur micro: ${msg}`);
      setError(msg);
    }
  }, [addLog]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      addLog('info', '⏹️ Enregistrement arrêté');
      setStatus('processing');
    }
  }, [addLog]);

  const processAudio = useCallback(async (audioBlob: Blob) => {
    if (!audioModuleRef.current) return;

    setStatus('processing');
    addLog('info', '🎤 Transcription en cours...');

    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const result: AsrResult = await audioModuleRef.current.transcribe(arrayBuffer);
      
      setDiagnostics(audioModuleRef.current.getDiagnostics());
      setStatus('ready');
      
      const text = result.text || '(Aucune parole détectée)';
      setTranscript(text);
      addLog('success', `✅ Transcription terminée`);
      addLog('info', `   Texte: "${text}"`);
      addLog('info', `   Langue: ${result.language || 'auto'} | Confiance: ${((result.confidence || 0) * 100).toFixed(0)}%`);
    } catch (err) {
      setStatus('ready');
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ Erreur ASR: ${msg}`);
    }
  }, [addLog]);

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    addLog('info', `📂 Fichier sélectionné: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    processAudio(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [addLog, processAudio]);

  const handleSpeak = useCallback(async () => {
    if (!audioModuleRef.current || !ttsText.trim()) return;

    setStatus('processing');
    addLog('info', `🔊 Synthèse vocale: "${ttsText.slice(0, 40)}${ttsText.length > 40 ? '...' : ''}"`);

    try {
      const result = await audioModuleRef.current.synthesize(ttsText);
      
      setDiagnostics(audioModuleRef.current.getDiagnostics());
      
      addLog('success', `✅ Audio généré !`);
      addLog('info', `   Durée: ${result.durationMs}ms | Sample rate: ${result.sampleRate}Hz`);
      
      if (result.audioBuffer.byteLength > 0) {
        const audioContext = new AudioContext();
        const audioBuffer = await audioContext.decodeAudioData(result.audioBuffer.slice(0));
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
        addLog('info', `   🔈 Lecture audio en cours...`);
        source.onended = () => {
          addLog('info', `   ✓ Lecture terminée`);
          setStatus('ready');
        };
      } else {
        addLog('warning', `   ⚠️ Mode démo: buffer vide (modèle WASM local non chargé)`);
        addLog('info', `   ℹ️ TTS local nécessite l'intégration d'un modèle WASM (ex: Piper, Coqui)`);
        setStatus('ready');
      }
    } catch (err) {
      setStatus('ready');
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ Erreur TTS: ${msg}`);
    }
  }, [addLog, ttsText]);

  const handleVAD = useCallback(async () => {
    if (!audioModuleRef.current) return;

    try {
      addLog('info', '🎙️ Demande accès microphone pour VAD...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const buffer = await blob.arrayBuffer();
        
        addLog('info', '👂 Analyse VAD...');
        const result = await audioModuleRef.current!.detectVoiceActivity(buffer);
        
        setDiagnostics(audioModuleRef.current!.getDiagnostics());
        setStatus('ready');
        
        addLog('success', `✅ VAD terminé`);
        addLog('info', `   Parole détectée: ${result.isSpeech ? '✓ OUI' : '✗ NON'}`);
        addLog('info', `   Confiance: ${(result.confidence * 100).toFixed(1)}%`);
      };

      setStatus('recording');
      addLog('info', '🔴 Enregistrement 2s pour VAD...');
      mediaRecorder.start();
      
      setTimeout(() => {
        mediaRecorder.stop();
        setStatus('processing');
      }, 2000);
    } catch (err) {
      setStatus('ready');
      const msg = err instanceof Error ? err.message : String(err);
      addLog('error', `❌ Erreur VAD: ${msg}`);
    }
  }, [addLog]);

  const handleTeardown = useCallback(async () => {
    if (!audioModuleRef.current) return;

    addLog('info', '🔄 Arrêt du module...');
    await audioModuleRef.current.teardown();
    audioModuleRef.current = null;
    setStatus('idle');
    setDiagnostics(null);
    setTranscript('');
    addLog('success', '✅ Module arrêté');
  }, [addLog]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const getStatusIcon = () => {
    switch (status) {
      case 'ready': return '🟢';
      case 'error': return '🔴';
      case 'recording': return '🔴';
      case 'initializing':
      case 'processing': return '🟡';
      default: return '⚪';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'idle': return 'Non initialisé';
      case 'initializing': return 'Initialisation...';
      case 'ready': return 'Prêt';
      case 'processing': return 'Traitement...';
      case 'recording': return 'Enregistrement...';
      case 'error': return 'Erreur';
      default: return status;
    }
  };

  const isReady = status === 'ready';
  const isRecording = status === 'recording';

  return (
    <div className="app">
      <header className="header">
        <h1>🎵 browser-ai Audio <span className="version">v1.1</span></h1>
        <p className="subtitle">ASR + VAD + TTS — 100% local, aucune donnée envoyée</p>
      </header>

      <div className="status-bar">
        <span className={`status-indicator ${isRecording ? 'recording-pulse' : ''}`}>
          {getStatusIcon()} {getStatusText()}
        </span>
        {error && <span className="error-text">— {error}</span>}
      </div>

      <div className="main-grid">
        <section className="card controls-card">
          <h2>🎛️ Contrôles</h2>
          
          {status === 'idle' ? (
            <button className="btn btn-primary btn-large" onClick={handleInit}>
              ▶️ Initialiser le module audio
            </button>
          ) : (
            <>
              <div className="section-title">🎤 Speech-to-Text (ASR)</div>
              <div className="button-row">
                {!isRecording ? (
                  <button
                    className="btn btn-record"
                    onClick={startRecording}
                    disabled={!isReady}
                  >
                    🎙️ Enregistrer
                  </button>
                ) : (
                  <button
                    className="btn btn-stop-record"
                    onClick={stopRecording}
                  >
                    ⏹️ Arrêter
                  </button>
                )}
                <button
                  className="btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!isReady}
                >
                  📂 Fichier audio
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </div>

              {transcript && (
                <div className="transcript-box">
                  <strong>Transcription :</strong>
                  <p>{transcript}</p>
                </div>
              )}

              <div className="section-title">🔊 Text-to-Speech (TTS)</div>
              <div className="tts-input">
                <textarea
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  placeholder="Entrez le texte à lire..."
                  rows={2}
                />
                <button
                  className="btn btn-speak"
                  onClick={handleSpeak}
                  disabled={!isReady || !ttsText.trim()}
                >
                  🔊 Lire le texte
                </button>
              </div>

              <div className="section-title">👂 Voice Activity Detection</div>
              <button
                className="btn"
                onClick={handleVAD}
                disabled={!isReady}
              >
                👂 Tester VAD (2s)
              </button>

              <div className="divider" />
              
              <button
                className="btn btn-danger"
                onClick={handleTeardown}
                disabled={status === 'processing' || isRecording}
              >
                ⏹️ Arrêter le module
              </button>
            </>
          )}
        </section>

        <section className="card logs-card">
          <div className="card-header">
            <h2>📋 Journal</h2>
            <button className="btn btn-small" onClick={clearLogs}>Effacer</button>
          </div>
          <div className="logs-container">
            {logs.length === 0 ? (
              <p className="logs-empty">Aucun log. Initialisez le module pour commencer.</p>
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
              {showDiagnostics ? 'Masquer' : 'Afficher'}
            </button>
          </div>
          {showDiagnostics && (
            <pre className="diagnostics-json">{JSON.stringify(diagnostics, null, 2)}</pre>
          )}
        </section>
      )}

      <footer className="footer">
        <div className="privacy-badge">
          🔒 <strong>100% Local</strong> — Aucune donnée audio n'est envoyée à un serveur.
        </div>
        <p className="footer-note">
          Mode démo : les modèles WASM locaux ne sont pas encore intégrés. L'API retourne des placeholders.
        </p>
      </footer>
    </div>
  );
}

export default App;
