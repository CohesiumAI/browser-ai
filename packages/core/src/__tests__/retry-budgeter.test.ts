/**
 * RetryBudgeter unit tests.
 * CDC v2026.8 §11.2
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RetryBudgeter, createRetryBudgeter } from '../utils/retry-budgeter.js';

describe('RetryBudgeter', () => {
  let budgeter: RetryBudgeter;

  beforeEach(() => {
    budgeter = createRetryBudgeter();
  });

  describe('createBudget', () => {
    it('should create a budget with default values', () => {
      const budget = budgeter.createBudget('req-1', 1000);
      
      expect(budget.maxRetries).toBe(2);
      expect(budget.currentAttempt).toBe(0);
      expect(budget.originalMaxTokens).toBe(1000);
      expect(budget.remainingTokens).toBe(1000);
    });

    it('should store budget by requestId', () => {
      budgeter.createBudget('req-1', 1000);
      const retrieved = budgeter.getBudget('req-1');
      
      expect(retrieved).toBeDefined();
      expect(retrieved?.originalMaxTokens).toBe(1000);
    });
  });

  describe('prepareRetry', () => {
    it('should increment attempt counter', () => {
      budgeter.createBudget('req-1', 1000);
      
      budgeter.prepareRetry('req-1', { messages: [] }, 'Test error');
      
      const budget = budgeter.getBudget('req-1');
      expect(budget?.currentAttempt).toBe(1);
    });

    it('should reduce tokens on retry', () => {
      budgeter.createBudget('req-1', 1000);
      
      const params = budgeter.prepareRetry('req-1', { messages: [], maxTokens: 1000 }, 'Test error');
      
      // CDC v2026.8 §11.2: reduction factor is 0.8 (-20% per retry)
      expect(params.maxTokens).toBe(800);
    });

    it('should throw after max retries exceeded', () => {
      budgeter.createBudget('req-1', 1000);
      
      // First retry OK
      budgeter.prepareRetry('req-1', { messages: [] }, 'Error 1');
      // Second retry OK
      budgeter.prepareRetry('req-1', { messages: [] }, 'Error 2');
      
      // Third retry should throw
      expect(() => 
        budgeter.prepareRetry('req-1', { messages: [] }, 'Error 3')
      ).toThrow(/Max retries/);
    });

    it('should throw if budget not found', () => {
      expect(() => 
        budgeter.prepareRetry('unknown', { messages: [] }, 'Error')
      ).toThrow();
    });

    it('should record last error', () => {
      budgeter.createBudget('req-1', 1000);
      budgeter.prepareRetry('req-1', { messages: [] }, 'Specific error');
      
      const budget = budgeter.getBudget('req-1');
      expect(budget?.lastError).toBe('Specific error');
    });
  });

  describe('success', () => {
    it('should clean up budget on success', () => {
      budgeter.createBudget('req-1', 1000);
      budgeter.success('req-1');
      
      expect(budgeter.getBudget('req-1')).toBeUndefined();
    });
  });

  describe('cleanup', () => {
    it('should remove budget', () => {
      budgeter.createBudget('req-1', 1000);
      budgeter.cleanup('req-1');
      
      expect(budgeter.getBudget('req-1')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('should return active request count', () => {
      budgeter.createBudget('req-1', 1000);
      budgeter.createBudget('req-2', 500);
      
      const stats = budgeter.getStats();
      expect(stats.activeRequests).toBe(2);
    });
  });

  describe('custom config', () => {
    it('should respect custom maxRetries', () => {
      const custom = createRetryBudgeter({ maxRetries: 5 });
      const budget = custom.createBudget('req-1', 1000);
      
      expect(budget.maxRetries).toBe(5);
    });

    it('should respect custom reductionFactor', () => {
      const custom = createRetryBudgeter({ reductionFactor: 0.5 });
      custom.createBudget('req-1', 1000);
      
      const params = custom.prepareRetry('req-1', { messages: [], maxTokens: 1000 }, 'Error');
      expect(params.maxTokens).toBe(500);
    });

    it('should respect minTokens', () => {
      const custom = createRetryBudgeter({ minTokens: 100, reductionFactor: 0.1 });
      custom.createBudget('req-1', 200);
      
      const params = custom.prepareRetry('req-1', { messages: [], maxTokens: 200 }, 'Error');
      // 200 * 0.1 = 20, but minTokens is 100
      expect(params.maxTokens).toBe(100);
    });
  });
});
