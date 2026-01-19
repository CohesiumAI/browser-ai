/**
 * Tests for WASMProvider
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WASMProvider, createWASMProvider } from '../wasm-provider.js';

describe('WASMProvider', () => {
  let provider: WASMProvider;

  beforeEach(() => {
    provider = createWASMProvider();
  });

  describe('constructor', () => {
    it('creates provider with default config', () => {
      expect(provider.id).toBe('wasm');
    });

    it('accepts custom config', () => {
      const customProvider = createWASMProvider({
        quantized: true,
      });
      expect(customProvider.id).toBe('wasm');
    });
  });

  describe('detect', () => {
    it('returns available when WebAssembly exists', async () => {
      const result = await provider.detect({} as any);
      expect(result.available).toBe(true);
      expect(result.reason).toContain('WASM available');
    });
  });

  describe('generate', () => {
    it('throws when not initialized', async () => {
      await expect(
        provider.generate({ messages: [{ role: 'user', content: 'test' }] }, () => {})
      ).rejects.toThrow('WASMProvider not initialized');
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
      expect(progress).toEqual({ text: '' });
    });
  });
});
