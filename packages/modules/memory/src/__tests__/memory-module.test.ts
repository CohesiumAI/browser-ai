/**
 * Memory Module unit tests
 * @cohesiumai/modules-memory v1.3
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createMemoryModule } from '../memory-module.js';
import type { MemoryModule, MemoryConfig, Turn } from '../types.js';

describe('MemoryModule', () => {
  let memoryModule: MemoryModule;

  const validConfig: MemoryConfig = {
    privacyMode: 'fully-local-managed',
    conversationId: 'test-conversation-1',
    maxTurns: 10,
    summaryEveryTurns: 5,
  };

  beforeEach(() => {
    memoryModule = createMemoryModule();
  });

  afterEach(async () => {
    await memoryModule.teardown();
  });

  describe('init()', () => {
    it('should initialize with valid config', async () => {
      await memoryModule.init(validConfig);
      
      const state = memoryModule.getState();
      expect(state.initialized).toBe(true);
      expect(state.backend).toBe('indexeddb');
      expect(state.conversationId).toBe('test-conversation-1');
    });

    it('should use default maxTurns if not specified', async () => {
      await memoryModule.init({
        privacyMode: 'fully-local-managed',
        conversationId: 'test-2',
      });
      
      const state = memoryModule.getState();
      expect(state.initialized).toBe(true);
    });

    it('should reject non-local privacy mode', async () => {
      const invalidConfig = {
        privacyMode: 'any',
        conversationId: 'test',
      } as MemoryConfig;
      
      await expect(memoryModule.init(invalidConfig)).rejects.toMatchObject({
        code: 'ERROR_MEMORY_IDB_FAILED',
      });
    });
  });

  describe('addTurn()', () => {
    beforeEach(async () => {
      await memoryModule.init(validConfig);
    });

    it('should add a user turn', async () => {
      const turn: Turn = {
        role: 'user',
        content: 'Hello, how are you?',
        createdAtMs: Date.now(),
      };
      
      await memoryModule.addTurn(turn);
      
      const state = memoryModule.getState();
      expect(state.turnsCount).toBe(1);
    });

    it('should add an assistant turn', async () => {
      const turn: Turn = {
        role: 'assistant',
        content: 'I am doing well, thank you!',
        createdAtMs: Date.now(),
      };
      
      await memoryModule.addTurn(turn);
      
      const context = await memoryModule.getContext();
      expect(context.recentTurns).toHaveLength(1);
      expect(context.recentTurns[0].role).toBe('assistant');
    });

    it('should throw if not initialized', async () => {
      const uninitializedModule = createMemoryModule();
      const turn: Turn = {
        role: 'user',
        content: 'Test',
        createdAtMs: Date.now(),
      };
      
      await expect(uninitializedModule.addTurn(turn)).rejects.toMatchObject({
        code: 'ERROR_MEMORY_IDB_FAILED',
      });
    });
  });

  describe('getContext()', () => {
    beforeEach(async () => {
      await memoryModule.init(validConfig);
    });

    it('should return empty context initially', async () => {
      const context = await memoryModule.getContext();
      
      expect(context.recentTurns).toHaveLength(0);
      expect(context.totalTurns).toBe(0);
    });

    it('should return added turns', async () => {
      await memoryModule.addTurn({
        role: 'user',
        content: 'First message',
        createdAtMs: Date.now(),
      });
      
      await memoryModule.addTurn({
        role: 'assistant',
        content: 'First response',
        createdAtMs: Date.now(),
      });
      
      const context = await memoryModule.getContext();
      expect(context.recentTurns).toHaveLength(2);
      expect(context.totalTurns).toBe(2);
    });
  });

  describe('clearConversation()', () => {
    beforeEach(async () => {
      await memoryModule.init(validConfig);
    });

    it('should clear all turns', async () => {
      await memoryModule.addTurn({
        role: 'user',
        content: 'Message to clear',
        createdAtMs: Date.now(),
      });
      
      await memoryModule.clearConversation();
      
      const context = await memoryModule.getContext();
      expect(context.recentTurns).toHaveLength(0);
    });
  });

  describe('getDiagnostics()', () => {
    it('should return diagnostics after init', async () => {
      await memoryModule.init(validConfig);
      
      const diagnostics = memoryModule.getDiagnostics();
      expect(diagnostics.enabled).toBe(true);
      expect(diagnostics.backend).toBe('indexeddb');
      expect(diagnostics.conversationId).toBe('test-conversation-1');
    });
  });

  describe('teardown()', () => {
    it('should reset state after teardown', async () => {
      await memoryModule.init(validConfig);
      await memoryModule.teardown();
      
      const state = memoryModule.getState();
      expect(state.initialized).toBe(false);
    });
  });
});
