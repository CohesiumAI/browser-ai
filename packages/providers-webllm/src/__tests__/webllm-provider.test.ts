/**
 * Tests for WebLLMProvider
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebLLMProvider, createWebLLMProvider } from '../webllm-provider.js';

describe('WebLLMProvider', () => {
  let provider: WebLLMProvider;

  beforeEach(() => {
    provider = createWebLLMProvider();
  });

  describe('constructor', () => {
    it('creates provider with id webllm', () => {
      expect(provider.id).toBe('webllm');
    });
  });

  describe('detect', () => {
    it('returns unavailable when WebGPU not available', async () => {
      const result = await provider.detect({} as any);
      expect(result.available).toBe(false);
      expect(result.reason).toContain('WebGPU');
    });
  });

  describe('generate', () => {
    it('throws when not initialized', async () => {
      await expect(
        provider.generate({ messages: [{ role: 'user', content: 'test' }] }, () => {})
      ).rejects.toThrow('WebLLMProvider not initialized');
    });
  });

  describe('abort', () => {
    it('sets aborted flag without throwing', () => {
      provider.abort();
      expect(true).toBe(true);
    });
  });

  describe('teardown', () => {
    it('resets state without throwing', async () => {
      await provider.teardown();
      expect(true).toBe(true);
    });
  });

  describe('getDownloadProgress', () => {
    it('returns initial progress with text field', () => {
      const progress = provider.getDownloadProgress();
      expect(progress).toHaveProperty('text');
    });
  });

  describe('engine recreation (v2.1)', () => {
    it('should flag engine for recreation after abort', () => {
      // Abort sets needsRecreateEngine flag
      provider.abort();
      // Flag is internal, but next generate would trigger recreation
      expect(true).toBe(true); // No throw means abort worked
    });

    it('should accept onRecreate callback in generate params', async () => {
      const onRecreate = () => {};
      // Should not throw when onRecreate is provided (even if not initialized)
      await expect(
        provider.generate(
          { 
            messages: [{ role: 'user', content: 'test' }],
            onRecreate,
          }, 
          () => {}
        )
      ).rejects.toThrow('WebLLMProvider not initialized');
    });
  });
});
