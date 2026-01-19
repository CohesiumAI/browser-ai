/**
 * Tests for HealthcheckManager (CDC §5.6)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealthcheckManager, createHealthcheckManager } from '../fsm/healthcheck.js';
import type { GeneratingState } from '../types/runtime-state.js';

function createGeneratingState(overrides: Partial<GeneratingState> = {}): GeneratingState {
  return {
    name: 'GENERATING',
    sinceMs: Date.now(),
    epoch: 1,
    requestSeq: 1,
    isAborting: false,
    tokensEmitted: 0,
    lastTokenAtMs: Date.now(),
    ...overrides,
  };
}

describe('HealthcheckManager', () => {
  let manager: HealthcheckManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = createHealthcheckManager({
      stalledThresholdMs: 30000,
      pingTimeoutMs: 5000,
      stalledTimeoutMultiplier: 3,
    });
  });

  afterEach(() => {
    manager.stop();
    vi.useRealTimers();
  });

  describe('isStalled', () => {
    it('returns false when token received recently', () => {
      const state = createGeneratingState({
        lastTokenAtMs: Date.now(),
      });
      expect(manager.isStalled(state)).toBe(false);
    });

    it('returns true when no token for > 30s', () => {
      const state = createGeneratingState({
        lastTokenAtMs: Date.now() - 31000,
      });
      expect(manager.isStalled(state)).toBe(true);
    });

    it('uses sinceMs as fallback when lastTokenAtMs undefined', () => {
      const state = createGeneratingState({
        sinceMs: Date.now() - 31000,
        lastTokenAtMs: undefined,
      });
      expect(manager.isStalled(state)).toBe(true);
    });
  });

  describe('check', () => {
    it('returns healthy when token received recently', async () => {
      const state = createGeneratingState({
        lastTokenAtMs: Date.now(),
      });
      const result = await manager.check(state);
      expect(result.status).toBe('healthy');
    });

    it('returns stalled error when no ping function provided', async () => {
      const state = createGeneratingState({
        lastTokenAtMs: Date.now() - 31000,
      });
      const result = await manager.check(state);
      expect(result.status).toBe('stalled');
      if (result.status === 'stalled') {
        expect(result.error.code).toBe('ERROR_GENERATION_STALLED');
      }
    });

    it('returns healthy when ping succeeds', async () => {
      const state = createGeneratingState({
        lastTokenAtMs: Date.now() - 31000,
      });
      const pingFn = vi.fn().mockResolvedValue(true);
      const result = await manager.check(state, pingFn);
      expect(result.status).toBe('healthy');
      expect(pingFn).toHaveBeenCalled();
    });

    it('returns stalled when ping returns false', async () => {
      const state = createGeneratingState({
        lastTokenAtMs: Date.now() - 31000,
      });
      const pingFn = vi.fn().mockResolvedValue(false);
      const result = await manager.check(state, pingFn);
      expect(result.status).toBe('stalled');
    });

    it('returns timeout when ping times out', async () => {
      const state = createGeneratingState({
        lastTokenAtMs: Date.now() - 31000,
      });
      const pingFn = vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 20000))
      );
      
      const checkPromise = manager.check(state, pingFn);
      vi.advanceTimersByTime(16000); // 5000 * 3 = 15000, plus margin
      const result = await checkPromise;
      
      expect(result.status).toBe('timeout');
      if (result.status === 'timeout') {
        expect(result.error.code).toBe('ERROR_HEALTHCHECK_TIMEOUT_DURING_GENERATION');
      }
    });
  });

  describe('start/stop', () => {
    it('starts periodic healthcheck', () => {
      const getState = vi.fn().mockReturnValue(createGeneratingState());
      const pingFn = vi.fn().mockResolvedValue(true);
      const onError = vi.fn();

      manager.start(getState, pingFn, onError);
      
      vi.advanceTimersByTime(5000);
      expect(getState).toHaveBeenCalled();
    });

    it('stops when state is not GENERATING', () => {
      const getState = vi.fn().mockReturnValue(null);
      const pingFn = vi.fn().mockResolvedValue(true);
      const onError = vi.fn();

      manager.start(getState, pingFn, onError);
      vi.advanceTimersByTime(5000);

      // Should have stopped, so no more calls
      getState.mockClear();
      vi.advanceTimersByTime(5000);
      expect(getState).not.toHaveBeenCalled();
    });

    it('calls onError when health check fails', async () => {
      const state = createGeneratingState({
        lastTokenAtMs: Date.now() - 31000,
      });
      const getState = vi.fn().mockReturnValue(state);
      const pingFn = vi.fn().mockResolvedValue(false);
      const onError = vi.fn();

      manager.start(getState, pingFn, onError);
      
      vi.advanceTimersByTime(5000);
      await vi.runAllTimersAsync();
      
      expect(onError).toHaveBeenCalled();
    });
  });
});
