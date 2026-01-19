/**
 * FSM transition definitions.
 * CDC v2026.8 §5.5
 */

import type { RuntimeStateName } from '../types/runtime-state.js';

type TransitionMap = Record<RuntimeStateName, RuntimeStateName[]>;

/**
 * Valid transitions from each state.
 */
export const VALID_TRANSITIONS: TransitionMap = {
  IDLE: ['BOOTING'],
  BOOTING: ['SELECTING_PROVIDER', 'ERROR'],
  SELECTING_PROVIDER: ['PREFLIGHT_QUOTA', 'DISABLED', 'ERROR'],
  PREFLIGHT_QUOTA: ['CHECKING_CACHE', 'ERROR'],
  CHECKING_CACHE: ['WARMING_UP', 'DOWNLOADING', 'ERROR'],
  DOWNLOADING: ['WARMING_UP', 'ERROR'],
  WARMING_UP: ['READY', 'ERROR'],
  READY: ['GENERATING', 'TEARING_DOWN'],
  GENERATING: ['READY', 'ERROR'],
  ERROR: ['REHYDRATING', 'TEARING_DOWN', 'IDLE'],
  DISABLED: ['TEARING_DOWN', 'IDLE'],
  REHYDRATING: ['SELECTING_PROVIDER', 'ERROR', 'TEARING_DOWN'],
  TEARING_DOWN: ['IDLE'],
};

/**
 * Check if a transition is valid.
 */
export function isValidTransition(from: RuntimeStateName, to: RuntimeStateName): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed?.includes(to) ?? false;
}

/**
 * States that can receive abort command.
 */
export const ABORTABLE_STATES: RuntimeStateName[] = ['GENERATING', 'DOWNLOADING'];

/**
 * Check if abort is allowed in current state.
 */
export function canAbort(state: RuntimeStateName): boolean {
  return ABORTABLE_STATES.includes(state);
}

/**
 * States where generate can be called.
 */
export const GENERATABLE_STATES: RuntimeStateName[] = ['READY'];

/**
 * Check if generate is allowed.
 */
export function canGenerate(state: RuntimeStateName): boolean {
  return GENERATABLE_STATES.includes(state);
}
