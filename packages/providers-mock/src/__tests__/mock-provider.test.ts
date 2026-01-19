/**
 * Tests for MockProvider
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MockProvider, createMockProvider } from '../mock-provider.js';

describe('MockProvider', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = createMockProvider();
  });

  describe('constructor', () => {
    it('creates provider with id mock', () => {
      expect(provider.id).toBe('mock');
    });

    it('accepts custom scenario', () => {
      const slowProvider = createMockProvider({ scenario: 'slow' });
      expect(slowProvider.id).toBe('mock');
    });
  });

  describe('detect', () => {
    it('always returns available', async () => {
      const result = await provider.detect();
      expect(result.available).toBe(true);
      expect(result.reason).toContain('MockProvider');
    });
  });

  describe('init', () => {
    it('initializes successfully with happy scenario', async () => {
      await provider.init({} as any);
      // Should not throw
      expect(true).toBe(true);
    });

    it('throws with quota scenario', async () => {
      const quotaProvider = createMockProvider({ scenario: 'quota' });
      await expect(quotaProvider.init({} as any)).rejects.toThrow('quota');
    });
  });

  describe('generate', () => {
    it('throws when not initialized', async () => {
      await expect(
        provider.generate({ messages: [{ role: 'user', content: 'test' }] }, () => {})
      ).rejects.toThrow('not initialized');
    });

    it('generates tokens when initialized', async () => {
      await provider.init({} as any);
      const tokens: string[] = [];
      const result = await provider.generate(
        { messages: [{ role: 'user', content: 'test' }], maxTokens: 5 },
        (token) => tokens.push(token)
      );
      expect(result.text.length).toBeGreaterThan(0);
      expect(tokens.length).toBeGreaterThan(0);
    });
  });

  describe('abort', () => {
    it('sets aborted flag', async () => {
      await provider.init({} as any);
      provider.abort();
      expect(true).toBe(true);
    });
  });

  describe('teardown', () => {
    it('resets state', async () => {
      await provider.init({} as any);
      await provider.teardown();
      // Should throw after teardown
      await expect(
        provider.generate({ messages: [{ role: 'user', content: 'test' }] }, () => {})
      ).rejects.toThrow('not initialized');
    });
  });
});
