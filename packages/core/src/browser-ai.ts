/**
 * Main BrowserAI class.
 * CDC v2026.8 §4.2.3
 */

import type { BrowserAIConfig } from './types/config.js';
import type { GenerateParams, GenerateResponse, GenerateResult, TokenEvent, FinalEvent } from './types/generate.js';
import type { RuntimeState } from './types/runtime-state.js';
import type { DiagnosticsSnapshot, SelectionReport } from './types/diagnostics.js';
import type { Provider } from './types/provider.js';
import type { ProviderId } from './types/common.js';
import type { ModelSpec } from './types/models.js';

import { StateMachine } from './fsm/state-machine.js';
import { canGenerate, canAbort } from './fsm/transitions.js';
import { createDownloadWatchdog, type DownloadWatchdog } from './fsm/watchdog.js';
import { createHealthcheckWatchdog, type HealthcheckWatchdog, type WatchdogEvent } from './utils/healthcheck-watchdog.js';
import { createEnvelopeFactory, isCurrentEpoch } from './protocol/envelope.js';
import { createError, isRecoverable, isBrowserAIError, type BrowserAIError } from './types/errors.js';
import { DEFAULT_GENERATE_PARAMS, clampTemperature, clampTopP } from './types/generate.js';
import { validateMessages } from './utils/message-adapter.js';
import { getEnvironmentFingerprint, getCapabilitySnapshot } from './utils/environment.js';
import { getQuotaEstimate, checkQuotaPreflight, type QuotaAttempt, type QuotaPreflightReport } from './utils/quota.js';
import { withDownloadLock } from './utils/background-download.js';
import { validateConfig } from './utils/config-validator.js';
import { DEFAULT_SLO } from './types/diagnostics.js';
import { DEFAULT_MODELS, getModelById, getModelFallbackChain } from './types/models.js';
import { pickDefaultModelId } from './utils/tier.js';
import { selectProvider, type ProviderRegistry } from './selection/provider-selector.js';
import { selectModelForProvider, validateModelForProvider } from './selection/model-selector.js';

export interface BrowserAIOptions {
  config: BrowserAIConfig;
  providers: Provider[];
}

export class BrowserAI {
  private readonly config: BrowserAIConfig;
  private readonly fsm: StateMachine;
  private readonly envelope = createEnvelopeFactory();
  private readonly providers: Map<ProviderId, Provider>;
  
  private currentProvider: Provider | null = null;
  private currentModel: ModelSpec | null = null;
  private selectionReport: SelectionReport | null = null;
  private recentErrors: import('./types/errors.js').BrowserAIError[] = [];
  private timings: Partial<import('./types/diagnostics.js').TimingSnapshot> = {};
  private abortController: AbortController | null = null;
  private downloadWatchdog: DownloadWatchdog;
  private healthcheckWatchdog: HealthcheckWatchdog;

  constructor(options: BrowserAIOptions) {
    this.config = options.config;
    this.fsm = new StateMachine();
    this.providers = new Map();

    for (const provider of options.providers) {
      this.providers.set(provider.id, provider);
    }

    if (this.config.timeouts?.timeoutMultiplier) {
      this.fsm.setTimeoutMultiplier(this.config.timeouts.timeoutMultiplier);
    }

    // Initialize watchdogs (CDC v2026.8 §5.4, §5.6)
    this.downloadWatchdog = createDownloadWatchdog();
    this.healthcheckWatchdog = createHealthcheckWatchdog({
      onEvent: (event) => this.handleWatchdogEvent(event),
    });
  }

  /**
   * Handle watchdog events for rehydration.
   * CDC v2026.8 §5.6, §23.2
   */
  private handleWatchdogEvent(event: WatchdogEvent): void {
    if (event.action === 'healthy') return;

    console.warn(`[browser-ai] Watchdog: ${event.action} in ${event.state}`);

    // For stuck GENERATING state, force abort and recovery
    if (event.state === 'GENERATING' && (event.action === 'stuck' || event.action === 'timeout')) {
      console.warn('[browser-ai] Watchdog forcing abort due to stuck generation');
      
      // Force abort to break the stuck promise
      this.abortController?.abort();
      this.currentProvider?.abort();
      
      // Stop watchdog to prevent spam
      this.healthcheckWatchdog.stop();
      
      // Transition to READY so new generation can start
      // (abort() in provider will flag engine for recreation)
      if (this.fsm.stateName === 'GENERATING') {
        this.fsm.toReady(this.currentModel?.id);
      }
      
      if (event.error) {
        this.recentErrors.push(event.error);
      }
      return;
    }

    if (event.error) {
      this.recentErrors.push(event.error);

      // Trigger rehydration for recoverable errors
      if (event.error.recoverability === 'recoverable') {
        this.fsm.toError(event.error, true);
        // Note: Full rehydration would require re-running init sequence
        // For V0.1, we just transition to ERROR state with canRehydrate=true
      }
    }
  }

  private getRegistry(): ProviderRegistry {
    return {
      get: (id: ProviderId) => this.providers.get(id),
      getAll: () => Array.from(this.providers.values()),
    };
  }

  // Quota preflight report for diagnostics (Option C spec §7)
  private quotaPreflightReport: QuotaPreflightReport | null = null;

  /**
   * Resolve model with quota-aware selection BEFORE FSM transitions (Option C).
   * Evaluates quota for all candidates in memory, then returns the first that fits.
   * This ensures only ONE transition to PREFLIGHT_QUOTA occurs.
   */
  private async resolveModelBeforeFSM(provider: Provider): Promise<{
    model: ModelSpec;
    quotaResult: { ok: boolean; requiredBytes: number; marginBytes: number };
    report: QuotaPreflightReport;
  }> {
    const env = getEnvironmentFingerprint();
    const caps = getCapabilitySnapshot();

    // Step 1: Determine primary model
    const selection = await selectModelForProvider(provider.id, this.config, env, caps);
    console.log(`[browser-ai] Model selection: ${selection.reason}`);
    validateModelForProvider(provider.id, selection.model);
    const primaryModel = selection.model;

    // Step 2: Build candidate list (primary + fallbacks, no duplicates)
    const candidateModels: ModelSpec[] = [primaryModel];
    const seenIds = new Set<string>([primaryModel.id]);

    // Add fallbacks based on provider
    if (provider.id === 'webllm') {
      const fallbackChain = getModelFallbackChain();
      for (const fb of fallbackChain) {
        if (!seenIds.has(fb.id) && fb.sizeBytes < primaryModel.sizeBytes) {
          candidateModels.push(fb);
          seenIds.add(fb.id);
        }
      }
    } else if (provider.id === 'smollm' || provider.id === 'wasm') {
      const { getMobileModelFallbackChain } = await import('./types/models.js');
      const fallbackChain = getMobileModelFallbackChain();
      for (const fb of fallbackChain) {
        if (!seenIds.has(fb.id) && fb.sizeBytes < primaryModel.sizeBytes) {
          validateModelForProvider(provider.id, fb);
          candidateModels.push(fb);
          seenIds.add(fb.id);
        }
      }
    }

    // Step 3: Evaluate quota for each candidate (NO FSM transitions here)
    const attempts: QuotaAttempt[] = [];
    let selectedModel: ModelSpec | null = null;
    let selectedQuotaResult: { ok: boolean; requiredBytes: number; marginBytes: number } | null = null;

    // Native/mock providers skip quota check
    if (provider.id === 'native' || provider.id === 'mock') {
      selectedModel = primaryModel;
      selectedQuotaResult = { ok: true, requiredBytes: 0, marginBytes: 0 };
      attempts.push({
        modelId: primaryModel.id,
        sizeBytes: primaryModel.sizeBytes,
        marginBytes: 0,
        requiredBytes: 0,
        ok: true,
        estimateSupported: false,
      });
    } else {
      for (const candidate of candidateModels) {
        const quotaResult = await checkQuotaPreflight(candidate.sizeBytes);
        
        const attempt: QuotaAttempt = {
          modelId: candidate.id,
          sizeBytes: candidate.sizeBytes,
          marginBytes: quotaResult.marginBytes,
          requiredBytes: quotaResult.requiredBytes,
          ok: quotaResult.ok,
          estimateSupported: quotaResult.estimate.supported,
          availableBytes: quotaResult.estimate.availableBytes,
          quotaBytes: quotaResult.estimate.quotaBytes,
          usageBytes: quotaResult.estimate.usageBytes,
        };
        attempts.push(attempt);

        if (quotaResult.ok && !selectedModel) {
          selectedModel = candidate;
          selectedQuotaResult = {
            ok: true,
            requiredBytes: quotaResult.requiredBytes,
            marginBytes: quotaResult.marginBytes,
          };
          // Continue to log all attempts for diagnostics, but we have our selection
        }
      }
    }

    // Build report
    const report: QuotaPreflightReport = {
      providerId: provider.id,
      attempts,
      selectedModelId: selectedModel?.id,
    };

    // Log quota attempts
    console.log('[browser-ai] QUOTA PREFLIGHT ATTEMPTS:');
    for (const attempt of attempts) {
      const status = attempt.ok ? '✓' : '✗';
      const availStr = attempt.estimateSupported 
        ? `${Math.round((attempt.availableBytes ?? 0) / (1024 * 1024))} MB available`
        : 'estimate not supported';
      console.log(`[browser-ai]   ${status} ${attempt.modelId}: ${Math.round(attempt.requiredBytes / (1024 * 1024))} MB required (${availStr})`);
    }

    // No candidate passed
    if (!selectedModel || !selectedQuotaResult) {
      const lastAttempt = attempts[attempts.length - 1];
      throw createError(
        'ERROR_QUOTA_PREFLIGHT_FAIL',
        `Insufficient storage for any model. Need at least ${Math.round((lastAttempt?.requiredBytes ?? 100 * 1024 * 1024) / (1024 * 1024))} MB free.`,
        {
          userAction: 'Free up browser storage space',
          recoverability: 'non-recoverable',
          details: { quotaPreflightReport: report },
        }
      );
    }

    if (selectedModel.id !== primaryModel.id) {
      console.log(`[browser-ai] Fallback to smaller model: ${selectedModel.label}`);
    }
    console.log(`[browser-ai] Selected model: ${selectedModel.label} (${Math.round(selectedModel.sizeBytes / (1024 * 1024))} MB)`);

    return { model: selectedModel, quotaResult: selectedQuotaResult, report };
  }

  /**
   * Select model with automatic fallback (Option C implementation).
   * Calls resolveModelBeforeFSM first, then does exactly ONE FSM transition to PREFLIGHT_QUOTA.
   */
  private async selectModelWithFallback(provider: Provider): Promise<ModelSpec> {
    // Option C: resolve model and quota BEFORE any FSM transitions
    const { model, quotaResult, report } = await this.resolveModelBeforeFSM(provider);
    this.quotaPreflightReport = report;

    // Now do exactly ONE transition to PREFLIGHT_QUOTA
    this.fsm.toPreflightQuota(model.id, model.sizeBytes);
    
    // Then immediately to CHECKING_CACHE (quota already validated)
    this.fsm.toCheckingCache(model.id);

    return model;
  }

  async init(): Promise<void> {
    if (this.fsm.stateName !== 'IDLE') {
      throw createError('ERROR_INVALID_STATE', `Cannot init from state ${this.fsm.stateName}`);
    }

    // Validate config before starting (CDC v2026.8 §17)
    validateConfig(this.config);

    const bootStart = Date.now();

    // Diagnostic: log capabilities at startup
    const env = getEnvironmentFingerprint();
    const caps = getCapabilitySnapshot();
    console.log('[browser-ai] ══════════════════════════════════════');
    console.log('[browser-ai] INIT DIAGNOSTICS');
    console.log('[browser-ai] ──────────────────────────────────────');
    console.log(`[browser-ai] Location: ${typeof location !== 'undefined' ? location.href : 'N/A'}`);
    console.log(`[browser-ai] SecureContext: ${env.isSecureContext}`);
    console.log(`[browser-ai] CrossOriginIsolated: ${env.crossOriginIsolated}`);
    console.log(`[browser-ai] DeviceMemory: ${env.deviceMemoryGB ?? 'unknown'} GB`);
    console.log(`[browser-ai] HardwareConcurrency: ${env.hardwareConcurrency}`);
    console.log(`[browser-ai] hasWebGPU: ${caps.hasWebGPU}`);
    console.log(`[browser-ai] hasWebNN: ${caps.hasWebNN}`);
    console.log(`[browser-ai] hasWindowAI: ${caps.hasWindowAI}`);
    console.log(`[browser-ai] Provider order: ${this.config.providerPolicy.order.join(' → ')}`);
    console.log(`[browser-ai] Registered providers: ${Array.from(this.providers.keys()).join(', ')}`);
    console.log('[browser-ai] ──────────────────────────────────────');

    try {
      this.fsm.toBooting('init');

      this.fsm.toSelectingProvider(this.config.providerPolicy.order);

      const { provider, report } = await selectProvider(this.config, this.getRegistry());
      this.selectionReport = report;

      // Log provider selection results
      console.log('[browser-ai] PROVIDER SELECTION RESULTS:');
      for (const entry of report.reasons) {
        const status = entry.ok ? '✓' : '✗';
        const details = entry.details ? JSON.stringify(entry.details) : '';
        console.log(`[browser-ai]   ${status} ${entry.providerId}: ${entry.reason} ${details}`);
      }

      if (!provider) {
        console.error('[browser-ai] ✗ NO PROVIDER AVAILABLE');
        throw createError(
          'ERROR_NATIVE_UNAVAILABLE',
          'No provider available matching policy',
          { details: { report }, recoverability: 'non-recoverable' }
        );
      }

      console.log(`[browser-ai] ══════════════════════════════════════`);
      console.log(`[browser-ai] ✓ SELECTED: ${provider.id.toUpperCase()}`);
      console.log(`[browser-ai] ══════════════════════════════════════`);

      this.currentProvider = provider;
      this.fsm.setProviderId(provider.id);
      this.fsm.setSelectionReportId(report.id);

      const selectedModel = await this.selectModelWithFallback(provider);
      this.currentModel = selectedModel;

      // Transition to DOWNLOADING and track progress
      this.fsm.toDownloading('indeterminate', selectedModel.sizeBytes);

      // Start download watchdog for indeterminate-stuck detection (CDC v2026.8 §5.4)
      this.downloadWatchdog.start(
        () => {
          const state = this.fsm.state;
          return state.name === 'DOWNLOADING' ? state as import('./types/runtime-state.js').DownloadingState : null;
        },
        (error) => this.handleWatchdogEvent({ action: 'stuck', state: 'DOWNLOADING', elapsedMs: 0, error })
      );

      try {
        // Use Web Lock to prevent browser throttling during download
        await withDownloadLock(async () => {
          await provider.init(this.config, selectedModel, (progress) => {
            // Update FSM with real download progress
            if (progress.downloadedBytes !== undefined) {
              this.fsm.updateDownloadProgress(progress.downloadedBytes, progress.totalBytes);
            }
            // Record progress for watchdog heartbeat
            this.downloadWatchdog.recordProgress();
          });
        });
      } finally {
        this.downloadWatchdog.stop();
      }

      // FSM requires: DOWNLOADING -> WARMING_UP -> READY
      this.fsm.toWarmingUp();
      this.fsm.toReady(selectedModel.id);
      this.timings.bootMs = Date.now() - bootStart;

    } catch (error) {
      const browserError = isBrowserAIError(error)
        ? error
        : createError('ERROR_UNKNOWN', String(error), { cause: error });

      this.recentErrors.push(browserError);
      this.fsm.toError(browserError, isRecoverable(browserError));
      throw error;
    }
  }

  generate(params: GenerateParams): GenerateResponse {
    if (!canGenerate(this.fsm.stateName)) {
      throw createError('ERROR_INVALID_STATE', `Cannot generate from state ${this.fsm.stateName}`);
    }

    validateMessages(params.messages);

    if (params.maxTokens !== undefined && params.maxTokens <= 0) {
      throw createError('ERROR_INVALID_CONFIG', 'maxTokens must be > 0');
    }

    const epoch = this.envelope.incrementEpoch();
    const seq = this.envelope.getSeq();

    this.fsm.toGenerating(epoch, seq);
    this.abortController = new AbortController();

    // Start healthcheck watchdog for token-aware monitoring (CDC v2026.8 §5.6)
    this.healthcheckWatchdog.updateState(this.fsm.state);
    this.healthcheckWatchdog.start();

    const normalizedParams: GenerateParams = {
      ...params,
      maxTokens: params.maxTokens ?? DEFAULT_GENERATE_PARAMS.maxTokens,
      temperature: clampTemperature(params.temperature ?? DEFAULT_GENERATE_PARAMS.temperature),
      topP: clampTopP(params.topP ?? DEFAULT_GENERATE_PARAMS.topP),
      stream: params.stream ?? DEFAULT_GENERATE_PARAMS.stream,
      onRecreate: () => {
        // Reset GENERATING state timing after engine recreation so watchdog starts fresh
        this.fsm.resetGeneratingTiming();
        this.healthcheckWatchdog.updateState(this.fsm.state);
        console.log('[browser-ai] Engine recreated, watchdog timing reset');
      },
    };

    const provider = this.currentProvider!;
    const selectionReportId = this.selectionReport?.id ?? '';
    const currentEpoch = epoch;

    const tokens: string[] = [];
    let finalText = '';

    const resultPromise = (async (): Promise<GenerateResult> => {
      try {
        const result = await provider.generate(normalizedParams, (token) => {
          if (this.abortController?.signal.aborted) return;

          tokens.push(token);
          this.fsm.updateGeneratingToken();
          // Record token for healthcheck watchdog (CDC v2026.8 §5.6)
          this.healthcheckWatchdog.recordToken();

          if (normalizedParams.onToken) {
            normalizedParams.onToken(token);
          }
        });

        finalText = result.text;
        this.healthcheckWatchdog.stop();
        // Only transition to READY if we're still in GENERATING (not ERROR from watchdog)
        if (this.fsm.stateName === 'GENERATING') {
          this.fsm.toReady(this.currentModel?.id);
        }

        return {
          ...result,
          selectionReportId,
        };
      } catch (error) {
        this.healthcheckWatchdog.stop();
        if (this.abortController?.signal.aborted) {
          // Abort is not an error - transition back to READY so new generation can start
          if (this.fsm.stateName === 'GENERATING') {
            this.fsm.toReady(this.currentModel?.id);
          }
          throw createError('ERROR_ABORTED', 'Generation aborted by user');
        }

        const browserError = createError('ERROR_UNKNOWN', String(error), {
          cause: error,
          recoverability: 'recoverable',
        });
        this.recentErrors.push(browserError);
        this.fsm.toError(browserError, true);
        throw error;
      }
    })();

    if (!normalizedParams.stream) {
      return { result: resultPromise };
    }

    const streamIterable: AsyncIterable<TokenEvent | FinalEvent> = {
      [Symbol.asyncIterator]: () => {
        let tokenIndex = 0;
        let done = false;
        let seqCounter = 0;

        return {
          async next(): Promise<IteratorResult<TokenEvent | FinalEvent>> {
            while (tokenIndex >= tokens.length && !done) {
              await new Promise((r) => setTimeout(r, 10));

              try {
                await Promise.race([
                  resultPromise.then(() => { done = true; }),
                  new Promise((r) => setTimeout(r, 50)),
                ]);
              } catch {
                done = true;
              }
            }

            if (tokenIndex < tokens.length) {
              const token = tokens[tokenIndex++]!;
              return {
                done: false,
                value: {
                  type: 'token',
                  token,
                  epoch: currentEpoch,
                  seq: seqCounter++,
                },
              };
            }

            if (done) {
              try {
                const result = await resultPromise;
                return {
                  done: false,
                  value: {
                    type: 'final',
                    text: result.text,
                    usage: result.usage,
                    epoch: currentEpoch,
                    seq: seqCounter++,
                  },
                };
              } catch {
                return { done: true, value: undefined };
              }
            }

            return { done: true, value: undefined };
          },
        };
      },
    };

    return {
      stream: streamIterable,
      result: resultPromise,
    };
  }

  abort(): void {
    if (!canAbort(this.fsm.stateName)) {
      return;
    }

    this.fsm.setAborting();
    this.abortController?.abort();
    this.currentProvider?.abort();
  }

  async teardown(): Promise<void> {
    this.fsm.toTearingDown('USER_REQUEST');

    try {
      if (this.currentProvider) {
        await this.currentProvider.teardown();
      }
    } finally {
      this.currentProvider = null;
      this.currentModel = null;
      this.selectionReport = null;
      this.abortController = null;
      this.fsm.toIdle();
    }
  }

  getState(): RuntimeState {
    return this.fsm.state;
  }

  getDiagnostics(): DiagnosticsSnapshot {
    const env = getEnvironmentFingerprint();
    const capabilities = getCapabilitySnapshot();

    return {
      schemaVersion: '1',
      generatedAtMs: Date.now(),
      libVersion: '0.1.0',
      selectionReport: this.selectionReport ?? undefined,
      quotaPreflightReport: this.quotaPreflightReport ?? undefined,
      state: this.fsm.state,
      privacy: {
        privacyMode: this.config.privacyMode ?? 'any',
        runtimeMode: this.currentProvider?.id === 'native'
          ? 'browser-delegated-unknown'
          : 'fully-local-managed',
        note: this.currentProvider?.id === 'native'
          ? 'Native privacy depends on browser vendor'
          : 'Model runs locally in WebGPU',
      },
      env,
      capabilities,
      storage: {
        supported: capabilities.hasStorageEstimate,
      },
      cache: {
        modelId: this.currentModel?.id,
      },
      timings: {
        ...this.timings,
        lastStateChangeAtMs: this.fsm.state.sinceMs,
      },
      slo: {
        ...DEFAULT_SLO,
        lastBootMs: this.timings.bootMs,
      },
      adapters: {
        messageFlattened: false,
        systemPromptLocation: 'native',
      },
      recentErrors: this.recentErrors.slice(-10),
    };
  }

  subscribe(listener: (state: RuntimeState, prev: RuntimeState) => void): () => void {
    return this.fsm.subscribe(listener);
  }
}

/**
 * Create a BrowserAI instance.
 */
export function createBrowserAI(options: BrowserAIOptions): BrowserAI {
  return new BrowserAI(options);
}
