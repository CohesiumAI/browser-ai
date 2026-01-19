/**
 * @browser-ai/modules-ocr
 * Local OCR module for image and PDF text extraction
 * v1.2 - CDC v2026.9 §10
 */

export type {
  OcrConfig,
  OcrResult,
  OcrPage,
  OcrModule,
  OcrModuleState,
  OcrDiagnostics,
  ExtractivePipelineConfig,
  OcrBackend,
} from './types.js';

export { createOcrModule } from './ocr-module.js';

export {
  DocumentStore,
  createDocumentStore,
  getDocumentStore,
  type DocumentChunk,
  type DocumentMeta,
  type SearchResult,
} from './document-store.js';

export {
  summarize,
  createSummarizer,
  type SummarizerConfig,
  type SummaryResult,
} from './summarizer.js';
