/**
 * VLM Module unit tests
 * @browser-ai/modules-vlm v2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createVlmModule, detectTier } from '../vlm-module.js';
import type { VlmModule, VlmConfig } from '../types.js';

vi.mock('@huggingface/transformers', () => {
  return {
    pipeline: async () => {
      return async () => {
        return [{ generated_text: 'mock-caption' }];
      };
    },
  };
});

// Mock navigator for tier detection tests
const mockNavigator = (cores: number, mobile: boolean) => {
  vi.stubGlobal('navigator', {
    hardwareConcurrency: cores,
    userAgent: mobile ? 'Mozilla/5.0 (Linux; Android 10)' : 'Mozilla/5.0 (Windows NT 10.0)',
    gpu: {}, // Mock WebGPU availability
  });
};

describe('VlmModule', () => {
  let vlmModule: VlmModule;

  const validConfig: VlmConfig = {
    privacyMode: 'fully-local-managed',
    requireTier3: false, // Allow testing on any tier
  };

  beforeEach(() => {
    mockNavigator(8, false); // Tier 3 device
    vlmModule = createVlmModule();
  });

  afterEach(async () => {
    await vlmModule.teardown();
    vi.unstubAllGlobals();
  });

  describe('detectTier()', () => {
    it('should return tier 1 for mobile devices', () => {
      mockNavigator(4, true);
      expect(detectTier()).toBe(1);
    });

    it('should return tier 2 for desktop with < 8 cores', () => {
      mockNavigator(4, false);
      expect(detectTier()).toBe(2);
    });

    it('should return tier 3 for desktop with >= 8 cores', () => {
      mockNavigator(8, false);
      expect(detectTier()).toBe(3);
    });

    it('should return tier 3 for high-core desktop', () => {
      mockNavigator(16, false);
      expect(detectTier()).toBe(3);
    });
  });

  describe('init()', () => {
    it('should initialize on tier 3 device', async () => {
      mockNavigator(8, false);
      await vlmModule.init({ ...validConfig, requireTier3: true });
      
      const state = vlmModule.getState();
      expect(state.initialized).toBe(true);
      expect(state.deviceTier).toBe(3);
    });

    it('should initialize with requireTier3=false on any tier', async () => {
      mockNavigator(4, false);
      vlmModule = createVlmModule();
      await vlmModule.init({ ...validConfig, requireTier3: false });
      
      const state = vlmModule.getState();
      expect(state.initialized).toBe(true);
    });

    it('should reject tier 2 device when requireTier3=true', async () => {
      mockNavigator(4, false);
      vlmModule = createVlmModule();
      
      await expect(vlmModule.init({
        privacyMode: 'fully-local-managed',
        requireTier3: true,
      })).rejects.toMatchObject({
        code: 'ERROR_VLM_TIER_NOT_SUPPORTED',
      });
    });

    it('should reject mobile device when requireTier3=true', async () => {
      mockNavigator(4, true);
      vlmModule = createVlmModule();
      
      await expect(vlmModule.init({
        privacyMode: 'fully-local-managed',
        requireTier3: true,
      })).rejects.toMatchObject({
        code: 'ERROR_VLM_TIER_NOT_SUPPORTED',
      });
    });

    it('should reject non-local privacy mode', async () => {
      const invalidConfig = { privacyMode: 'any' } as VlmConfig;
      
      await expect(vlmModule.init(invalidConfig)).rejects.toMatchObject({
        code: 'ERROR_VLM_INIT_FAILED',
      });
    });

    it('should reject when WebGPU is unavailable', async () => {
      vi.stubGlobal('navigator', {
        hardwareConcurrency: 8,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
        // No gpu property
      });
      vlmModule = createVlmModule();
      
      await expect(vlmModule.init(validConfig)).rejects.toMatchObject({
        code: 'ERROR_VLM_INIT_FAILED',
      });
    });
  });

  describe('describeImage()', () => {
    beforeEach(async () => {
      await vlmModule.init(validConfig);
    });

    it('should process image ArrayBuffer', async () => {
      const imageBuffer = new ArrayBuffer(1000);
      const result = await vlmModule.describeImage(imageBuffer);
      
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should process image Blob', async () => {
      const blob = new Blob([new ArrayBuffer(500)], { type: 'image/png' });
      const result = await vlmModule.describeImage(blob);
      
      expect(result.text).toBeDefined();
    });

    it('should throw if not initialized', async () => {
      const uninitializedModule = createVlmModule();
      const imageBuffer = new ArrayBuffer(100);
      
      await expect(uninitializedModule.describeImage(imageBuffer)).rejects.toMatchObject({
        code: 'ERROR_VLM_INIT_FAILED',
      });
    });
  });

  describe('chatWithImage()', () => {
    beforeEach(async () => {
      await vlmModule.init(validConfig);
    });

    it('should process image with prompt', async () => {
      const imageBuffer = new ArrayBuffer(1000);
      const result = await vlmModule.chatWithImage({
        image: imageBuffer,
        prompt: 'What is in this image?',
      });
      
      expect(result.text).toBeDefined();
      expect(result.text).toContain('Based on the image:');
    });

    it('should throw if not initialized', async () => {
      const uninitializedModule = createVlmModule();
      
      await expect(uninitializedModule.chatWithImage({
        image: new ArrayBuffer(100),
        prompt: 'Test',
      })).rejects.toMatchObject({
        code: 'ERROR_VLM_INIT_FAILED',
      });
    });
  });

  describe('getDiagnostics()', () => {
    it('should return diagnostics after init', async () => {
      await vlmModule.init(validConfig);
      
      const diagnostics = vlmModule.getDiagnostics();
      expect(diagnostics.enabled).toBe(true);
      expect(diagnostics.backend).toBe('webgpu');
      expect(diagnostics.deviceTier).toBe(3);
    });

    it('should track images processed', async () => {
      await vlmModule.init(validConfig);
      
      await vlmModule.describeImage(new ArrayBuffer(100));
      await vlmModule.describeImage(new ArrayBuffer(100));
      
      const diagnostics = vlmModule.getDiagnostics();
      expect(diagnostics.imagesProcessed).toBe(2);
    });
  });

  describe('teardown()', () => {
    it('should reset state after teardown', async () => {
      await vlmModule.init(validConfig);
      await vlmModule.teardown();
      
      const state = vlmModule.getState();
      expect(state.initialized).toBe(false);
      expect(state.modelLoaded).toBe(false);
    });
  });
});
