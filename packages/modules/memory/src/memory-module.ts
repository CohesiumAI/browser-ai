/**
 * Memory Module implementation for browser-ai v1.3
 * Local conversation context with IndexedDB storage
 * CDC v2026.9 §11
 * 
 * Features:
 * - IndexedDB persistence
 * - Local embeddings via Transformers.js
 * - Semantic search across turns
 * - Rolling summarization
 */

import { BrowserAIError, BrowserAIErrorCode, getGlobalRegistry, type UnifiedModelRegistry } from '@browser-ai/core';
import type {
  MemoryConfig,
  MemoryModule,
  MemoryModuleState,
  MemoryDiagnostics,
  Turn,
  ConversationContext,
  StoredConversation,
  MemoryBackend,
  SearchOptions,
  SearchResult,
} from './types.js';

// Types for dynamic import
type EmbeddingPipeline = (texts: string[], options?: { pooling?: string; normalize?: boolean }) => Promise<{ tolist: () => number[][] }>;

const DEFAULT_MAX_TURNS = 20;
const DEFAULT_SUMMARY_EVERY = 10;
const DB_NAME = 'browser-ai-memory';
const DB_VERSION = 1;
const STORE_NAME = 'conversations';

function createMemoryError(
  code: BrowserAIErrorCode,
  message: string,
  cause?: unknown
): BrowserAIError {
  return {
    code,
    message,
    recoverability: 'recoverable',
    cause: cause instanceof Error ? cause : undefined,
    userAction: 'Please try again. If the problem persists, clear browser storage.',
    devAction: 'Check IndexedDB availability and storage quota.',
    timestampMs: Date.now(),
  };
}

class MemoryModuleImpl implements MemoryModule {
  private initialized = false;
  private backend: MemoryBackend = 'indexeddb';
  private conversationId = '';
  private maxTurns = DEFAULT_MAX_TURNS;
  private summaryEveryTurns = DEFAULT_SUMMARY_EVERY;
  private db: IDBDatabase | null = null;
  private currentConversation: StoredConversation | null = null;
  private embedder: EmbeddingPipeline | null = null;
  private turnEmbeddings: Map<number, number[]> = new Map();
  private registry: UnifiedModelRegistry = getGlobalRegistry();
  private embedderModelId: string | null = null;

  async init(cfg: MemoryConfig): Promise<void> {
    if (cfg.privacyMode !== 'fully-local-managed') {
      throw createMemoryError(
        'ERROR_MEMORY_IDB_FAILED',
        'Memory module requires privacyMode: fully-local-managed'
      );
    }

    this.conversationId = cfg.conversationId;
    this.maxTurns = cfg.maxTurns ?? DEFAULT_MAX_TURNS;
    this.summaryEveryTurns = cfg.summaryEveryTurns ?? DEFAULT_SUMMARY_EVERY;

    try {
      this.db = await this.openDatabase();
      this.currentConversation = await this.loadConversation();
      
      // Initialize local embeddings for semantic search
      await this.initEmbedder();
      
      // Compute embeddings for existing turns
      if (this.currentConversation?.turns.length) {
        await this.computeEmbeddings(this.currentConversation.turns);
      }
      
      this.initialized = true;
      console.log('[MemoryModule] Initialized with embeddings support');
    } catch (err) {
      throw createMemoryError(
        'ERROR_MEMORY_IDB_FAILED',
        'Failed to initialize IndexedDB storage',
        err
      );
    }
  }

  private async initEmbedder(): Promise<void> {
    try {
      const modelId = 'Xenova/all-MiniLM-L6-v2';
      this.embedderModelId = modelId;
      
      // Use registry for shared model management
      this.embedder = await this.registry.acquire(
        modelId,
        'transformers',
        async () => {
          console.log('[MemoryModule] Loading embedder via registry...');
          const transformers = await import('@huggingface/transformers');
          return transformers.pipeline(
            'feature-extraction',
            modelId,
            { device: 'wasm' }
          );
        },
        { sizeEstimateMB: 90 }
      ) as unknown as EmbeddingPipeline;
      
      console.log('[MemoryModule] Embedder loaded via registry: all-MiniLM-L6-v2');
    } catch (err) {
      console.warn('[MemoryModule] Embedder init failed, search will use TF-IDF fallback:', err);
      this.embedder = null;
      this.embedderModelId = null;
    }
  }

  private async computeEmbeddings(turns: Turn[]): Promise<void> {
    if (!this.embedder) return;
    
    for (let i = 0; i < turns.length; i++) {
      if (!this.turnEmbeddings.has(i)) {
        try {
          const result = await this.embedder([turns[i]!.content], { pooling: 'mean', normalize: true });
          const embedding = result.tolist()[0];
          if (embedding) {
            this.turnEmbeddings.set(i, embedding);
          }
        } catch {
          // Skip failed embeddings
        }
      }
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      // Check if IndexedDB is available (for Node.js test environment)
      if (typeof indexedDB === 'undefined') {
        // Mock database for demo/test purposes
        resolve(null as unknown as IDBDatabase);
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  private async loadConversation(): Promise<StoredConversation> {
    if (!this.db) {
      // Return mock conversation for demo/test
      return {
        id: this.conversationId,
        turns: [],
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      };
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(this.conversationId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as StoredConversation | undefined;
        resolve(
          result || {
            id: this.conversationId,
            turns: [],
            createdAtMs: Date.now(),
            updatedAtMs: Date.now(),
          }
        );
      };
    });
  }

  private async saveConversation(): Promise<void> {
    if (!this.db || !this.currentConversation) {
      return;
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(this.currentConversation);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async addTurn(turn: Turn): Promise<void> {
    this.assertInitialized();

    if (!this.currentConversation) {
      throw createMemoryError(
        'ERROR_MEMORY_IDB_FAILED',
        'No active conversation'
      );
    }

    this.currentConversation.turns.push(turn);
    this.currentConversation.updatedAtMs = Date.now();

    // Check if we need to generate a summary
    if (
      this.currentConversation.turns.length > 0 &&
      this.currentConversation.turns.length % this.summaryEveryTurns === 0
    ) {
      await this.generateSummary();
    }

    // Trim old turns if exceeding max
    if (this.currentConversation.turns.length > this.maxTurns) {
      const excessTurns = this.currentConversation.turns.length - this.maxTurns;
      this.currentConversation.turns.splice(0, excessTurns);
    }

    await this.saveConversation();
  }

  private async generateSummary(): Promise<void> {
    if (!this.currentConversation) return;

    const turns = this.currentConversation.turns;
    if (turns.length === 0) return;

    // Extractive summarization: take key turns based on position and length
    const keyTurns: string[] = [];
    
    // Always include first turn for context
    if (turns[0]) {
      keyTurns.push(`${turns[0].role}: ${turns[0].content.slice(0, 200)}`);
    }
    
    // Include recent turns
    const recentStart = Math.max(1, turns.length - 3);
    for (let i = recentStart; i < turns.length; i++) {
      const turn = turns[i];
      if (turn) {
        keyTurns.push(`${turn.role}: ${turn.content.slice(0, 150)}`);
      }
    }
    
    // Build extractive summary
    this.currentConversation.summary = 
      `Conversation with ${turns.length} exchanges.\n` +
      `Key points:\n${keyTurns.join('\n')}`;
    
    console.log(`[MemoryModule] Summary updated: ${this.currentConversation.summary.length} chars`);
  }

  async getContext(): Promise<ConversationContext> {
    this.assertInitialized();

    if (!this.currentConversation) {
      return {
        recentTurns: [],
        totalTurns: 0,
      };
    }

    return {
      summary: this.currentConversation.summary,
      recentTurns: this.currentConversation.turns.slice(-this.maxTurns),
      totalTurns: this.currentConversation.turns.length,
    };
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    this.assertInitialized();

    if (!this.currentConversation || this.currentConversation.turns.length === 0) {
      return [];
    }

    const maxResults = options?.maxResults ?? 5;
    const minScore = options?.minScore ?? 0.3;
    const turns = this.currentConversation.turns;

    // Use embeddings if available, otherwise fall back to TF-IDF
    if (this.embedder && this.turnEmbeddings.size > 0) {
      return this.searchWithEmbeddings(query, turns, maxResults, minScore);
    }
    
    return this.searchWithTfIdf(query, turns, maxResults, minScore);
  }

  private async searchWithEmbeddings(
    query: string,
    turns: Turn[],
    maxResults: number,
    minScore: number
  ): Promise<SearchResult[]> {
    try {
      // Compute query embedding
      const result = await this.embedder!([query], { pooling: 'mean', normalize: true });
      const queryEmbedding = result.tolist()[0];
      
      if (!queryEmbedding) {
        return this.searchWithTfIdf(query, turns, maxResults, minScore);
      }

      // Compute cosine similarity with each turn
      const scored: SearchResult[] = [];
      
      for (let i = 0; i < turns.length; i++) {
        const turnEmbedding = this.turnEmbeddings.get(i);
        if (!turnEmbedding) continue;
        
        const score = this.cosineSimilarity(queryEmbedding, turnEmbedding);
        if (score >= minScore) {
          scored.push({ turn: turns[i]!, score, index: i });
        }
      }

      // Sort by score descending and take top results
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, maxResults);
    } catch (err) {
      console.warn('[MemoryModule] Embedding search failed, using TF-IDF:', err);
      return this.searchWithTfIdf(query, turns, maxResults, minScore);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += (a[i] ?? 0) * (b[i] ?? 0);
      normA += (a[i] ?? 0) ** 2;
      normB += (b[i] ?? 0) ** 2;
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private searchWithTfIdf(
    query: string,
    turns: Turn[],
    maxResults: number,
    minScore: number
  ): SearchResult[] {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const scored: SearchResult[] = [];

    for (let i = 0; i < turns.length; i++) {
      const turnTokens = this.tokenize(turns[i]!.content);
      if (turnTokens.length === 0) continue;

      // Jaccard similarity
      const intersection = queryTokens.filter(t => turnTokens.includes(t)).length;
      const union = new Set([...queryTokens, ...turnTokens]).size;
      const score = intersection / union;

      if (score >= minScore) {
        scored.push({ turn: turns[i]!, score, index: i });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, maxResults);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  async clearConversation(): Promise<void> {
    this.assertInitialized();

    if (!this.currentConversation) return;

    this.currentConversation = {
      id: this.conversationId,
      turns: [],
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };

    await this.saveConversation();
  }

  getState(): MemoryModuleState {
    return {
      initialized: this.initialized,
      backend: this.backend,
      conversationId: this.conversationId,
      turnsCount: this.currentConversation?.turns.length ?? 0,
      hasSummary: !!this.currentConversation?.summary,
    };
  }

  getDiagnostics(): MemoryDiagnostics {
    return {
      enabled: this.initialized,
      backend: this.backend,
      conversationId: this.conversationId,
      turnsStored: this.currentConversation?.turns.length ?? 0,
      summaryLength: this.currentConversation?.summary?.length ?? 0,
    };
  }

  async teardown(): Promise<void> {
    // Release embedder from registry
    if (this.embedderModelId) {
      this.registry.release(this.embedderModelId);
      this.embedderModelId = null;
    }
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.currentConversation = null;
    this.embedder = null;
    this.turnEmbeddings.clear();
    this.initialized = false;
    console.log('[MemoryModule] Teardown complete (models released to registry)');
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw createMemoryError(
        'ERROR_MEMORY_IDB_FAILED',
        'Memory module not initialized. Call init() first.'
      );
    }
  }
}

export function createMemoryModule(): MemoryModule {
  return new MemoryModuleImpl();
}
