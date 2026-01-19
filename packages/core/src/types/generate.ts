/**
 * Generation types — GenerateParams, GenerateResponse, streaming.
 * CDC v2026.8 §4.2.2
 */

import type { ChatMessage, ProviderId, Usage } from './common.js';

export interface GenerateParams {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stop?: string[];
  stream?: boolean;
  onToken?: (token: string) => void;
  providerOptions?: Record<string, unknown>;
  /** Called when provider recreates engine after abort; core should reset GENERATING state timing */
  onRecreate?: () => void;
}

export interface TokenEvent {
  type: 'token';
  token: string;
  epoch: number;
  seq: number;
}

export interface FinalEvent {
  type: 'final';
  text: string;
  usage?: Usage;
  epoch: number;
  seq: number;
}

export type GenerateStreamEvent = TokenEvent | FinalEvent;

export type GenerateStream = AsyncIterable<GenerateStreamEvent>;

export interface GenerateResult {
  text: string;
  usage?: Usage;
  providerId: ProviderId;
  modelId?: string;
  selectionReportId: string;
}

export interface GenerateResponse {
  stream?: GenerateStream;
  result: Promise<GenerateResult>;
}

/**
 * Default generation parameters. CDC v2026.8 §4.2.2
 */
export const DEFAULT_GENERATE_PARAMS = {
  maxTokens: 256,
  temperature: 0.7,
  topP: 1.0,
  stream: true,
} as const;

/**
 * Clamp temperature to valid range [0, 2]. CDC v2026.8 §17.1
 */
export function clampTemperature(value: number): number {
  return Math.max(0, Math.min(2, value));
}

/**
 * Clamp topP to valid range [0, 1]. CDC v2026.8 §17.1
 */
export function clampTopP(value: number): number {
  return Math.max(0, Math.min(1, value));
}
