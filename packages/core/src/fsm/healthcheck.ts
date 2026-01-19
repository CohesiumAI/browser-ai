/**
 * Healthcheck manager for generation monitoring.
 * CDC v2026.8 §5.6 — Token-aware healthcheck during GENERATING
 * 
 * Rules:
 * - If now - lastTokenAt <= 30s: consider alive even if ping timeout
 * - If now - lastTokenAt > 30s: execute CMD_HEALTHCHECK with timeout ×3
 * - If failure: ERROR_HEALTHCHECK_TIMEOUT_DURING_GENERATION → REHYDRATING
 */

import type { GeneratingState } from '../types/runtime-state.js';
import { createError, type BrowserAIError } from '../types/errors.js';

export interface HealthcheckConfig {
  /**
   * Interval between healthchecks in ms.
   * @default 5000 (5 seconds)
   */
  intervalMs?: number;

  /**
   * Max time without token before considering stalled.
   * @default 30000 (30 seconds)
   */
  stalledThresholdMs?: number;

  /**
   * Timeout for healthcheck ping.
   * @default 5000 (5 seconds)
   */
  pingTimeoutMs?: number;

  /**
   * Timeout multiplier for stalled state.
   * @default 3
   */
  stalledTimeoutMultiplier?: number;
}

const DEFAULT_CONFIG: Required<HealthcheckConfig> = {
  intervalMs: 5000,
  stalledThresholdMs: 30000,
  pingTimeoutMs: 5000,
  stalledTimeoutMultiplier: 3,
};

export type HealthcheckResult = 
  | { status: 'healthy' }
  | { status: 'stalled'; error: BrowserAIError }
  | { status: 'timeout'; error: BrowserAIError };

export type HealthcheckCallback = () => Promise<boolean>;

export class HealthcheckManager {
  private config: Required<HealthcheckConfig>;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onError: ((error: BrowserAIError) => void) | null = null;

  constructor(config: HealthcheckConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if generation is considered stalled.
   */
  isStalled(state: GeneratingState): boolean {
    const now = Date.now();
    const lastToken = state.lastTokenAtMs ?? state.sinceMs;
    return (now - lastToken) > this.config.stalledThresholdMs;
  }

  /**
   * Perform a single healthcheck.
   */
  async check(
    state: GeneratingState,
    pingFn?: HealthcheckCallback
  ): Promise<HealthcheckResult> {
    const stalled = this.isStalled(state);

    if (!stalled) {
      // Token received recently, consider healthy
      return { status: 'healthy' };
    }

    // Stalled: need to ping provider
    if (!pingFn) {
      return {
        status: 'stalled',
        error: createError(
          'ERROR_GENERATION_STALLED',
          `No token received for ${this.config.stalledThresholdMs}ms`,
          {
            recoverability: 'recoverable',
            atState: 'GENERATING',
            userAction: 'Generation may be stuck. Try aborting and regenerating.',
          }
        ),
      };
    }

    // Execute ping with extended timeout for stalled state
    const timeout = this.config.pingTimeoutMs * this.config.stalledTimeoutMultiplier;
    
    try {
      const pingResult = await Promise.race([
        pingFn(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Ping timeout')), timeout)
        ),
      ]);

      if (pingResult) {
        return { status: 'healthy' };
      }

      return {
        status: 'stalled',
        error: createError(
          'ERROR_GENERATION_STALLED',
          'Provider reported unhealthy state',
          { recoverability: 'recoverable', atState: 'GENERATING' }
        ),
      };
    } catch {
      return {
        status: 'timeout',
        error: createError(
          'ERROR_HEALTHCHECK_TIMEOUT_DURING_GENERATION',
          `Healthcheck timeout after ${timeout}ms`,
          {
            recoverability: 'recoverable',
            atState: 'GENERATING',
            userAction: 'Generation timed out. The model may need to be reloaded.',
          }
        ),
      };
    }
  }

  /**
   * Start periodic healthcheck monitoring.
   */
  start(
    getState: () => GeneratingState | null,
    pingFn: HealthcheckCallback,
    onError: (error: BrowserAIError) => void
  ): void {
    this.stop();
    this.onError = onError;

    this.intervalId = setInterval(async () => {
      const state = getState();
      if (!state || state.name !== 'GENERATING') {
        this.stop();
        return;
      }

      const result = await this.check(state, pingFn);
      
      if (result.status !== 'healthy' && this.onError) {
        this.onError(result.error);
        this.stop();
      }
    }, this.config.intervalMs);
  }

  /**
   * Stop healthcheck monitoring.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.onError = null;
  }
}

/**
 * Create a healthcheck manager with optional config.
 */
export function createHealthcheckManager(config?: HealthcheckConfig): HealthcheckManager {
  return new HealthcheckManager(config);
}
