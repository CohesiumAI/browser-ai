/**
 * Tests for DownloadWatchdog (CDC §5.4)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DownloadWatchdog, createDownloadWatchdog } from '../fsm/watchdog.js';
import type { DownloadingState } from '../types/runtime-state.js';

function createDownloadingState(overrides: Partial<DownloadingState> = {}): DownloadingState {
  return {
    name: 'DOWNLOADING',
    sinceMs: Date.now(),
    variant: 'indeterminate',
    ...overrides,
  };
}

describe('DownloadWatchdog', () => {
  let watchdog: DownloadWatchdog;

  beforeEach(() => {
    vi.useFakeTimers();
    watchdog = createDownloadWatchdog({
      stuckThresholdMs: 300000, // 5 min
      checkIntervalMs: 30000, // 30s
    });
  });

  afterEach(() => {
    watchdog.stop();
    vi.useRealTimers();
  });

  describe('isStuck', () => {
    it('returns false for determinate downloads', () => {
      const state = createDownloadingState({
        variant: 'determinate',
      });
      expect(watchdog.isStuck(state)).toBe(false);
    });

    it('returns false when progress recorded recently', () => {
      watchdog.recordProgress();
      const state = createDownloadingState();
      expect(watchdog.isStuck(state)).toBe(false);
    });

    it('returns true when no progress for > 5min (indeterminate)', () => {
      const state = createDownloadingState({
        sinceMs: Date.now() - 301000,
      });
      expect(watchdog.isStuck(state)).toBe(true);
    });
  });

  describe('recordProgress', () => {
    it('updates last progress timestamp', () => {
      const state = createDownloadingState({
        sinceMs: Date.now() - 301000,
      });
      
      // Initially stuck
      expect(watchdog.isStuck(state)).toBe(true);
      
      // Record progress
      watchdog.recordProgress();
      
      // No longer stuck
      expect(watchdog.isStuck(state)).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('starts periodic watchdog checks', () => {
      const getState = vi.fn().mockReturnValue(createDownloadingState());
      const onStuck = vi.fn();

      watchdog.start(getState, onStuck);
      
      vi.advanceTimersByTime(30000);
      expect(getState).toHaveBeenCalled();
    });

    it('stops when state is not DOWNLOADING', () => {
      const getState = vi.fn().mockReturnValue(null);
      const onStuck = vi.fn();

      watchdog.start(getState, onStuck);
      vi.advanceTimersByTime(30000);

      // Should have stopped
      getState.mockClear();
      vi.advanceTimersByTime(30000);
      expect(getState).not.toHaveBeenCalled();
    });

    it('calls onStuck when download is stuck', () => {
      const state = createDownloadingState({
        sinceMs: Date.now(),
      });
      const getState = vi.fn().mockReturnValue(state);
      const onStuck = vi.fn();

      watchdog.start(getState, onStuck);
      
      // Advance past stuck threshold (5min + check interval)
      vi.advanceTimersByTime(300000 + 30000);
      
      expect(onStuck).toHaveBeenCalled();
      expect(onStuck.mock.calls[0][0].code).toBe('ERROR_NATIVE_DOWNLOAD_STUCK');
    });

    it('stops after calling onStuck', () => {
      const state = createDownloadingState({
        sinceMs: Date.now() - 301000,
      });
      const getState = vi.fn().mockReturnValue(state);
      const onStuck = vi.fn();

      watchdog.start(getState, onStuck);
      vi.advanceTimersByTime(30000);
      
      // Should have stopped after calling onStuck
      onStuck.mockClear();
      vi.advanceTimersByTime(30000);
      expect(onStuck).not.toHaveBeenCalled();
    });
  });
});
