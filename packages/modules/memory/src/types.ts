/**
 * Memory module types for browser-ai v1.3
 * CDC v2026.9 §11.3
 */

export type MemoryBackend = 'indexeddb';

export interface MemoryConfig {
  privacyMode: 'fully-local-managed';
  conversationId: string;
  maxTurns?: number;
  summaryEveryTurns?: number;
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
  createdAtMs: number;
}

export interface ConversationContext {
  summary?: string;
  recentTurns: Turn[];
  totalTurns: number;
}

export interface StoredConversation {
  id: string;
  turns: Turn[];
  summary?: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface MemoryModuleState {
  initialized: boolean;
  backend: MemoryBackend;
  conversationId: string;
  turnsCount: number;
  hasSummary: boolean;
}

export interface MemoryDiagnostics {
  enabled: boolean;
  backend?: MemoryBackend;
  conversationId?: string;
  turnsStored?: number;
  summaryLength?: number;
  storageUsedBytes?: number;
}

export interface SearchOptions {
  maxResults?: number;
  minScore?: number;
}

export interface SearchResult {
  turn: Turn;
  score: number;
  index: number;
}

export interface MemoryModule {
  init(cfg: MemoryConfig): Promise<void>;
  addTurn(turn: Turn): Promise<void>;
  getContext(): Promise<ConversationContext>;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
  clearConversation(): Promise<void>;
  getState(): MemoryModuleState;
  getDiagnostics(): MemoryDiagnostics;
  teardown(): Promise<void>;
}
