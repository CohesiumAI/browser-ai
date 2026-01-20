/**
 * @cohesiumai/modules-vlm
 * Local Vision-Language Model module for image understanding
 * v2.0 - CDC v2026.9 §12
 */

export type {
  VlmConfig,
  VlmResult,
  VlmModule,
  VlmModuleState,
  VlmDiagnostics,
  VlmBackend,
  DeviceTier,
} from './types.js';

export { createVlmModule, detectTier, isVlmSupported, tryCreateVlmModule } from './vlm-module.js';
