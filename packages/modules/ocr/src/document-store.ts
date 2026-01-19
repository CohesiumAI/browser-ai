/**
 * DocumentStore — Simple local RAG store for OCR'd documents
 * Uses TF-IDF-like scoring for keyword search (no embeddings = fully local)
 * CDC v2026.9 §10 — Pipeline extractif
 */

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentName: string;
  pageNumber?: number;
  text: string;
  tokens: string[]; // Lowercased, normalized tokens for search
}

export interface DocumentMeta {
  id: string;
  name: string;
  type: 'pdf' | 'image' | 'text';
  totalPages?: number;
  totalChunks: number;
  addedAt: number;
}

export interface SearchResult {
  chunk: DocumentChunk;
  score: number;
}

// Stopwords to ignore in search (English + French)
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they',
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'ou', 'mais', 'dans', 'sur', 'à',
  'pour', 'par', 'avec', 'est', 'sont', 'été', 'être', 'avoir', 'fait', 'faire', 'ce', 'cette',
  'qui', 'que', 'quoi', 'dont', 'où', 'il', 'elle', 'nous', 'vous', 'ils', 'elles', 'je', 'tu',
]);

/**
 * Tokenize and normalize text for search
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Keep letters and numbers
    .split(/\s+/)
    .filter(t => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Calculate TF (term frequency) for a token in a document
 */
function tf(token: string, tokens: string[]): number {
  const count = tokens.filter(t => t === token).length;
  return count / tokens.length;
}

/**
 * Calculate IDF (inverse document frequency) for a token across all chunks
 */
function idf(token: string, allChunks: DocumentChunk[]): number {
  const docsWithToken = allChunks.filter(c => c.tokens.includes(token)).length;
  if (docsWithToken === 0) return 0;
  return Math.log(allChunks.length / docsWithToken);
}

export class DocumentStore {
  private chunks: DocumentChunk[] = [];
  private documents: Map<string, DocumentMeta> = new Map();

  /**
   * Add a document's chunks to the store
   */
  addDocument(
    name: string,
    type: 'pdf' | 'image' | 'text',
    textChunks: string[],
    pageNumbers?: number[]
  ): string {
    const documentId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const newChunks: DocumentChunk[] = textChunks.map((text, idx) => ({
      id: `chunk-${documentId}-${idx}`,
      documentId,
      documentName: name,
      pageNumber: pageNumbers?.[idx],
      text,
      tokens: tokenize(text),
    }));

    this.chunks.push(...newChunks);

    this.documents.set(documentId, {
      id: documentId,
      name,
      type,
      totalPages: pageNumbers ? Math.max(...pageNumbers) : undefined,
      totalChunks: newChunks.length,
      addedAt: Date.now(),
    });

    console.log(`[DocumentStore] Added "${name}": ${newChunks.length} chunks`);
    return documentId;
  }

  /**
   * Search for relevant chunks using TF-IDF scoring
   * Falls back to most recent chunks if no keyword match
   */
  search(query: string, topK: number = 5): SearchResult[] {
    if (this.chunks.length === 0) return [];

    const queryTokens = tokenize(query);
    console.log(`[DocumentStore] Search query tokens: [${queryTokens.join(', ')}]`);

    // Try TF-IDF search first
    if (queryTokens.length > 0) {
      const scores: SearchResult[] = this.chunks.map(chunk => {
        let score = 0;

        for (const token of queryTokens) {
          const tfScore = tf(token, chunk.tokens);
          const idfScore = idf(token, this.chunks);
          score += tfScore * idfScore;
        }

        return { chunk, score };
      });

      const results = scores
        .filter(r => r.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      if (results.length > 0) {
        console.log(`[DocumentStore] TF-IDF found ${results.length} results`);
        return results;
      }
    }

    // Fallback: return most recent chunks (useful for short texts or no keyword match)
    console.log(`[DocumentStore] No TF-IDF match, returning ${Math.min(topK, this.chunks.length)} most recent chunks`);
    return this.chunks
      .slice(-topK)
      .reverse()
      .map(chunk => ({ chunk, score: 0.5 }));
  }

  /**
   * Get all chunks for a specific document
   */
  getDocumentChunks(documentId: string): DocumentChunk[] {
    return this.chunks.filter(c => c.documentId === documentId);
  }

  /**
   * Get document metadata
   */
  getDocument(documentId: string): DocumentMeta | undefined {
    return this.documents.get(documentId);
  }

  /**
   * List all documents
   */
  listDocuments(): DocumentMeta[] {
    return Array.from(this.documents.values());
  }

  /**
   * Remove a document and its chunks
   */
  removeDocument(documentId: string): boolean {
    const doc = this.documents.get(documentId);
    if (!doc) return false;

    this.chunks = this.chunks.filter(c => c.documentId !== documentId);
    this.documents.delete(documentId);
    console.log(`[DocumentStore] Removed "${doc.name}"`);
    return true;
  }

  /**
   * Clear all documents
   */
  clear(): void {
    this.chunks = [];
    this.documents.clear();
    console.log('[DocumentStore] Cleared');
  }

  /**
   * Get stats
   */
  getStats(): { documentCount: number; chunkCount: number } {
    return {
      documentCount: this.documents.size,
      chunkCount: this.chunks.length,
    };
  }
}

// Singleton instance for convenience
let _store: DocumentStore | null = null;

export function getDocumentStore(): DocumentStore {
  if (!_store) {
    _store = new DocumentStore();
  }
  return _store;
}

export function createDocumentStore(): DocumentStore {
  return new DocumentStore();
}
