/**
 * @cohesiumai/modules-memory
 * Local memory module for conversation context and RAG
 * v1.3 - CDC v2026.9 §11
 */

export type {
  MemoryConfig,
  MemoryModule,
  MemoryModuleState,
  MemoryDiagnostics,
  Turn,
  ConversationContext,
  StoredConversation,
  MemoryBackend,
} from './types.js';

export { createMemoryModule } from './memory-module.js';
