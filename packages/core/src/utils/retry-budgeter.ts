/**
 * Retry Budgeter — Cumulative retry logic for generation failures.
 * CDC v2026.8 §11.2
 * 
 * MaxRetries = 2, cumulative across prompt budgeting attempts.
 * Tracks remaining tokens and adjusts maxTokens on retry.
 */

import { createError } from '../types/errors.js';
import type { GenerateParams } from '../types/generate.js';

export interface RetryBudget {
  maxRetries: number;
  currentAttempt: number;
  originalMaxTokens: number;
  remainingTokens: number;
  lastError?: string;
}

export interface RetryBudgeterConfig {
  /** Maximum retry attempts. CDC default: 2 */
  maxRetries?: number;
  /** Token reduction factor per retry. CDC v2026.8 §11.2: 0.8 (-20% per retry) */
  reductionFactor?: number;
  /** Minimum tokens to attempt. Default: 50 */
  minTokens?: number;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_REDUCTION_FACTOR = 0.8; // CDC v2026.8 §11.2: -20% per retry (t1=0.8, t2=0.64)
const DEFAULT_MIN_TOKENS = 50;

export class RetryBudgeter {
  private readonly maxRetries: number;
  private readonly reductionFactor: number;
  private readonly minTokens: number;
  private budgets: Map<string, RetryBudget> = new Map();

  constructor(config: RetryBudgeterConfig = {}) {
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.reductionFactor = config.reductionFactor ?? DEFAULT_REDUCTION_FACTOR;
    this.minTokens = config.minTokens ?? DEFAULT_MIN_TOKENS;
  }

  /**
   * Create or get a retry budget for a generation request.
   * @param requestId Unique identifier for the request
   * @param maxTokens Original maxTokens from params
   */
  createBudget(requestId: string, maxTokens: number): RetryBudget {
    const budget: RetryBudget = {
      maxRetries: this.maxRetries,
      currentAttempt: 0,
      originalMaxTokens: maxTokens,
      remainingTokens: maxTokens,
    };
    this.budgets.set(requestId, budget);
    return budget;
  }

  /**
   * Get current budget for a request.
   */
  getBudget(requestId: string): RetryBudget | undefined {
    return this.budgets.get(requestId);
  }

  /**
   * Check if retry is allowed and get adjusted params.
   * @returns Adjusted GenerateParams with reduced maxTokens, or throws if exhausted
   */
  prepareRetry(requestId: string, params: GenerateParams, errorMessage: string): GenerateParams {
    const budget = this.budgets.get(requestId);
    if (!budget) {
      throw createError(
        'ERROR_UNKNOWN',
        'No retry budget found for request',
        { recoverability: 'non-recoverable' }
      );
    }

    budget.currentAttempt++;
    budget.lastError = errorMessage;

    if (budget.currentAttempt > budget.maxRetries) {
      throw createError(
        'ERROR_PROMPT_TOO_LARGE_AFTER_RETRIES',
        `Max retries (${budget.maxRetries}) exceeded. Last error: ${errorMessage}`,
        {
          recoverability: 'non-recoverable',
          userAction: 'Try a shorter prompt or reduce maxTokens',
          devAction: 'Check context window limits and token budgeting',
        }
      );
    }

    // Reduce tokens for retry
    const reducedTokens = Math.floor(budget.remainingTokens * this.reductionFactor);
    budget.remainingTokens = Math.max(reducedTokens, this.minTokens);

    if (budget.remainingTokens < this.minTokens) {
      throw createError(
        'ERROR_PROMPT_BUDGET_OVERFLOW',
        `Token budget exhausted after ${budget.currentAttempt} attempts`,
        {
          recoverability: 'non-recoverable',
          userAction: 'Use a shorter prompt',
        }
      );
    }

    console.log(`[RetryBudgeter] Attempt ${budget.currentAttempt}/${budget.maxRetries}, tokens: ${budget.remainingTokens}`);

    return {
      ...params,
      maxTokens: budget.remainingTokens,
    };
  }

  /**
   * Mark request as successful and clean up budget.
   */
  success(requestId: string): void {
    this.budgets.delete(requestId);
  }

  /**
   * Clean up budget for a request.
   */
  cleanup(requestId: string): void {
    this.budgets.delete(requestId);
  }

  /**
   * Get retry statistics.
   */
  getStats(): { activeRequests: number; totalBudgets: number } {
    return {
      activeRequests: this.budgets.size,
      totalBudgets: this.budgets.size,
    };
  }
}

/**
 * Create a RetryBudgeter instance.
 */
export function createRetryBudgeter(config?: RetryBudgeterConfig): RetryBudgeter {
  return new RetryBudgeter(config);
}
