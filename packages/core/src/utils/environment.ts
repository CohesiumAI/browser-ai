/**
 * Environment detection utilities.
 */

import type { EnvironmentFingerprint, CapabilitySnapshot } from '../types/diagnostics.js';

declare global {
  interface Navigator {
    deviceMemory?: number;
  }
  interface Window {
    ai?: unknown;
  }
}

export function getEnvironmentFingerprint(): EnvironmentFingerprint {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGB: navigator.deviceMemory,
    isSecureContext: globalThis.isSecureContext ?? false,
    crossOriginIsolated: globalThis.crossOriginIsolated ?? false,
  };
}

export function getCapabilitySnapshot(): CapabilitySnapshot {
  return {
    hasWindowAI: typeof window !== 'undefined' && 'ai' in window,
    hasWebGPU: typeof navigator !== 'undefined' && 'gpu' in navigator,
    hasWebNN: typeof navigator !== 'undefined' && 'ml' in navigator,
    hasStorageEstimate:
      typeof navigator !== 'undefined' &&
      'storage' in navigator &&
      typeof navigator.storage.estimate === 'function',
    hasCacheStorage: typeof caches !== 'undefined',
    hasIndexedDB: typeof indexedDB !== 'undefined',
  };
}
