/**
 * Healthcheck Watchdog — Active monitoring of FSM state deadlines.
 * CDC v2026.8 §5.6
 * 
 * Monitors state timeouts and triggers recovery actions.
 * Non-destructive healthcheck in GENERATING state.
 */

import type { RuntimeState, RuntimeStateName } from '../types/runtime-state.js';
import type { BrowserAIError } from '../types/errors.js';
import { createError } from '../types/errors.js';
import { DEFAULT_DEADLINES, INDETERMINATE_STUCK_WATCHDOG_MS } from '../types/config.js';

export type WatchdogAction = 'timeout' | 'stuck' | 'healthy';

export interface WatchdogEvent {
  action: WatchdogAction;
  state: RuntimeStateName;
  elapsedMs: number;
  deadlineMs?: number;
  error?: BrowserAIError;
}

export type WatchdogCallback = (event: WatchdogEvent) => void;

export interface HealthcheckWatchdogConfig {
  /** Check interval in ms. Default: 1000 */
  checkIntervalMs?: number;
  /** Callback when watchdog detects issues */
  onEvent?: WatchdogCallback;
  /** Custom deadline overrides */
  deadlineOverrides?: Partial<Record<RuntimeStateName, number>>;
  /** Enable verbose logging */
  verbose?: boolean;
}

const DEFAULT_CHECK_INTERVAL_MS = 1000;

export class HealthcheckWatchdog {
  private readonly checkIntervalMs: number;
  private readonly onEvent?: WatchdogCallback;
  private readonly deadlines: Partial<Record<RuntimeStateName, number>>;
  private readonly verbose: boolean;
  
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private currentState: RuntimeState | null = null;
  private lastTokenAtMs: number = 0;
  private isRunning: boolean = false;

  constructor(config: HealthcheckWatchdogConfig = {}) {
    this.checkIntervalMs = config.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.onEvent = config.onEvent;
    this.deadlines = { ...DEFAULT_DEADLINES, ...config.deadlineOverrides };
    this.verbose = config.verbose ?? false;
  }

  /**
   * Start the watchdog monitoring loop.
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.intervalId = setInterval(() => this.check(), this.checkIntervalMs);
    
    if (this.verbose) {
      console.log('[Watchdog] Started monitoring');
    }
  }

  /**
   * Stop the watchdog.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    
    if (this.verbose) {
      console.log('[Watchdog] Stopped monitoring');
    }
  }

  /**
   * Update the current state being monitored.
   */
  updateState(state: RuntimeState): void {
    this.currentState = state;

    if (state.name === 'GENERATING') {
      const genState = state as RuntimeState & { lastTokenAtMs?: number };
      this.lastTokenAtMs = genState.lastTokenAtMs ?? 0;
      return;
    }

    this.lastTokenAtMs = 0;
  }

  /**
   * Record a token emission (for GENERATING state monitoring).
   */
  recordToken(): void {
    this.lastTokenAtMs = Date.now();
  }

  /**
   * Perform a healthcheck on current state.
   */
  private check(): void {
    if (!this.currentState) return;
    
    const now = Date.now();
    const state = this.currentState;
    const elapsed = now - state.sinceMs;
    const deadline = this.deadlines[state.name];
    
    // Check for deadline exceeded
    if (deadline && elapsed > deadline) {
      this.emitEvent({
        action: 'timeout',
        state: state.name,
        elapsedMs: elapsed,
        deadlineMs: deadline,
        error: createError(
          'ERROR_TIMEOUT',
          `State ${state.name} exceeded deadline of ${deadline}ms (elapsed: ${elapsed}ms)`,
          { recoverability: 'recoverable' }
        ),
      });
      return;
    }

    // Special handling for DOWNLOADING indeterminate state
    if (state.name === 'DOWNLOADING') {
      const dlState = state as RuntimeState & { variant?: string; downloadedBytes?: number };
      if (dlState.variant === 'indeterminate' && elapsed > INDETERMINATE_STUCK_WATCHDOG_MS) {
        this.emitEvent({
          action: 'stuck',
          state: state.name,
          elapsedMs: elapsed,
          deadlineMs: INDETERMINATE_STUCK_WATCHDOG_MS,
          error: createError(
            'ERROR_NATIVE_DOWNLOAD_STUCK',
            `Download stuck in indeterminate state for ${Math.round(elapsed / 1000)}s`,
            { recoverability: 'recoverable' }
          ),
        });
        return;
      }
    }

    // Special handling for GENERATING state - check token flow
    if (state.name === 'GENERATING') {
      const tokenTimeout = 30_000; // 30s without tokens is suspicious
      const prefillTimeout = 60_000; // 60s for initial prefill (first token)
      
      if (this.lastTokenAtMs > 0) {
        // Already received tokens - check for silence
        const tokenSilence = now - this.lastTokenAtMs;
        if (tokenSilence > tokenTimeout) {
          this.emitEvent({
            action: 'stuck',
            state: state.name,
            elapsedMs: tokenSilence,
            deadlineMs: tokenTimeout,
            error: createError(
              'ERROR_GENERATION_STALLED',
              `No tokens received for ${Math.round(tokenSilence / 1000)}s`,
              { recoverability: 'recoverable' }
            ),
          });
          return;
        }
      } else {
        // No tokens yet - check if prefill is taking too long
        if (elapsed > prefillTimeout) {
          this.emitEvent({
            action: 'stuck',
            state: state.name,
            elapsedMs: elapsed,
            deadlineMs: prefillTimeout,
            error: createError(
              'ERROR_GENERATION_STALLED',
              `No tokens received after ${Math.round(elapsed / 1000)}s (prefill timeout)`,
              { recoverability: 'recoverable' }
            ),
          });
          return;
        }
      }
    }

    // All healthy
    if (this.verbose) {
      console.log(`[Watchdog] ${state.name} healthy (${elapsed}ms)`);
    }
  }

  /**
   * Emit a watchdog event.
   */
  private emitEvent(event: WatchdogEvent): void {
    if (this.verbose) {
      console.log(`[Watchdog] Event: ${event.action} in ${event.state}`);
    }
    
    if (this.onEvent) {
      try {
        this.onEvent(event);
      } catch (err) {
        console.error('[Watchdog] Event handler error:', err);
      }
    }
  }

  /**
   * Get current watchdog status.
   */
  getStatus(): {
    isRunning: boolean;
    currentState: RuntimeStateName | null;
    elapsedMs: number;
  } {
    return {
      isRunning: this.isRunning,
      currentState: this.currentState?.name ?? null,
      elapsedMs: this.currentState ? Date.now() - this.currentState.sinceMs : 0,
    };
  }
}

/**
 * Create a HealthcheckWatchdog instance.
 */
export function createHealthcheckWatchdog(config?: HealthcheckWatchdogConfig): HealthcheckWatchdog {
  return new HealthcheckWatchdog(config);
}
