/**
 * Prompt budgeter for native provider.
 * CDC v2026.8 §11
 */

export interface BudgetAttempt {
  attempt: number;
  maxTokens: number;
}

/**
 * Conservative char-to-token ratio when tokenizer is unavailable.
 * ~4 chars per token is a safe estimate.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Max retries for budget overflow. CDC v2026.8 §11.2
 */
const MAX_RETRIES = 2;

/**
 * Reduction factor per retry (cumulative).
 * t0: requested
 * t1: floor(requested * 0.8)
 * t2: floor(requested * 0.64)
 */
const REDUCTION_FACTOR = 0.8;

/**
 * Generate budget attempts with cumulative reduction.
 */
export function generateBudgetAttempts(requestedMaxTokens: number): BudgetAttempt[] {
  const attempts: BudgetAttempt[] = [];
  let current = requestedMaxTokens;

  for (let i = 0; i <= MAX_RETRIES; i++) {
    attempts.push({ attempt: i, maxTokens: Math.floor(current) });
    current *= REDUCTION_FACTOR;
  }

  return attempts;
}

/**
 * Estimate token count from text using conservative char count.
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Check if prompt fits within context window.
 */
export function checkPromptFits(
  promptText: string,
  maxTokens: number,
  contextWindowTokens: number
): boolean {
  const promptTokens = estimateTokenCount(promptText);
  return promptTokens + maxTokens <= contextWindowTokens;
}
