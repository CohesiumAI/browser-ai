/**
 * Worker command types.
 * CDC v2026.8 §6.4
 */

import type { BrowserAIConfig } from '../types/config.js';
import type { GenerateParams } from '../types/generate.js';
import type { ModelSpec } from '../types/models.js';

export type CommandType =
  | 'CMD_INIT'
  | 'CMD_SELECT_PROVIDER'
  | 'CMD_PREFLIGHT_QUOTA'
  | 'CMD_CHECK_CACHE'
  | 'CMD_DOWNLOAD_MODEL'
  | 'CMD_WARMUP'
  | 'CMD_GENERATE'
  | 'CMD_ABORT'
  | 'CMD_TEARDOWN'
  | 'CMD_HEALTHCHECK';

export interface CmdInit {
  type: 'CMD_INIT';
  config: BrowserAIConfig;
}

export interface CmdSelectProvider {
  type: 'CMD_SELECT_PROVIDER';
  policyOrder: string[];
}

export interface CmdPreflightQuota {
  type: 'CMD_PREFLIGHT_QUOTA';
  modelSizeBytes: number;
}

export interface CmdCheckCache {
  type: 'CMD_CHECK_CACHE';
  modelId: string;
}

export interface CmdDownloadModel {
  type: 'CMD_DOWNLOAD_MODEL';
  model: ModelSpec;
}

export interface CmdWarmup {
  type: 'CMD_WARMUP';
}

export interface CmdGenerate {
  type: 'CMD_GENERATE';
  params: GenerateParams;
}

export interface CmdAbort {
  type: 'CMD_ABORT';
}

export interface CmdTeardown {
  type: 'CMD_TEARDOWN';
}

export interface CmdHealthcheck {
  type: 'CMD_HEALTHCHECK';
  requestedAt: number;
}

export type WorkerCommand =
  | CmdInit
  | CmdSelectProvider
  | CmdPreflightQuota
  | CmdCheckCache
  | CmdDownloadModel
  | CmdWarmup
  | CmdGenerate
  | CmdAbort
  | CmdTeardown
  | CmdHealthcheck;
