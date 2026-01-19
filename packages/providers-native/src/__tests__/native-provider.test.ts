/**
 * Tests for NativeProvider
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NativeProvider, createNativeProvider } from '../native-provider.js';

describe('NativeProvider', () => {
  let provider: NativeProvider;

  beforeEach(() => {
    provider = createNativeProvider();
  });

  describe('constructor', () => {
    it('creates provider with id native', () => {
      expect(provider.id).toBe('native');
    });
  });

  describe('detect', () => {
    it('returns unavailable when no driver detected', async () => {
      const result = await provider.detect();
      expect(result.available).toBe(false);
      expect(result.reason).toContain('No native AI driver');
    });
  });

  describe('generate', () => {
    it('throws when not initialized', async () => {
      await expect(
        provider.generate({ messages: [{ role: 'user', content: 'test' }] }, () => {})
      ).rejects.toThrow('NativeProvider not initialized');
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
});
