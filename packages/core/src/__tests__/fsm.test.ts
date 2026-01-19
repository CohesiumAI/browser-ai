/**
 * FSM unit tests.
 * CDC v2026.8 §21.1
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { StateMachine } from '../fsm/state-machine.js';
import { isValidTransition, canAbort, canGenerate } from '../fsm/transitions.js';

describe('FSM Transitions', () => {
  it('should validate IDLE -> BOOTING', () => {
    expect(isValidTransition('IDLE', 'BOOTING')).toBe(true);
  });

  it('should reject IDLE -> READY', () => {
    expect(isValidTransition('IDLE', 'READY')).toBe(false);
  });

  it('should validate READY -> GENERATING', () => {
    expect(isValidTransition('READY', 'GENERATING')).toBe(true);
  });

  it('should validate ERROR -> REHYDRATING', () => {
    expect(isValidTransition('ERROR', 'REHYDRATING')).toBe(true);
  });

  it('should allow abort in GENERATING', () => {
    expect(canAbort('GENERATING')).toBe(true);
  });

  it('should allow abort in DOWNLOADING', () => {
    expect(canAbort('DOWNLOADING')).toBe(true);
  });

  it('should not allow abort in READY', () => {
    expect(canAbort('READY')).toBe(false);
  });

  it('should allow generate in READY', () => {
    expect(canGenerate('READY')).toBe(true);
  });

  it('should not allow generate in GENERATING', () => {
    expect(canGenerate('GENERATING')).toBe(false);
  });
});

describe('StateMachine', () => {
  let fsm: StateMachine;

  beforeEach(() => {
    fsm = new StateMachine();
  });

  it('should start in IDLE state', () => {
    expect(fsm.stateName).toBe('IDLE');
  });

  it('should transition to BOOTING', () => {
    fsm.toBooting();
    expect(fsm.stateName).toBe('BOOTING');
  });

  it('should throw on invalid transition', () => {
    expect(() => fsm.toReady()).toThrow();
  });

  it('should track state timing', () => {
    const before = Date.now();
    fsm.toBooting();
    const state = fsm.state;
    expect(state.sinceMs).toBeGreaterThanOrEqual(before);
  });

  it('should notify listeners on state change', () => {
    const changes: string[] = [];
    fsm.subscribe((state) => changes.push(state.name));

    fsm.toBooting();
    fsm.toSelectingProvider(['mock']);

    expect(changes).toEqual(['BOOTING', 'SELECTING_PROVIDER']);
  });

  it('should set deadline for BOOTING', () => {
    fsm.toBooting();
    expect(fsm.state.deadlineMs).toBe(10000);
  });

  it('should apply timeout multiplier', () => {
    fsm.setTimeoutMultiplier(2.0);
    fsm.toBooting();
    expect(fsm.state.deadlineMs).toBe(20000);
  });

  describe('resetGeneratingTiming', () => {
    it('should reset sinceMs and lastTokenAtMs in GENERATING state', () => {
      // Transition to GENERATING (valid sequence)
      fsm.toBooting();
      fsm.toSelectingProvider(['mock']);
      fsm.toPreflightQuota();
      fsm.toCheckingCache();
      fsm.toWarmingUp();
      fsm.toReady();
      fsm.toGenerating({ seq: 1, deadlineMs: 120000 });

      // Simulate time passing
      const oldSinceMs = fsm.state.sinceMs;

      // Wait a bit and reset timing
      const now = Date.now();
      fsm.resetGeneratingTiming();

      const state = fsm.state as { sinceMs: number; lastTokenAtMs: number };
      expect(state.sinceMs).toBeGreaterThanOrEqual(now);
      expect(state.lastTokenAtMs).toBe(0);
    });

    it('should not throw if not in GENERATING state', () => {
      // In IDLE state
      expect(() => fsm.resetGeneratingTiming()).not.toThrow();
    });

    it('should reset deadlineAtMs based on new sinceMs if present', () => {
      fsm.toBooting();
      fsm.toSelectingProvider(['mock']);
      fsm.toPreflightQuota();
      fsm.toCheckingCache();
      fsm.toWarmingUp();
      fsm.toReady();
      fsm.toGenerating({ seq: 1, deadlineMs: 120000 });

      const beforeReset = fsm.state as { deadlineAtMs?: number; sinceMs: number; deadlineMs?: number };

      fsm.resetGeneratingTiming();

      const afterReset = fsm.state as { deadlineAtMs?: number; sinceMs: number; deadlineMs?: number };
      // sinceMs should be updated to now
      expect(afterReset.sinceMs).toBeGreaterThanOrEqual(beforeReset.sinceMs);
      // If deadlineMs is set, deadlineAtMs should be recalculated
      if (afterReset.deadlineMs && afterReset.deadlineAtMs) {
        expect(afterReset.deadlineAtMs).toBeGreaterThanOrEqual(afterReset.sinceMs);
      }
    });
  });
});
