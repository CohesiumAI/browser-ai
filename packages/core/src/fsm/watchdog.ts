/**
 * Indeterminate download watchdog.
 * CDC v2026.8 §5.4 — Indeterminate-stuck watchdog
 * 
 * If variant='indeterminate' and no signal (progress/heartbeat) during 5min
 * → ERROR_NATIVE_DOWNLOAD_STUCK (recoverable)
 */

import type { DownloadingState } from '../types/runtime-state.js';
import { createError, type BrowserAIError } from '../types/errors.js';

export interface WatchdogConfig {
  /**
   * Time without progress signal before considering stuck.
   * @default 300000 (5 minutes)
   */
  stuckThresholdMs?: number;

  /**
   * Interval between watchdog checks.
   * @default 30000 (30 seconds)
   */
  checkIntervalMs?: number;
}

const DEFAULT_CONFIG: Required<WatchdogConfig> = {
  stuckThresholdMs: 5 * 60 * 1000, // 5 minutes
  checkIntervalMs: 30 * 1000, // 30 seconds
};

export class DownloadWatchdog {
  private config: Required<WatchdogConfig>;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastProgressAt: number = 0;
  private onStuck: ((error: BrowserAIError) => void) | null = null;

  constructor(config: WatchdogConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Record a progress signal (heartbeat).
   */
  recordProgress(): void {
    this.lastProgressAt = Date.now();
  }

  /**
   * Check if download is stuck (only for indeterminate variant).
   */
  isStuck(state: DownloadingState): boolean {
    if (state.variant !== 'indeterminate') {
      return false;
    }

    const now = Date.now();
    const lastSignal = this.lastProgressAt || state.sinceMs;
    return (now - lastSignal) > this.config.stuckThresholdMs;
  }

  /**
   * Start watchdog monitoring.
   */
  start(
    getState: () => DownloadingState | null,
    onStuck: (error: BrowserAIError) => void
  ): void {
    this.stop();
    this.lastProgressAt = Date.now();
    this.onStuck = onStuck;

    this.intervalId = setInterval(() => {
      const state = getState();
      if (!state || state.name !== 'DOWNLOADING') {
        this.stop();
        return;
      }

      if (this.isStuck(state)) {
        const error = createError(
          'ERROR_NATIVE_DOWNLOAD_STUCK',
          `No download progress for ${Math.round(this.config.stuckThresholdMs / 60000)} minutes`,
          {
            recoverability: 'recoverable',
            atState: 'DOWNLOADING',
            userAction: 'Download appears stuck. Try reloading the page.',
            devAction: 'Check network connectivity and model URL accessibility.',
          }
        );

        if (this.onStuck) {
          this.onStuck(error);
        }
        this.stop();
      }
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop watchdog monitoring.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.onStuck = null;
  }
}

/**
 * Create a download watchdog with optional config.
 */
export function createDownloadWatchdog(config?: WatchdogConfig): DownloadWatchdog {
  return new DownloadWatchdog(config);
}
