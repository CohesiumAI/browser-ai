/**
 * Audio module types for browser-ai v1.1
 * CDC v2026.9 §9.2
 */

export type AudioProviderId = 'asr' | 'vad' | 'tts';

export type AudioBackend = 'wasm' | 'webgpu';

export interface AudioConfig {
  privacyMode: 'fully-local-managed';
  asr?: {
    enabled: boolean;
    model?: 'default' | 'whisper-tiny' | 'whisper-base';
    language?: string;
  };
  vad?: {
    enabled: boolean;
    sensitivity?: number;
  };
  tts?: {
    enabled: boolean;
    voice?: string;
    speed?: number;
    pitch?: number;
  };
}

export interface AsrSegment {
  startMs: number;
  endMs: number;
  text: string;
  confidence?: number;
}

export interface AsrResult {
  text: string;
  segments?: AsrSegment[];
  language?: string;
  durationMs?: number;
  confidence?: number;
}

export interface VadResult {
  isSpeech: boolean;
  confidence: number;
  speechStartMs?: number;
  speechEndMs?: number;
}

export interface TtsResult {
  audioBuffer: ArrayBuffer;
  durationMs: number;
  sampleRate: number;
  channels: 1 | 2;
}

export interface AudioModuleState {
  initialized: boolean;
  asrReady: boolean;
  vadReady: boolean;
  ttsReady: boolean;
  backend: AudioBackend;
}

export interface AudioDiagnostics {
  enabled: boolean;
  asr?: {
    model?: string;
    backend?: AudioBackend;
    lastLatencyMs?: number;
  };
  tts?: {
    voice?: string;
    backend?: 'wasm';
    lastLatencyMs?: number;
  };
  vad?: {
    enabled: boolean;
    sensitivity?: number;
  };
  latencyP95Ms?: number;
}
