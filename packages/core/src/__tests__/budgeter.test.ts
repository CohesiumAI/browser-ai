/**
 * Budgeter tests.
 * CDC v2026.8 §11.2
 */

import { describe, it, expect } from 'vitest';
import {
  generateBudgetAttempts,
  estimateTokenCount,
  checkPromptFits,
} from '../utils/budgeter.js';

describe('generateBudgetAttempts', () => {
  it('should generate 3 attempts (0 retries + 2 retries)', () => {
    const attempts = generateBudgetAttempts(1000);
    expect(attempts).toHaveLength(3);
  });

  it('should apply cumulative reduction', () => {
    const attempts = generateBudgetAttempts(1000);

    expect(attempts[0]?.maxTokens).toBe(1000);
    expect(attempts[1]?.maxTokens).toBe(800);
    expect(attempts[2]?.maxTokens).toBe(640);
  });

  it('should floor the values', () => {
    const attempts = generateBudgetAttempts(100);

    expect(attempts[0]?.maxTokens).toBe(100);
    expect(attempts[1]?.maxTokens).toBe(80);
    expect(attempts[2]?.maxTokens).toBe(64);
  });
});

describe('estimateTokenCount', () => {
  it('should estimate ~4 chars per token', () => {
    const text = 'Hello world test';
    const estimate = estimateTokenCount(text);

    expect(estimate).toBe(Math.ceil(16 / 4));
  });

  it('should round up', () => {
    const text = 'Hi';
    expect(estimateTokenCount(text)).toBe(1);
  });
});

describe('checkPromptFits', () => {
  it('should return true when prompt fits', () => {
    const prompt = 'Short prompt';
    const fits = checkPromptFits(prompt, 100, 4096);
    expect(fits).toBe(true);
  });

  it('should return false when prompt exceeds context', () => {
    const longPrompt = 'x'.repeat(20000);
    const fits = checkPromptFits(longPrompt, 1000, 4096);
    expect(fits).toBe(false);
  });
});
