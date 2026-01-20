/**
 * AudioModule implementation for browser-ai v1.1
 * CDC v2026.9 §9 — ASR + VAD + TTS (local-only)
 * 
 * Real implementation using:
 * - Whisper via @huggingface/transformers for ASR
 * - Silero VAD via ONNX Runtime for voice activity detection
 * - Web Speech API fallback for TTS (Piper WASM planned)
 */

import { createError, getGlobalRegistry, type UnifiedModelRegistry } from '@cohesiumai/core';
import type {
  AudioConfig,
  AsrResult,
  AsrSegment,
  VadResult,
  TtsResult,
  AudioModuleState,
  AudioDiagnostics,
  AudioBackend,
} from './types.js';

// Types for dynamic imports
type TransformersPipeline = (
  audio: Float32Array | ArrayBuffer,
  options?: { language?: string; task?: string; chunk_length_s?: number; return_timestamps?: boolean }
) => Promise<{ text: string; chunks?: Array<{ text: string; timestamp: [number, number] }> }>;

type OnnxSession = {
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array }>>;
};

export interface AudioModule {
  init(cfg: AudioConfig): Promise<void>;
  transcribe(input: Blob | ArrayBuffer): Promise<AsrResult>;
  /**
   * Stream transcription from microphone.
   * CDC v2026.9 §9.3 — Real-time ASR streaming
   */
  transcribeStream(onResult: (result: AsrResult, isFinal: boolean) => void): Promise<StreamController>;
  detectVoiceActivity(input: Blob | ArrayBuffer): Promise<VadResult>;
  synthesize(text: string): Promise<TtsResult>;
  getState(): AudioModuleState;
  getDiagnostics(): AudioDiagnostics;
  teardown(): Promise<void>;
}

export interface StreamController {
  stop(): void;
  pause(): void;
  resume(): void;
  isActive(): boolean;
}

interface AudioModuleInternals {
  config: AudioConfig | null;
  state: AudioModuleState;
  latencies: number[];
  asrPipeline: TransformersPipeline | null;
  vadSession: OnnxSession | null;
  vadState: { h: Float32Array; c: Float32Array } | null;
  registry: UnifiedModelRegistry;
  asrModelId: string | null;
  vadModelId: string | null;
}

// Whisper model mapping
const WHISPER_MODELS: Record<string, string> = {
  'default': 'Xenova/whisper-tiny',
  'whisper-tiny': 'Xenova/whisper-tiny',
  'whisper-base': 'Xenova/whisper-base',
};

// Silero VAD model URL
const SILERO_VAD_URL = 'https://huggingface.co/onnx-community/silero-vad/resolve/main/silero_vad.onnx';

/**
 * Decode audio buffer to Float32Array PCM at 16kHz.
 */
async function decodeAudioToPCM(input: Blob | ArrayBuffer): Promise<Float32Array> {
  const buffer = input instanceof Blob ? await input.arrayBuffer() : input;
  
  // Use AudioContext to decode
  const audioContext = new AudioContext({ sampleRate: 16000 });
  
  try {
    const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
    
    // Convert to mono Float32Array
    const channelData = audioBuffer.getChannelData(0);
    
    // Resample to 16kHz if needed
    if (audioBuffer.sampleRate !== 16000) {
      const ratio = audioBuffer.sampleRate / 16000;
      const newLength = Math.floor(channelData.length / ratio);
      const resampled = new Float32Array(newLength);
      
      for (let i = 0; i < newLength; i++) {
        const srcIdx = Math.floor(i * ratio);
        resampled[i] = channelData[srcIdx]!;
      }
      
      return resampled;
    }
    
    return channelData;
  } finally {
    await audioContext.close();
  }
}

/**
 * Create an AudioModule instance.
 * All processing is local-only (privacy-first).
 */
export function createAudioModule(): AudioModule {
  const internals: AudioModuleInternals = {
    config: null,
    state: {
      initialized: false,
      asrReady: false,
      vadReady: false,
      ttsReady: false,
      backend: 'wasm',
    },
    latencies: [],
    asrPipeline: null,
    vadSession: null,
    vadState: null,
    registry: getGlobalRegistry(),
    asrModelId: null,
    vadModelId: null,
  };

  function detectBackend(): AudioBackend {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      return 'webgpu';
    }
    return 'wasm';
  }

  function recordLatency(ms: number): void {
    internals.latencies.push(ms);
    if (internals.latencies.length > 100) {
      internals.latencies.shift();
    }
  }

  function getP95Latency(): number | undefined {
    if (internals.latencies.length === 0) return undefined;
    const sorted = [...internals.latencies].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.95);
    return sorted[idx];
  }

  async function init(cfg: AudioConfig): Promise<void> {
    if (cfg.privacyMode !== 'fully-local-managed') {
      throw createError(
        'ERROR_INVALID_CONFIG',
        'AudioModule requires privacyMode="fully-local-managed"',
        {
          userAction: 'Set privacyMode to "fully-local-managed"',
          recoverability: 'non-recoverable',
        }
      );
    }

    internals.config = cfg;
    internals.state.backend = detectBackend();

    // Initialize ASR with Whisper via Transformers.js (using UnifiedRegistry)
    if (cfg.asr?.enabled) {
      try {
        const modelId = WHISPER_MODELS[cfg.asr.model ?? 'default'] ?? WHISPER_MODELS['default']!;
        internals.asrModelId = modelId;
        
        // Use registry for shared model management
        internals.asrPipeline = await internals.registry.acquire(
          modelId,
          'transformers',
          async () => {
            console.log('[AudioModule] Loading Whisper ASR model via registry...');
            const transformers = await import('@huggingface/transformers');
            return transformers.pipeline(
              'automatic-speech-recognition',
              modelId,
              { device: internals.state.backend === 'webgpu' ? 'webgpu' : 'wasm' }
            );
          },
          { sizeEstimateMB: modelId.includes('base') ? 300 : 150 }
        ) as unknown as TransformersPipeline;
        
        internals.state.asrReady = true;
        console.log('[AudioModule] Whisper ASR ready (via registry)');
      } catch (err) {
        console.error('[AudioModule] ASR init failed:', err);
        throw createError(
          'ERROR_AUDIO_ASR_INIT_FAILED',
          'Failed to initialize Whisper ASR engine',
          {
            cause: err,
            userAction: 'Check browser compatibility and try again',
            devAction: 'Verify Transformers.js and Whisper model are accessible',
            recoverability: 'recoverable',
          }
        );
      }
    }

    // Initialize VAD with Silero ONNX (using UnifiedRegistry)
    if (cfg.vad?.enabled) {
      try {
        const vadModelId = 'silero-vad';
        internals.vadModelId = vadModelId;
        
        // Use registry for shared model management
        internals.vadSession = await internals.registry.acquire(
          vadModelId,
          'onnx',
          async () => {
            console.log('[AudioModule] Loading Silero VAD model via registry...');
            const ort = await import('onnxruntime-web');
            return ort.InferenceSession.create(SILERO_VAD_URL, {
              executionProviders: ['wasm'],
            });
          },
          { sizeEstimateMB: 10 }
        ) as unknown as OnnxSession;
        
        // Initialize hidden states for Silero VAD (2 layers, 64 units)
        internals.vadState = {
          h: new Float32Array(2 * 64).fill(0),
          c: new Float32Array(2 * 64).fill(0),
        };
        
        internals.state.vadReady = true;
        console.log('[AudioModule] Silero VAD ready (via registry)');
      } catch (err) {
        console.error('[AudioModule] VAD init failed:', err);
        throw createError(
          'ERROR_AUDIO_VAD_INIT_FAILED',
          'Failed to initialize Silero VAD engine',
          {
            cause: err,
            userAction: 'Check browser compatibility and try again',
            devAction: 'Verify ONNX Runtime and Silero model are accessible',
            recoverability: 'recoverable',
          }
        );
      }
    }

    // Initialize TTS - using Web Speech API as fallback (Piper WASM planned)
    if (cfg.tts?.enabled) {
      try {
        // Check Web Speech API availability
        if (typeof speechSynthesis === 'undefined') {
          throw new Error('Web Speech API not available');
        }
        
        // Wait for voices to load
        await new Promise<void>((resolve) => {
          if (speechSynthesis.getVoices().length > 0) {
            resolve();
          } else {
            speechSynthesis.onvoiceschanged = () => resolve();
            setTimeout(resolve, 1000); // Timeout fallback
          }
        });
        
        internals.state.ttsReady = true;
        console.log('[AudioModule] TTS ready (Web Speech API)');
      } catch (err) {
        console.error('[AudioModule] TTS init failed:', err);
        throw createError(
          'ERROR_AUDIO_TTS_INIT_FAILED',
          'Failed to initialize TTS engine',
          {
            cause: err,
            userAction: 'Check browser compatibility and try again',
            devAction: 'Verify Web Speech API is available',
            recoverability: 'recoverable',
          }
        );
      }
    }

    internals.state.initialized = true;
    console.log('[AudioModule] Initialization complete');
  }

  async function transcribe(input: Blob | ArrayBuffer): Promise<AsrResult> {
    if (!internals.state.initialized || !internals.state.asrReady || !internals.asrPipeline) {
      throw createError(
        'ERROR_INVALID_STATE',
        'ASR not initialized. Call init() with asr.enabled=true first.',
        {
          userAction: 'Initialize the audio module with ASR enabled',
          recoverability: 'non-recoverable',
        }
      );
    }

    const startMs = performance.now();

    try {
      // Decode audio to PCM
      const pcm = await decodeAudioToPCM(input);
      const durationMs = (pcm.length / 16000) * 1000;
      
      // Run Whisper inference
      const output = await internals.asrPipeline(pcm, {
        language: internals.config?.asr?.language,
        task: 'transcribe',
        return_timestamps: true,
      });
      
      // Build segments from chunks
      const segments: AsrSegment[] = output.chunks?.map((chunk) => ({
        startMs: chunk.timestamp[0] * 1000,
        endMs: chunk.timestamp[1] * 1000,
        text: chunk.text,
      })) ?? [];
      
      const result: AsrResult = {
        text: output.text,
        segments,
        language: internals.config?.asr?.language ?? 'en',
        durationMs,
      };

      const latency = performance.now() - startMs;
      recordLatency(latency);
      
      console.log(`[AudioModule] Transcription complete in ${Math.round(latency)}ms`);
      return result;
    } catch (err) {
      throw createError(
        'ERROR_AUDIO_ASR_INIT_FAILED',
        'Transcription failed',
        {
          cause: err,
          recoverability: 'recoverable',
        }
      );
    }
  }

  async function detectVoiceActivity(input: Blob | ArrayBuffer): Promise<VadResult> {
    if (!internals.state.initialized || !internals.state.vadReady || !internals.vadSession) {
      throw createError(
        'ERROR_INVALID_STATE',
        'VAD not initialized. Call init() with vad.enabled=true first.',
        {
          userAction: 'Initialize the audio module with VAD enabled',
          recoverability: 'non-recoverable',
        }
      );
    }

    const startMs = performance.now();

    try {
      const ort = await import('onnxruntime-web');
      
      // Decode audio to PCM
      const pcm = await decodeAudioToPCM(input);
      
      // Silero VAD expects 512 samples at 16kHz (32ms chunks)
      const chunkSize = 512;
      const sensitivity = internals.config?.vad?.sensitivity ?? 0.5;
      const threshold = 0.5 + (1 - sensitivity) * 0.4; // Map sensitivity to threshold
      
      let maxProbability = 0;
      let speechStartMs: number | undefined;
      let speechEndMs: number | undefined;
      
      // Process audio in chunks
      for (let i = 0; i + chunkSize <= pcm.length; i += chunkSize) {
        const chunk = pcm.slice(i, i + chunkSize);
        
        // Run VAD inference
        const feeds = {
          input: new ort.Tensor('float32', chunk, [1, chunk.length]),
          sr: new ort.Tensor('int64', BigInt64Array.from([BigInt(16000)]), []),
          h: new ort.Tensor('float32', internals.vadState!.h, [2, 1, 64]),
          c: new ort.Tensor('float32', internals.vadState!.c, [2, 1, 64]),
        };
        
        const results = await internals.vadSession.run(feeds);
        
        // Update hidden states
        if (results['hn']) internals.vadState!.h = results['hn'].data;
        if (results['cn']) internals.vadState!.c = results['cn'].data;
        
        // Get speech probability
        const probability = results['output']?.data[0] ?? 0;
        maxProbability = Math.max(maxProbability, probability);
        
        const timeMs = (i / 16000) * 1000;
        
        if (probability > threshold) {
          if (speechStartMs === undefined) {
            speechStartMs = timeMs;
          }
          speechEndMs = timeMs + (chunkSize / 16000) * 1000;
        }
      }
      
      const result: VadResult = {
        isSpeech: maxProbability > threshold,
        confidence: maxProbability,
        speechStartMs,
        speechEndMs,
      };

      const latency = performance.now() - startMs;
      recordLatency(latency);
      
      return result;
    } catch (err) {
      throw createError(
        'ERROR_AUDIO_VAD_INIT_FAILED',
        'Voice activity detection failed',
        {
          cause: err,
          recoverability: 'recoverable',
        }
      );
    }
  }

  async function synthesize(text: string): Promise<TtsResult> {
    if (!internals.state.initialized || !internals.state.ttsReady) {
      throw createError(
        'ERROR_INVALID_STATE',
        'TTS not initialized. Call init() with tts.enabled=true first.',
        {
          userAction: 'Initialize the audio module with TTS enabled',
          recoverability: 'non-recoverable',
        }
      );
    }

    if (!text || text.trim().length === 0) {
      throw createError(
        'ERROR_INVALID_CONFIG',
        'Text for synthesis cannot be empty',
        {
          userAction: 'Provide non-empty text to synthesize',
          recoverability: 'non-recoverable',
        }
      );
    }

    const startMs = performance.now();

    try {
      // Use Web Speech API for now (Piper WASM planned for future)
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Apply config
      if (internals.config?.tts?.speed) {
        utterance.rate = internals.config.tts.speed;
      }
      if (internals.config?.tts?.pitch) {
        utterance.pitch = internals.config.tts.pitch;
      }
      
      // Find requested voice
      const voices = speechSynthesis.getVoices();
      const requestedVoice = internals.config?.tts?.voice;
      if (requestedVoice) {
        const voice = voices.find(v => 
          v.name.toLowerCase().includes(requestedVoice.toLowerCase())
        );
        if (voice) utterance.voice = voice;
      }
      
      // Capture audio using AudioContext + MediaStreamDestination
      // Note: This is a workaround since Web Speech API doesn't provide raw audio
      // For production, Piper WASM would provide direct audio buffer output
      
      const durationMs = await new Promise<number>((resolve, reject) => {
        const speakStart = performance.now();
        
        utterance.onend = () => {
          resolve(performance.now() - speakStart);
        };
        
        utterance.onerror = (e) => {
          reject(new Error(`TTS error: ${e.error}`));
        };
        
        speechSynthesis.speak(utterance);
      });
      
      // Web Speech API doesn't provide raw audio buffer
      // Return empty buffer with duration info (for Piper WASM migration)
      const result: TtsResult = {
        audioBuffer: new ArrayBuffer(0),
        durationMs,
        sampleRate: 22050,
        channels: 1,
      };

      const latency = performance.now() - startMs;
      recordLatency(latency);
      
      console.log(`[AudioModule] TTS complete in ${Math.round(latency)}ms`);
      return result;
    } catch (err) {
      throw createError(
        'ERROR_AUDIO_TTS_INIT_FAILED',
        'Text-to-speech synthesis failed',
        {
          cause: err,
          recoverability: 'recoverable',
        }
      );
    }
  }

  /**
   * Stream transcription from microphone in real-time.
   * CDC v2026.9 §9.3
   */
  async function transcribeStream(
    onResult: (result: AsrResult, isFinal: boolean) => void
  ): Promise<StreamController> {
    if (!internals.state.initialized || !internals.state.asrReady || !internals.asrPipeline) {
      throw createError(
        'ERROR_INVALID_STATE',
        'ASR not initialized. Call init() with asr.enabled=true first.',
        {
          userAction: 'Initialize the audio module with ASR enabled',
          recoverability: 'non-recoverable',
        }
      );
    }

    // Request microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    
    // Use ScriptProcessorNode for audio capture (AudioWorklet preferred for production)
    const bufferSize = 4096;
    const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    
    let isActive = true;
    let isPaused = false;
    let audioChunks: Float32Array[] = [];
    let silenceCounter = 0;
    const silenceThreshold = 0.01;
    const maxSilenceChunks = 10; // ~0.5s of silence triggers processing
    
    processor.onaudioprocess = async (event) => {
      if (!isActive || isPaused) return;
      
      const inputData = event.inputBuffer.getChannelData(0);
      const chunk = new Float32Array(inputData);
      
      // Check for silence
      const rms = Math.sqrt(chunk.reduce((acc, v) => acc + v * v, 0) / chunk.length);
      
      if (rms < silenceThreshold) {
        silenceCounter++;
        
        // After silence, process accumulated audio
        if (silenceCounter >= maxSilenceChunks && audioChunks.length > 0) {
          const totalLength = audioChunks.reduce((acc, c) => acc + c.length, 0);
          const combined = new Float32Array(totalLength);
          let offset = 0;
          for (const c of audioChunks) {
            combined.set(c, offset);
            offset += c.length;
          }
          
          // Transcribe accumulated audio
          try {
            const output = await internals.asrPipeline!(combined, {
              language: internals.config?.asr?.language,
              task: 'transcribe',
              return_timestamps: true,
            });
            
            const segments: AsrSegment[] = output.chunks?.map((c) => ({
              startMs: c.timestamp[0] * 1000,
              endMs: c.timestamp[1] * 1000,
              text: c.text,
            })) ?? [];
            
            onResult({
              text: output.text,
              segments,
              language: internals.config?.asr?.language ?? 'en',
              durationMs: (combined.length / 16000) * 1000,
            }, true);
          } catch (err) {
            console.error('[AudioModule] Stream transcription error:', err);
          }
          
          audioChunks = [];
          silenceCounter = 0;
        }
      } else {
        silenceCounter = 0;
        audioChunks.push(chunk);
        
        // Emit interim result periodically
        if (audioChunks.length % 5 === 0) {
          onResult({
            text: '...',
            language: internals.config?.asr?.language ?? 'en',
          }, false);
        }
      }
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    const controller: StreamController = {
      stop: () => {
        isActive = false;
        processor.disconnect();
        source.disconnect();
        stream.getTracks().forEach(track => track.stop());
        audioContext.close();
        console.log('[AudioModule] Stream stopped');
      },
      pause: () => {
        isPaused = true;
      },
      resume: () => {
        isPaused = false;
      },
      isActive: () => isActive && !isPaused,
    };
    
    console.log('[AudioModule] Stream started');
    return controller;
  }

  function getState(): AudioModuleState {
    return { ...internals.state };
  }

  function getDiagnostics(): AudioDiagnostics {
    const cfg = internals.config;
    return {
      enabled: internals.state.initialized,
      asr: cfg?.asr?.enabled
        ? {
            model: cfg.asr.model ?? 'default',
            backend: internals.state.backend,
            lastLatencyMs: internals.latencies[internals.latencies.length - 1],
          }
        : undefined,
      tts: cfg?.tts?.enabled
        ? {
            voice: cfg.tts.voice ?? 'default',
            backend: 'wasm',
            lastLatencyMs: internals.latencies[internals.latencies.length - 1],
          }
        : undefined,
      vad: cfg?.vad?.enabled
        ? {
            enabled: true,
            sensitivity: cfg.vad.sensitivity ?? 0.5,
          }
        : undefined,
      latencyP95Ms: getP95Latency(),
    };
  }

  async function teardown(): Promise<void> {
    // Stop any ongoing speech
    if (typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel();
    }
    
    // Release models from registry (decrements refCount, triggers idle timer)
    if (internals.asrModelId) {
      internals.registry.release(internals.asrModelId);
      internals.asrModelId = null;
    }
    if (internals.vadModelId) {
      internals.registry.release(internals.vadModelId);
      internals.vadModelId = null;
    }
    
    // Clear local references
    internals.asrPipeline = null;
    internals.vadSession = null;
    internals.vadState = null;
    internals.config = null;
    internals.state = {
      initialized: false,
      asrReady: false,
      vadReady: false,
      ttsReady: false,
      backend: 'wasm',
    };
    internals.latencies = [];
    
    console.log('[AudioModule] Teardown complete (models released to registry)');
  }

  return {
    init,
    transcribe,
    transcribeStream,
    detectVoiceActivity,
    synthesize,
    getState,
    getDiagnostics,
    teardown,
  };
}
