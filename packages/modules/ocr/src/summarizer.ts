/**
 * Local Text Summarizer for OCR documents.
 * CDC v2026.9 §10.3 - Extractive summarization pipeline
 * 
 * Uses TF-IDF based extractive summarization (no external API).
 * For abstractive summarization, integrate with browser-ai LLM.
 */

export interface SummarizerConfig {
  /** Maximum sentences in summary. Default: 5 */
  maxSentences?: number;
  /** Minimum sentence length to consider. Default: 20 */
  minSentenceLength?: number;
  /** Weight for position scoring (earlier = better). Default: 0.3 */
  positionWeight?: number;
  /** Weight for TF-IDF scoring. Default: 0.7 */
  tfidfWeight?: number;
}

export interface SummaryResult {
  summary: string;
  sentences: Array<{
    text: string;
    score: number;
    position: number;
  }>;
  compressionRatio: number;
}

const DEFAULT_MAX_SENTENCES = 5;
const DEFAULT_MIN_SENTENCE_LENGTH = 20;
const DEFAULT_POSITION_WEIGHT = 0.3;
const DEFAULT_TFIDF_WEIGHT = 0.7;

// Common stopwords for TF-IDF
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
  'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
  'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where',
  'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
  'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
  'there', 'then', 'once', 'if', 'because', 'until', 'while', 'about',
  'against', 'between', 'into', 'through', 'during', 'before', 'after',
  'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under', 'again',
  'further', 'any', 'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de',
  'et', 'ou', 'mais', 'dans', 'sur', 'à', 'pour', 'par', 'avec', 'sans',
  'est', 'sont', 'était', 'ont', 'a', 'ce', 'cette', 'ces', 'il', 'elle',
  'nous', 'vous', 'ils', 'elles', 'qui', 'que', 'quoi', 'dont', 'où',
]);

/**
 * Tokenize text into words.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOPWORDS.has(word));
}

/**
 * Split text into sentences.
 */
function splitSentences(text: string): string[] {
  // Split on sentence boundaries
  const sentences = text
    .replace(/([.!?])\s+/g, '$1\n')
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  return sentences;
}

/**
 * Calculate TF-IDF scores for terms in a document.
 */
function calculateTfIdf(sentences: string[]): Map<string, number> {
  const termFreq = new Map<string, number>();
  const docFreq = new Map<string, number>();
  const totalTerms = { count: 0 };

  // Calculate term frequency across all sentences
  for (const sentence of sentences) {
    const tokens = tokenize(sentence);
    const seenInDoc = new Set<string>();
    
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) || 0) + 1);
      totalTerms.count++;
      
      if (!seenInDoc.has(token)) {
        docFreq.set(token, (docFreq.get(token) || 0) + 1);
        seenInDoc.add(token);
      }
    }
  }

  // Calculate TF-IDF
  const tfidf = new Map<string, number>();
  const numDocs = sentences.length;

  for (const [term, tf] of termFreq) {
    const df = docFreq.get(term) || 1;
    const idf = Math.log(numDocs / df);
    tfidf.set(term, (tf / totalTerms.count) * idf);
  }

  return tfidf;
}

/**
 * Score a sentence based on TF-IDF of its terms.
 */
function scoreSentence(
  sentence: string,
  tfidf: Map<string, number>,
  position: number,
  totalSentences: number,
  config: Required<SummarizerConfig>
): number {
  const tokens = tokenize(sentence);
  
  if (tokens.length === 0) return 0;
  
  // TF-IDF score: average of term scores
  let tfidfScore = 0;
  for (const token of tokens) {
    tfidfScore += tfidf.get(token) || 0;
  }
  tfidfScore /= tokens.length;
  
  // Normalize TF-IDF score
  const maxTfidf = Math.max(...Array.from(tfidf.values()));
  if (maxTfidf > 0) {
    tfidfScore /= maxTfidf;
  }
  
  // Position score: favor sentences at beginning and end
  let positionScore: number;
  const relativePos = position / totalSentences;
  if (relativePos < 0.2) {
    // First 20% - high score
    positionScore = 1 - relativePos * 2;
  } else if (relativePos > 0.8) {
    // Last 20% - medium-high score
    positionScore = (relativePos - 0.8) * 2.5;
  } else {
    // Middle - lower score
    positionScore = 0.3;
  }
  
  // Combined score
  return config.tfidfWeight * tfidfScore + config.positionWeight * positionScore;
}

/**
 * Summarize text using extractive TF-IDF method.
 * 100% local, no external API calls.
 */
export function summarize(text: string, config?: SummarizerConfig): SummaryResult {
  const cfg: Required<SummarizerConfig> = {
    maxSentences: config?.maxSentences ?? DEFAULT_MAX_SENTENCES,
    minSentenceLength: config?.minSentenceLength ?? DEFAULT_MIN_SENTENCE_LENGTH,
    positionWeight: config?.positionWeight ?? DEFAULT_POSITION_WEIGHT,
    tfidfWeight: config?.tfidfWeight ?? DEFAULT_TFIDF_WEIGHT,
  };

  // Split into sentences
  const allSentences = splitSentences(text);
  const sentences = allSentences.filter(s => s.length >= cfg.minSentenceLength);
  
  if (sentences.length === 0) {
    return {
      summary: text.slice(0, 500),
      sentences: [],
      compressionRatio: 1,
    };
  }
  
  if (sentences.length <= cfg.maxSentences) {
    return {
      summary: sentences.join(' '),
      sentences: sentences.map((text, i) => ({ text, score: 1, position: i })),
      compressionRatio: 1,
    };
  }
  
  // Calculate TF-IDF
  const tfidf = calculateTfIdf(sentences);
  
  // Score all sentences
  const scoredSentences = sentences.map((text, position) => ({
    text,
    score: scoreSentence(text, tfidf, position, sentences.length, cfg),
    position,
  }));
  
  // Sort by score and take top N
  const topSentences = [...scoredSentences]
    .sort((a, b) => b.score - a.score)
    .slice(0, cfg.maxSentences);
  
  // Re-sort by position to maintain document order
  topSentences.sort((a, b) => a.position - b.position);
  
  const summary = topSentences.map(s => s.text).join(' ');
  
  return {
    summary,
    sentences: topSentences,
    compressionRatio: summary.length / text.length,
  };
}

/**
 * Create a summarizer instance with preset config.
 */
export function createSummarizer(config?: SummarizerConfig) {
  return {
    summarize: (text: string) => summarize(text, config),
    config,
  };
}
