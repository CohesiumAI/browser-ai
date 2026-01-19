/**
 * VLM (Vision-Language Model) types for browser-ai v2.0
 * CDC v2026.9 §12.3
 */

export type VlmBackend = 'webgpu';

export type DeviceTier = 1 | 2 | 3;

export interface VlmConfig {
  privacyMode: 'fully-local-managed';
  requireTier3?: boolean;
}

export interface VlmResult {
  text: string;
  confidence?: number;
  durationMs?: number;
}

export interface VlmModuleState {
  initialized: boolean;
  backend: VlmBackend;
  deviceTier: DeviceTier;
  modelLoaded: boolean;
}

export interface VlmDiagnostics {
  enabled: boolean;
  backend?: VlmBackend;
  deviceTier?: DeviceTier;
  lastLatencyMs?: number;
  imagesProcessed?: number;
}

export interface VlmModule {
  init(cfg: VlmConfig): Promise<void>;
  describeImage(image: Blob | ArrayBuffer): Promise<VlmResult>;
  chatWithImage(input: { image: Blob | ArrayBuffer; prompt: string }): Promise<VlmResult>;
  getState(): VlmModuleState;
  getDiagnostics(): VlmDiagnostics;
  teardown(): Promise<void>;
}
