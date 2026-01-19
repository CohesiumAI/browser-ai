/**
 * Provider interface — Ports & Adapters pattern.
 * CDC v2026.8 §7.1
 */

import type { ProviderId } from './common.js';
import type { BrowserAIConfig } from './config.js';
import type { GenerateParams, GenerateResult } from './generate.js';
import type { ModelSpec } from './models.js';

export interface ProviderSupports {
  streaming: boolean;
  abort: boolean;
  systemRole: boolean;
  downloadProgress: boolean;
}

export interface DetectResult {
  available: boolean;
  reason?: string;
  privacyClaim?: 'on-device-claimed' | 'unknown';
  supports?: ProviderSupports;
}

export interface DownloadProgress {
  downloadedBytes?: number;
  totalBytes?: number;
  percent?: number;
  text?: string;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export interface Provider {
  readonly id: ProviderId;

  detect(cfg: BrowserAIConfig): Promise<DetectResult>;

  init(cfg: BrowserAIConfig, model?: ModelSpec, onProgress?: ProgressCallback): Promise<void>;

  generate(
    params: GenerateParams,
    onToken: (token: string) => void
  ): Promise<GenerateResult>;

  abort(): void;

  teardown(): Promise<void>;

  getDownloadProgress?(): DownloadProgress;
}
