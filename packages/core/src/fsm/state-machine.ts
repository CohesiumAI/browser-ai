/**
 * Core state machine implementation.
 * CDC v2026.8 §5
 */

import type {
  RuntimeState,
  RuntimeStateName,
  IdleState,
  BootingState,
  SelectingProviderState,
  PreflightQuotaState,
  CheckingCacheState,
  DownloadingState,
  WarmingUpState,
  ReadyState,
  GeneratingState,
  ErrorState,
  RehydratingState,
  TearingDownState,
} from '../types/runtime-state.js';
import type { BrowserAIError } from '../types/errors.js';
import type { ProviderId, DownloadVariant } from '../types/common.js';
import { createError } from '../types/errors.js';
import { isValidTransition } from './transitions.js';
import { DEFAULT_DEADLINES } from '../types/config.js';

export type StateChangeListener = (state: RuntimeState, prev: RuntimeState) => void;

export class StateMachine {
  private _state: RuntimeState;
  private _listeners: Set<StateChangeListener> = new Set();
  private _timeoutMultiplier: number = 1.0;

  constructor() {
    this._state = this.createIdleState();
  }

  get state(): RuntimeState {
    return this._state;
  }

  get stateName(): RuntimeStateName {
    return this._state.name;
  }

  setTimeoutMultiplier(multiplier: number): void {
    this._timeoutMultiplier = multiplier;
  }

  subscribe(listener: StateChangeListener): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private notify(prev: RuntimeState): void {
    for (const listener of this._listeners) {
      try {
        listener(this._state, prev);
      } catch {
        // Listener errors should not break FSM
      }
    }
  }

  private getDeadline(stateName: RuntimeStateName): number | undefined {
    const base = DEFAULT_DEADLINES[stateName];
    if (base === undefined) return undefined;
    return Math.round(base * this._timeoutMultiplier);
  }

  private createBaseState(name: RuntimeStateName): {
    name: RuntimeStateName;
    sinceMs: number;
    deadlineMs?: number;
    deadlineAtMs?: number;
    selectionReportId?: string;
    providerId?: ProviderId;
  } {
    const now = Date.now();
    const deadlineMs = this.getDeadline(name);
    return {
      name,
      sinceMs: now,
      deadlineMs,
      deadlineAtMs: deadlineMs ? now + deadlineMs : undefined,
      selectionReportId: this._state?.selectionReportId,
      providerId: this._state?.providerId,
    };
  }

  private transition(newState: RuntimeState): void {
    const prev = this._state;
    if (!isValidTransition(prev.name, newState.name)) {
      throw createError(
        'ERROR_INVALID_STATE',
        `Invalid transition from ${prev.name} to ${newState.name}`,
        { atState: prev.name, recoverability: 'non-recoverable' }
      );
    }
    this._state = newState;
    this.notify(prev);
  }

  private forceTransition(newState: RuntimeState): void {
    const prev = this._state;
    this._state = newState;
    this.notify(prev);
  }

  createIdleState(): IdleState {
    return { name: 'IDLE', sinceMs: Date.now() };
  }

  toIdle(): void {
    this.forceTransition(this.createIdleState());
  }

  toBooting(step: BootingState['step'] = 'init'): void {
    this.transition({
      ...this.createBaseState('BOOTING'),
      name: 'BOOTING',
      step,
    } as BootingState);
  }

  toSelectingProvider(policyOrder: ProviderId[]): void {
    this.transition({
      ...this.createBaseState('SELECTING_PROVIDER'),
      name: 'SELECTING_PROVIDER',
      policyOrder,
      tried: [],
    } as SelectingProviderState);
  }

  addProviderProbeResult(providerId: ProviderId, ok: boolean, reason?: string): void {
    if (this._state.name !== 'SELECTING_PROVIDER') return;
    const state = this._state as SelectingProviderState;
    state.tried.push({ providerId, ok, reason });
  }

  toPreflightQuota(modelId?: string, requiredBytes?: number): void {
    this.transition({
      ...this.createBaseState('PREFLIGHT_QUOTA'),
      name: 'PREFLIGHT_QUOTA',
      modelId,
      requiredBytes,
      estimateSupported: true,
    } as PreflightQuotaState);
  }

  toCheckingCache(modelId?: string): void {
    this.transition({
      ...this.createBaseState('CHECKING_CACHE'),
      name: 'CHECKING_CACHE',
      modelId,
    } as CheckingCacheState);
  }

  toDownloading(variant: DownloadVariant, totalBytes?: number): void {
    this.transition({
      ...this.createBaseState('DOWNLOADING'),
      name: 'DOWNLOADING',
      variant,
      totalBytes,
      downloadedBytes: 0,
    } as DownloadingState);
  }

  updateDownloadProgress(downloadedBytes: number, totalBytes?: number): void {
    if (this._state.name !== 'DOWNLOADING') return;
    const prev = this._state;
    // Create new state object to trigger React re-render
    const newState: DownloadingState = {
      ...(this._state as DownloadingState),
      downloadedBytes,
    };
    if (totalBytes !== undefined) {
      newState.totalBytes = totalBytes;
      newState.variant = 'determinate';
    }
    this._state = newState;
    this.notify(prev);
  }

  toWarmingUp(phase: WarmingUpState['phase'] = 'model-load'): void {
    this.transition({
      ...this.createBaseState('WARMING_UP'),
      name: 'WARMING_UP',
      phase,
    } as WarmingUpState);
  }

  toReady(modelId?: string): void {
    this.transition({
      ...this.createBaseState('READY'),
      name: 'READY',
      modelId,
    } as ReadyState);
  }

  toGenerating(epoch: number, requestSeq: number): void {
    this.transition({
      ...this.createBaseState('GENERATING'),
      name: 'GENERATING',
      epoch,
      requestSeq,
      isAborting: false,
      tokensEmitted: 0,
      lastTokenAtMs: 0,
    } as GeneratingState);
  }

  updateGeneratingToken(): void {
    if (this._state.name !== 'GENERATING') return;
    const state = this._state as GeneratingState;
    state.tokensEmitted++;
    state.lastTokenAtMs = Date.now();
  }

  /**
   * Reset GENERATING state timing after engine recreation.
   * This ensures watchdog doesn't count recreate time as prefill.
   */
  resetGeneratingTiming(): void {
    if (this._state.name !== 'GENERATING') return;
    const now = Date.now();
    const state = this._state as GeneratingState;
    state.sinceMs = now;
    state.lastTokenAtMs = 0;
    if (state.deadlineMs) {
      state.deadlineAtMs = now + state.deadlineMs;
    }
  }

  setAborting(): void {
    if (this._state.name !== 'GENERATING') return;
    const state = this._state as GeneratingState;
    state.isAborting = true;
  }

  toError(error: BrowserAIError, canRehydrate: boolean = false): void {
    this.forceTransition({
      ...this.createBaseState('ERROR'),
      name: 'ERROR',
      error,
      canRehydrate,
    } as ErrorState);
  }

  toRehydrating(reason: RehydratingState['reason'], attempt: number = 1): void {
    this.transition({
      ...this.createBaseState('REHYDRATING'),
      name: 'REHYDRATING',
      reason,
      attempt,
    } as RehydratingState);
  }

  toTearingDown(reason: TearingDownState['reason'] = 'USER_REQUEST'): void {
    this.forceTransition({
      ...this.createBaseState('TEARING_DOWN'),
      name: 'TEARING_DOWN',
      reason,
    } as TearingDownState);
  }

  setSelectionReportId(id: string): void {
    this._state.selectionReportId = id;
  }

  setProviderId(id: ProviderId): void {
    this._state.providerId = id;
  }
}
