/**
 * Streaming types for ChatGPT-like experience.
 * Spec Option A: bubble assistant streaming with abort support.
 */

export type StreamPhase = 'download' | 'init' | 'warmup' | 'generate';

/**
 * UI-facing streaming event with requestId for correlation.
 * Different from internal GenerateStreamEvent (which has epoch/seq).
 */
export type UIStreamEvent =
  | { type: 'progress'; requestId: string; phase: StreamPhase; percent?: number; text?: string; downloadedBytes?: number; totalBytes?: number }
  | { type: 'token'; requestId: string; token: string }
  | { type: 'final'; requestId: string; text: string; usage?: { completionTokens?: number } }
  | { type: 'aborted'; requestId: string }
  | { type: 'error'; requestId: string; code: 'ERROR_ABORTED' | 'ERROR_OOM' | 'ERROR_MODEL_LOAD' | 'ERROR_UNKNOWN'; message: string };

export interface UIStreamResponse {
  stream: AsyncIterable<UIStreamEvent>;
  result: Promise<{ text: string; usage?: { completionTokens?: number } }>;
}

/**
 * Worker protocol v1 - Main → Worker messages
 */
export type WorkerInMessage =
  | { v: 1; type: 'INIT'; requestId: string; modelId: string }
  | { v: 1; type: 'GENERATE'; requestId: string; messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; maxTokens: number; temperature?: number; topP?: number; stream: boolean }
  | { v: 1; type: 'ABORT'; requestId: string; reason: 'USER' | 'TIMEOUT' }
  | { v: 1; type: 'TEARDOWN'; requestId: string };

/**
 * Worker protocol v1 - Worker → Main messages
 */
export type WorkerOutMessage =
  | { v: 1; type: 'READY'; requestId: string; modelId: string }
  | { v: 1; type: 'PROGRESS'; requestId: string; phase: StreamPhase; percent?: number; text?: string; downloadedBytes?: number; totalBytes?: number }
  | { v: 1; type: 'TOKEN'; requestId: string; token: string }
  | { v: 1; type: 'FINAL'; requestId: string; text: string; usage?: { completionTokens?: number } }
  | { v: 1; type: 'ERROR'; requestId: string; code: 'ERROR_ABORTED' | 'ERROR_OOM' | 'ERROR_MODEL_LOAD' | 'ERROR_UNKNOWN'; message: string };
