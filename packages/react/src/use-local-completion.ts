/**
 * useLocalCompletion — React hook for browser-ai.
 * CDC v2026.8 §4.4
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  BrowserAI,
  BrowserAIConfig,
  GenerateParams,
  RuntimeState,
  DiagnosticsSnapshot,
  Provider,
} from '@cohesiumai/core';
import { createBrowserAI, createIdleState } from '@cohesiumai/core';

export interface UseLocalCompletionOptions {
  config: BrowserAIConfig;
  providers: Provider[];
  autoInit?: boolean;
}

export interface StreamingCallbacks {
  onToken: (token: string) => void;
  onFinal?: (text: string) => void;
  onAborted?: () => void;
  onError?: (error: Error) => void;
}

export interface UseLocalCompletionResult {
  state: RuntimeState;
  output: string;
  isReady: boolean;
  isGenerating: boolean;
  isError: boolean;
  error: Error | null;
  init: () => Promise<void>;
  generate: (params: Omit<GenerateParams, 'onToken'>) => Promise<string>;
  generateWithCallbacks: (
    params: Omit<GenerateParams, 'onToken'>,
    callbacks: StreamingCallbacks
  ) => Promise<string>;
  abort: () => void;
  teardown: () => Promise<void>;
  getDiagnostics: () => DiagnosticsSnapshot | null;
}

// Cached idle state to avoid creating new objects on every render
const CACHED_IDLE_STATE = createIdleState();

export function useLocalCompletion(options: UseLocalCompletionOptions): UseLocalCompletionResult {
  const { config, providers, autoInit = false } = options;

  const browserAIRef = useRef<BrowserAI | null>(null);
  const [currentState, setCurrentState] = useState<RuntimeState>(CACHED_IDLE_STATE);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<Error | null>(null);

  // Create BrowserAI instance once (in useEffect to avoid SSR issues)
  useEffect(() => {
    if (!browserAIRef.current) {
      browserAIRef.current = createBrowserAI({ config, providers });
      setCurrentState(browserAIRef.current.getState());
    }

    // Subscribe to state changes
    const unsubscribe = browserAIRef.current.subscribe((newState) => {
      setCurrentState(newState);
    });

    // Auto-init if requested
    if (autoInit && browserAIRef.current.getState().name === 'IDLE') {
      browserAIRef.current.init().catch((e: Error) => {
        setError(e);
      });
    }

    return unsubscribe;
  }, [config, providers, autoInit]);

  const state = currentState;

  const init = useCallback(async () => {
    if (!browserAIRef.current) {
      browserAIRef.current = createBrowserAI({ config, providers });
      setCurrentState(browserAIRef.current.getState());
    }
    setError(null);
    try {
      await browserAIRef.current.init();
    } catch (e) {
      setError(e as Error);
      throw e;
    }
  }, [config, providers]);

  const generate = useCallback(async (params: Omit<GenerateParams, 'onToken'>): Promise<string> => {
    if (!browserAIRef.current) {
      throw new Error('BrowserAI not initialized. Call init() first.');
    }

    setOutput('');
    setError(null);

    const fullParams: GenerateParams = {
      ...params,
      onToken: (token: string) => {
        setOutput((prev: string) => prev + token);
      },
    };

    try {
      const response = browserAIRef.current.generate(fullParams);
      const result = await response.result;
      return result.text;
    } catch (e) {
      setError(e as Error);
      throw e;
    }
  }, []);

  // Generate with custom callbacks for streaming Option A
  const generateWithCallbacks = useCallback(async (
    params: Omit<GenerateParams, 'onToken'>,
    callbacks: StreamingCallbacks
  ): Promise<string> => {
    if (!browserAIRef.current) {
      throw new Error('BrowserAI not initialized. Call init() first.');
    }

    setError(null);

    const fullParams: GenerateParams = {
      ...params,
      onToken: callbacks.onToken,
    };

    try {
      const response = browserAIRef.current.generate(fullParams);
      const result = await response.result;
      callbacks.onFinal?.(result.text);
      return result.text;
    } catch (e) {
      const err = e as Error;
      // Check if abort error (not a real error for UI)
      if (err.message?.includes('ERROR_ABORTED') || err.message?.includes('aborted')) {
        callbacks.onAborted?.();
        return '';
      }
      setError(err);
      callbacks.onError?.(err);
      throw e;
    }
  }, []);

  const abort = useCallback(() => {
    browserAIRef.current?.abort();
  }, []);

  const teardown = useCallback(async () => {
    if (browserAIRef.current) {
      await browserAIRef.current.teardown();
      browserAIRef.current = null;
    }
    setOutput('');
    setError(null);
  }, []);

  const getDiagnostics = useCallback((): DiagnosticsSnapshot | null => {
    return browserAIRef.current?.getDiagnostics() ?? null;
  }, []);

  return {
    state,
    output,
    isReady: state.name === 'READY',
    isGenerating: state.name === 'GENERATING',
    isError: state.name === 'ERROR',
    error,
    init,
    generate,
    generateWithCallbacks,
    abort,
    teardown,
    getDiagnostics,
  };
}
