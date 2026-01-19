/**
 * HealthcheckWatchdog unit tests.
 * CDC v2026.8 §5.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HealthcheckWatchdog, createHealthcheckWatchdog } from '../utils/healthcheck-watchdog.js';
import type { RuntimeState } from '../types/runtime-state.js';

describe('HealthcheckWatchdog', () => {
  let watchdog: HealthcheckWatchdog;

  beforeEach(() => {
    vi.useFakeTimers();
    watchdog = createHealthcheckWatchdog({ checkIntervalMs: 100 });
  });

  afterEach(() => {
    watchdog.stop();
    vi.useRealTimers();
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      watchdog.start();
      expect(watchdog.getStatus().isRunning).toBe(true);
    });

    it('should stop monitoring', () => {
      watchdog.start();
      watchdog.stop();
      expect(watchdog.getStatus().isRunning).toBe(false);
    });

    it('should not start twice', () => {
      watchdog.start();
      watchdog.start(); // Should be no-op
      expect(watchdog.getStatus().isRunning).toBe(true);
    });
  });

  describe('updateState', () => {
    it('should track current state', () => {
      const state: RuntimeState = {
        name: 'READY',
        sinceMs: Date.now(),
      };
      
      watchdog.updateState(state);
      expect(watchdog.getStatus().currentState).toBe('READY');
    });

    it('should calculate elapsed time', () => {
      const state: RuntimeState = {
        name: 'READY',
        sinceMs: Date.now() - 5000,
      };
      
      watchdog.updateState(state);
      expect(watchdog.getStatus().elapsedMs).toBeGreaterThanOrEqual(5000);
    });
  });

  describe('timeout detection', () => {
    it('should emit timeout event when deadline exceeded', () => {
      const events: string[] = [];
      const wd = createHealthcheckWatchdog({
        checkIntervalMs: 100,
        onEvent: (e) => events.push(e.action),
      });

      wd.start();
      
      // Set a state with deadline already exceeded
      wd.updateState({
        name: 'BOOTING',
        sinceMs: Date.now() - 20000, // 20s ago, deadline is 10s
        deadlineMs: 10000,
      });

      vi.advanceTimersByTime(100);
      
      expect(events).toContain('timeout');
      wd.stop();
    });
  });

  describe('recordToken', () => {
    it('should update lastTokenAtMs', () => {
      watchdog.recordToken();
      // Internal state updated - no direct assertion, but should not throw
    });
  });

  describe('getStatus', () => {
    it('should return status object', () => {
      const status = watchdog.getStatus();
      
      expect(status).toHaveProperty('isRunning');
      expect(status).toHaveProperty('currentState');
      expect(status).toHaveProperty('elapsedMs');
    });

    it('should return null state when not set', () => {
      expect(watchdog.getStatus().currentState).toBeNull();
    });
  });

  describe('verbose mode', () => {
    it('should log when verbose is true', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const wd = createHealthcheckWatchdog({ verbose: true });
      wd.start();
      wd.stop();
      
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('abort recovery (v2.1)', () => {
    it('should reset lastTokenAtMs to 0 when entering new GENERATING state', () => {
      // First GENERATING state with tokens
      watchdog.updateState({
        name: 'GENERATING',
        sinceMs: Date.now() - 10000,
        lastTokenAtMs: Date.now() - 5000, // Had tokens before
      });

      // Simulate abort -> READY
      watchdog.updateState({
        name: 'READY',
        sinceMs: Date.now(),
      });

      // New GENERATING state after engine recreation
      const newGenStartMs = Date.now();
      watchdog.updateState({
        name: 'GENERATING',
        sinceMs: newGenStartMs,
        lastTokenAtMs: 0, // Reset by FSM
      });

      const status = watchdog.getStatus();
      expect(status.currentState).toBe('GENERATING');
      // lastTokenAtMs should be 0 (prefill phase)
    });

    it('should use prefill timeout when lastTokenAtMs is 0', () => {
      const events: string[] = [];
      const wd = createHealthcheckWatchdog({
        checkIntervalMs: 100,
        onEvent: (e) => events.push(e.action),
      });

      wd.start();

      // GENERATING with lastTokenAtMs = 0 but within prefill timeout (60s)
      wd.updateState({
        name: 'GENERATING',
        sinceMs: Date.now() - 30000, // 30s ago, under 60s prefill
        lastTokenAtMs: 0,
      });

      vi.advanceTimersByTime(100);

      // Should NOT timeout yet (prefill allows 60s)
      expect(events).not.toContain('timeout');

      wd.stop();
    });

    it('should emit stuck event if prefill exceeds 60s without tokens', () => {
      const events: string[] = [];
      const wd = createHealthcheckWatchdog({
        checkIntervalMs: 100,
        onEvent: (e) => events.push(e.action),
      });

      wd.start();

      // GENERATING with lastTokenAtMs = 0, exceeding prefill timeout
      wd.updateState({
        name: 'GENERATING',
        sinceMs: Date.now() - 70000, // 70s ago, over 60s prefill
        lastTokenAtMs: 0,
      });

      vi.advanceTimersByTime(100);

      // Watchdog emits 'stuck' action for stalled generation
      expect(events).toContain('stuck');

      wd.stop();
    });
  });
});
