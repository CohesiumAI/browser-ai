/**
 * Tests for AudioModule v1.1
 * CDC v2026.9 §9 + §15
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createAudioModule, type AudioModule } from '../audio-module.js';
import type { AudioConfig } from '../types.js';

vi.mock('@huggingface/transformers', () => {
  return {
    pipeline: async () => {
      return async () => {
        return {
          text: 'hello',
          chunks: [{ text: 'hello', timestamp: [0, 1] }],
        };
      };
    },
  };
});

vi.mock('onnxruntime-web', () => {
  class Tensor {
    constructor(
      public type: string,
      public data: unknown,
      public dims: number[]
    ) {}
  }

  const InferenceSession = {
    create: async () => {
      return {
        run: async () => {
          return {
            output: { data: new Float32Array([0.95]) },
            hn: { data: new Float32Array(2 * 64) },
            cn: { data: new Float32Array(2 * 64) },
          };
        },
      };
    },
  };

  return { Tensor, InferenceSession };
});

const makeSpeechSynthesis = () => {
  const synth: any = {
    onvoiceschanged: null,
    getVoices: () => [{ name: 'neutral' }],
    speak: (utterance: any) => {
      setTimeout(() => utterance.onend?.(), 0);
    },
    cancel: () => {},
  };
  return synth;
};

class MockAudioContext {
  sampleRate: number;
  constructor(opts: { sampleRate: number }) {
    this.sampleRate = opts.sampleRate;
  }
  async decodeAudioData(): Promise<any> {
    return {
      sampleRate: 16000,
      getChannelData: () => new Float32Array(16000),
    };
  }
  async close(): Promise<void> {}
}

class MockSpeechSynthesisUtterance {
  text: string;
  rate: number = 1;
  pitch: number = 1;
  voice: any;
  onend: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

describe('AudioModule', () => {
  let audioModule: AudioModule;

  beforeEach(() => {
    vi.stubGlobal('speechSynthesis', makeSpeechSynthesis());
    vi.stubGlobal('SpeechSynthesisUtterance', MockSpeechSynthesisUtterance as any);
    vi.stubGlobal('AudioContext', MockAudioContext as any);

    audioModule = createAudioModule();
  });

  describe('init', () => {
    it('should initialize with valid config', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        asr: { enabled: true },
        vad: { enabled: true },
        tts: { enabled: true },
      };

      await audioModule.init(config);
      const state = audioModule.getState();

      expect(state.initialized).toBe(true);
      expect(state.asrReady).toBe(true);
      expect(state.vadReady).toBe(true);
      expect(state.ttsReady).toBe(true);
    });

    it('should reject non-local privacy mode', async () => {
      const config = {
        privacyMode: 'any' as const,
        asr: { enabled: true },
      };

      await expect(audioModule.init(config as AudioConfig)).rejects.toMatchObject({
        code: 'ERROR_INVALID_CONFIG',
      });
    });

    it('should initialize only enabled features', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        asr: { enabled: true },
        vad: { enabled: false },
        tts: { enabled: false },
      };

      await audioModule.init(config);
      const state = audioModule.getState();

      expect(state.initialized).toBe(true);
      expect(state.asrReady).toBe(true);
      expect(state.vadReady).toBe(false);
      expect(state.ttsReady).toBe(false);
    });

    it('should detect backend (wasm or webgpu)', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        asr: { enabled: true },
      };

      await audioModule.init(config);
      const state = audioModule.getState();

      expect(['wasm', 'webgpu']).toContain(state.backend);
    });
  });

  describe('transcribe', () => {
    it('should throw if ASR not initialized', async () => {
      const buffer = new ArrayBuffer(100);

      await expect(audioModule.transcribe(buffer)).rejects.toMatchObject({
        code: 'ERROR_INVALID_STATE',
      });
    });

    it('should transcribe with initialized ASR', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        asr: { enabled: true, language: 'en' },
      };

      await audioModule.init(config);
      const buffer = new ArrayBuffer(100);
      const result = await audioModule.transcribe(buffer);

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('language', 'en');
    });

    it('should accept Blob input', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        asr: { enabled: true },
      };

      await audioModule.init(config);
      const blob = new Blob([new ArrayBuffer(100)], { type: 'audio/wav' });
      const result = await audioModule.transcribe(blob);

      expect(result).toHaveProperty('text');
    });
  });

  describe('detectVoiceActivity', () => {
    it('should throw if VAD not initialized', async () => {
      const buffer = new ArrayBuffer(100);

      await expect(audioModule.detectVoiceActivity(buffer)).rejects.toMatchObject({
        code: 'ERROR_INVALID_STATE',
      });
    });

    it('should detect voice activity with initialized VAD', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        vad: { enabled: true, sensitivity: 0.5 },
      };

      await audioModule.init(config);
      const buffer = new ArrayBuffer(100);
      const result = await audioModule.detectVoiceActivity(buffer);

      expect(result).toHaveProperty('isSpeech');
      expect(result).toHaveProperty('confidence');
      expect(typeof result.confidence).toBe('number');
    });
  });

  describe('synthesize', () => {
    it('should throw if TTS not initialized', async () => {
      await expect(audioModule.synthesize('Hello')).rejects.toMatchObject({
        code: 'ERROR_INVALID_STATE',
      });
    });

    it('should throw on empty text', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        tts: { enabled: true },
      };

      await audioModule.init(config);

      await expect(audioModule.synthesize('')).rejects.toMatchObject({
        code: 'ERROR_INVALID_CONFIG',
      });
    });

    it('should synthesize with initialized TTS', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        tts: { enabled: true, voice: 'neutral' },
      };

      await audioModule.init(config);
      const result = await audioModule.synthesize('Hello world');

      expect(result).toHaveProperty('audioBuffer');
      expect(result).toHaveProperty('durationMs');
      expect(result).toHaveProperty('sampleRate');
      expect(result).toHaveProperty('channels');
    });
  });

  describe('getDiagnostics', () => {
    it('should return diagnostics after init', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        asr: { enabled: true, model: 'whisper-tiny' },
        tts: { enabled: true, voice: 'neutral' },
        vad: { enabled: true, sensitivity: 0.7 },
      };

      await audioModule.init(config);
      const diag = audioModule.getDiagnostics();

      expect(diag.enabled).toBe(true);
      expect(diag.asr?.model).toBe('whisper-tiny');
      expect(diag.tts?.voice).toBe('neutral');
      expect(diag.vad?.sensitivity).toBe(0.7);
    });

    it('should return empty diagnostics before init', () => {
      const diag = audioModule.getDiagnostics();

      expect(diag.enabled).toBe(false);
      expect(diag.asr).toBeUndefined();
      expect(diag.tts).toBeUndefined();
      expect(diag.vad).toBeUndefined();
    });
  });

  describe('teardown', () => {
    it('should reset state after teardown', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        asr: { enabled: true },
        tts: { enabled: true },
      };

      await audioModule.init(config);
      expect(audioModule.getState().initialized).toBe(true);

      await audioModule.teardown();
      const state = audioModule.getState();

      expect(state.initialized).toBe(false);
      expect(state.asrReady).toBe(false);
      expect(state.ttsReady).toBe(false);
    });

    it('should allow re-init after teardown', async () => {
      const config: AudioConfig = {
        privacyMode: 'fully-local-managed',
        asr: { enabled: true },
      };

      await audioModule.init(config);
      await audioModule.teardown();
      await audioModule.init(config);

      expect(audioModule.getState().initialized).toBe(true);
    });
  });
});
