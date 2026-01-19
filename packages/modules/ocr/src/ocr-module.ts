/**
 * OCR Module implementation for browser-ai v1.2
 * Local-only OCR for images and PDFs using Tesseract.js WASM
 * CDC v2026.9 §10
 */

import Tesseract from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import { BrowserAIError, BrowserAIErrorCode } from '@browser-ai/core';
import type {
  OcrConfig,
  OcrResult,
  OcrModule,
  OcrModuleState,
  OcrDiagnostics,
  ExtractivePipelineConfig,
  OcrBackend,
  OcrBlock,
  OcrLine,
  OcrWord,
  OcrBoundingBox,
} from './types.js';

// Configure PDF.js worker - use unpkg CDN which has the correct file
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_OVERLAP = 150;
const DEFAULT_MAX_CHUNKS = 200;
const DEFAULT_LANGUAGE = 'eng';

function createOcrError(
  code: BrowserAIErrorCode,
  message: string,
  cause?: unknown
): BrowserAIError {
  return {
    code,
    message,
    recoverability: 'non-recoverable',
    cause: cause instanceof Error ? cause : undefined,
    userAction: 'Please try again or use a different file format.',
    devAction: 'Check OCR module initialization and input format.',
    timestampMs: Date.now(),
  };
}

class OcrModuleImpl implements OcrModule {
  private initialized = false;
  private backend: OcrBackend = 'tesseract-wasm';
  private language = DEFAULT_LANGUAGE;
  private pdfTextLayerPreferred = true;
  private lastLatencyMs = 0;
  private pagesProcessed = 0;
  private worker: Tesseract.Worker | null = null;

  async init(cfg: OcrConfig): Promise<void> {
    if (cfg.privacyMode !== 'fully-local-managed') {
      throw createOcrError(
        'ERROR_OCR_INIT_FAILED',
        'OCR module requires privacyMode: fully-local-managed'
      );
    }

    this.language = cfg.language || DEFAULT_LANGUAGE;
    this.pdfTextLayerPreferred = cfg.pdf?.preferTextLayer ?? true;

    try {
      // Initialize Tesseract.js worker with specified language
      this.worker = await Tesseract.createWorker(this.language, 1, {
        logger: (m: Tesseract.LoggerMessage) => {
          if (m.status === 'recognizing text') {
            console.log(`[OCR] Progress: ${Math.round(m.progress * 100)}%`);
          }
        },
      });
      console.log(`[OCR] Tesseract worker initialized for language: ${this.language}`);
    } catch (err) {
      throw createOcrError(
        'ERROR_OCR_INIT_FAILED',
        `Failed to initialize Tesseract worker: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }

    this.initialized = true;
  }

  async ocrImage(input: Blob | ArrayBuffer): Promise<OcrResult> {
    this.assertInitialized();

    const startTime = performance.now();

    try {
      // Convert ArrayBuffer to Blob if needed (Tesseract prefers Blob/File/URL)
      const imageBlob = input instanceof Blob 
        ? input 
        : new Blob([input], { type: 'image/png' });

      // Perform OCR using Tesseract.js with full block/line/word data
      const result = await this.worker!.recognize(imageBlob);

      // Extract blocks with bounding boxes
      const blocks = this.extractBlocks(result.data);

      const ocrResult: OcrResult = {
        text: result.data.text,
        blocks,
        confidence: result.data.confidence / 100,
        durationMs: performance.now() - startTime,
      };

      this.lastLatencyMs = ocrResult.durationMs || 0;
      this.pagesProcessed += 1;

      console.log(`[OCR] Image processed: ${ocrResult.text.length} chars, confidence: ${(ocrResult.confidence! * 100).toFixed(1)}%`);

      return ocrResult;
    } catch (err) {
      throw createOcrError(
        'ERROR_OCR_INIT_FAILED',
        `OCR failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  }

  async ocrPdf(input: Blob | ArrayBuffer): Promise<OcrResult> {
    this.assertInitialized();

    const startTime = performance.now();

    const pdfData = input instanceof Blob 
      ? await input.arrayBuffer() 
      : input;

    // Try to extract text layer first if preferred
    if (this.pdfTextLayerPreferred) {
      const textLayerResult = await this.tryExtractPdfTextLayer(pdfData);
      if (textLayerResult && textLayerResult.text.trim().length > 50) {
        this.lastLatencyMs = performance.now() - startTime;
        console.log(`[OCR] PDF text layer extracted: ${textLayerResult.text.length} chars`);
        return {
          ...textLayerResult,
          durationMs: this.lastLatencyMs,
        };
      }
    }

    // Fallback to OCR: render each page and OCR
    try {
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const numPages = pdf.numPages;
      const pages: Array<{ page: number; text: string; confidence: number }> = [];
      let fullText = '';
      let totalConfidence = 0;

      console.log(`[OCR] PDF has ${numPages} pages, performing OCR...`);

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale = better OCR

        // Create canvas for rendering
        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;

        await page.render({
          canvasContext: context as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;

        // Convert canvas to blob and OCR
        const blob = await canvas.convertToBlob({ type: 'image/png' });
        const result = await this.worker!.recognize(blob);

        pages.push({
          page: i,
          text: result.data.text,
          confidence: result.data.confidence / 100,
        });

        fullText += result.data.text + '\n\n';
        totalConfidence += result.data.confidence;

        console.log(`[OCR] Page ${i}/${numPages} done`);
      }

      const ocrResult: OcrResult = {
        text: fullText.trim(),
        pages,
        confidence: totalConfidence / numPages / 100,
        durationMs: performance.now() - startTime,
      };

      this.lastLatencyMs = ocrResult.durationMs || 0;
      this.pagesProcessed += numPages;

      return ocrResult;
    } catch (err) {
      throw createOcrError(
        'ERROR_OCR_INIT_FAILED',
        `PDF OCR failed: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  }

  private async tryExtractPdfTextLayer(
    pdfData: ArrayBuffer
  ): Promise<OcrResult | null> {
    try {
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const numPages = pdf.numPages;
      const pages: Array<{ page: number; text: string; confidence: number }> = [];
      let fullText = '';

      for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ');

        if (pageText.trim()) {
          pages.push({
            page: i,
            text: pageText,
            confidence: 1.0, // Text layer = 100% confidence
          });
          fullText += pageText + '\n\n';
        }
      }

      // If we got substantial text, return it
      if (fullText.trim().length > 50) {
        this.pagesProcessed += numPages;
        return {
          text: fullText.trim(),
          pages,
          confidence: 1.0,
        };
      }

      return null;
    } catch (err) {
      console.warn('[OCR] PDF text layer extraction failed:', err);
      return null;
    }
  }

  async extractChunks(
    text: string,
    cfg?: ExtractivePipelineConfig
  ): Promise<string[]> {
    const chunkSize = cfg?.chunkSizeChars ?? DEFAULT_CHUNK_SIZE;
    const overlap = cfg?.overlapChars ?? DEFAULT_OVERLAP;
    const maxChunks = cfg?.maxChunks ?? DEFAULT_MAX_CHUNKS;

    if (!text || text.length === 0) {
      return [];
    }

    const chunks: string[] = [];
    let startIndex = 0;

    while (startIndex < text.length && chunks.length < maxChunks) {
      const endIndex = Math.min(startIndex + chunkSize, text.length);
      let chunk = text.slice(startIndex, endIndex);

      // Try to break at sentence boundary if possible
      if (endIndex < text.length) {
        const lastPeriod = chunk.lastIndexOf('.');
        const lastNewline = chunk.lastIndexOf('\n');
        const breakPoint = Math.max(lastPeriod, lastNewline);
        
        if (breakPoint > chunkSize * 0.5) {
          chunk = chunk.slice(0, breakPoint + 1);
        }
      }

      chunks.push(chunk.trim());
      startIndex += chunk.length - overlap;

      // Prevent infinite loop
      if (startIndex <= 0 && chunks.length > 0) {
        break;
      }
    }

    return chunks;
  }

  getState(): OcrModuleState {
    return {
      initialized: this.initialized,
      backend: this.backend,
      language: this.language,
      pdfTextLayerPreferred: this.pdfTextLayerPreferred,
    };
  }

  getDiagnostics(): OcrDiagnostics {
    return {
      enabled: this.initialized,
      backend: this.backend,
      language: this.language,
      lastLatencyMs: this.lastLatencyMs,
      pagesProcessed: this.pagesProcessed,
    };
  }

  async teardown(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      console.log('[OCR] Tesseract worker terminated');
    }

    this.initialized = false;
    this.lastLatencyMs = 0;
    this.pagesProcessed = 0;
  }

  private assertInitialized(): void {
    if (!this.initialized || !this.worker) {
      throw createOcrError(
        'ERROR_OCR_INIT_FAILED',
        'OCR module not initialized. Call init() first.'
      );
    }
  }

  /**
   * Extract structured blocks with bounding boxes from Tesseract result.
   * CDC v2026.9 §10.2 - blocks/lines/words with bbox
   */
  private extractBlocks(data: Tesseract.Page): OcrBlock[] {
    const blocks: OcrBlock[] = [];

    if (!data.blocks) return blocks;

    for (const block of data.blocks) {
      const lines: OcrLine[] = [];

      if (block.paragraphs) {
        for (const para of block.paragraphs) {
          if (para.lines) {
            for (const line of para.lines) {
              const words: OcrWord[] = [];

              if (line.words) {
                for (const word of line.words) {
                  words.push({
                    text: word.text,
                    confidence: word.confidence / 100,
                    bbox: {
                      x: word.bbox.x0,
                      y: word.bbox.y0,
                      width: word.bbox.x1 - word.bbox.x0,
                      height: word.bbox.y1 - word.bbox.y0,
                    },
                  });
                }
              }

              lines.push({
                text: line.text,
                confidence: line.confidence / 100,
                bbox: {
                  x: line.bbox.x0,
                  y: line.bbox.y0,
                  width: line.bbox.x1 - line.bbox.x0,
                  height: line.bbox.y1 - line.bbox.y0,
                },
                words,
              });
            }
          }
        }
      }

      blocks.push({
        text: block.text,
        confidence: block.confidence / 100,
        bbox: {
          x: block.bbox.x0,
          y: block.bbox.y0,
          width: block.bbox.x1 - block.bbox.x0,
          height: block.bbox.y1 - block.bbox.y0,
        },
        lines,
        blockType: 'text',
      });
    }

    return blocks;
  }
}

export function createOcrModule(): OcrModule {
  return new OcrModuleImpl();
}
