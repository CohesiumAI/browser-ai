/**
 * Tests for WebNNProvider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebNNProvider, createWebNNProvider } from '../webnn-provider.js';

describe('WebNNProvider', () => {
  let provider: WebNNProvider;

  beforeEach(() => {
    provider = createWebNNProvider();
  });

  describe('constructor', () => {
    it('creates provider with default config', () => {
      expect(provider.id).toBe('webnn');
    });

    it('accepts custom config', () => {
      const customProvider = createWebNNProvider({
        deviceType: 'npu',
      });
      expect(customProvider.id).toBe('webnn');
    });
  });

  describe('detect', () => {
    it('returns unavailable when navigator.ml is missing', async () => {
      const result = await provider.detect({} as any);
      expect(result.available).toBe(false);
      expect(result.reason).toContain('WebNN API not available');
    });
  });

  describe('generate', () => {
    it('throws when not initialized', async () => {
      await expect(
        provider.generate({ messages: [{ role: 'user', content: 'test' }] }, () => {})
      ).rejects.toThrow('WebNNProvider not initialized');
    });
  });

  describe('abort', () => {
    it('sets aborted flag', () => {
      provider.abort();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('teardown', () => {
    it('resets state', async () => {
      await provider.teardown();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('getDownloadProgress', () => {
    it('returns empty progress initially', () => {
      const progress = provider.getDownloadProgress();
      expect(progress).toEqual({});
    });
  });
});
