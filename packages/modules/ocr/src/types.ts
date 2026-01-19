/**
 * OCR module types for browser-ai v1.2
 * CDC v2026.9 §10.2
 */

export type OcrBackend = 'tesseract-wasm';

export interface OcrConfig {
  privacyMode: 'fully-local-managed';
  language?: string;
  pdf?: {
    preferTextLayer?: boolean;
  };
}

export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
  words: OcrWord[];
}

export interface OcrBlock {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
  lines: OcrLine[];
  blockType: 'text' | 'image' | 'table' | 'unknown';
}

export interface OcrPage {
  page: number;
  text: string;
  confidence?: number;
  blocks?: OcrBlock[];
  width?: number;
  height?: number;
}

export interface OcrResult {
  text: string;
  pages?: OcrPage[];
  blocks?: OcrBlock[];
  confidence?: number;
  durationMs?: number;
}

export interface ExtractivePipelineConfig {
  chunkSizeChars?: number;
  overlapChars?: number;
  maxChunks?: number;
}

export interface OcrModuleState {
  initialized: boolean;
  backend: OcrBackend;
  language: string;
  pdfTextLayerPreferred: boolean;
}

export interface OcrDiagnostics {
  enabled: boolean;
  backend?: OcrBackend;
  language?: string;
  lastLatencyMs?: number;
  pagesProcessed?: number;
}

export interface OcrModule {
  init(cfg: OcrConfig): Promise<void>;
  ocrImage(input: Blob | ArrayBuffer): Promise<OcrResult>;
  ocrPdf(input: Blob | ArrayBuffer): Promise<OcrResult>;
  extractChunks(text: string, cfg?: ExtractivePipelineConfig): Promise<string[]>;
  getState(): OcrModuleState;
  getDiagnostics(): OcrDiagnostics;
  teardown(): Promise<void>;
}
