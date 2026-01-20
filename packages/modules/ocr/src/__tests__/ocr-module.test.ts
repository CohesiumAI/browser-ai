/**
 * OCR Module unit tests
 * @cohesiumai/modules-ocr v1.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { OcrModule, OcrConfig } from '../types.js';

vi.mock('tesseract.js', () => {
  return {
    default: {
      createWorker: async () => {
        return {
          recognize: async () => {
            return {
              data: {
                text: 'hello',
                confidence: 100,
                blocks: [],
              },
            };
          },
          terminate: async () => {},
        };
      },
    },
  };
});

vi.mock('pdfjs-dist', () => {
  return {
    version: '5.4.530',
    GlobalWorkerOptions: {
      workerSrc: '',
    },
    getDocument: () => {
      return {
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => {
            return {
              getTextContent: async () => {
                return {
                  items: [{ str: 'A'.repeat(120) }],
                };
              },
              getViewport: () => ({ width: 10, height: 10 }),
              render: () => ({ promise: Promise.resolve() }),
            };
          },
        }),
      };
    },
  };
});

describe('OcrModule', () => {
  let ocrModule: OcrModule;

  const validConfig: OcrConfig = {
    privacyMode: 'fully-local-managed',
    language: 'eng',
    pdf: {
      preferTextLayer: true,
    },
  };

  beforeEach(async () => {
    const { createOcrModule } = await import('../ocr-module.js');
    ocrModule = createOcrModule();
  });

  afterEach(async () => {
    await ocrModule.teardown();
  });

  describe('init()', () => {
    it('should initialize with valid config', async () => {
      await ocrModule.init(validConfig);
      
      const state = ocrModule.getState();
      expect(state.initialized).toBe(true);
      expect(state.backend).toBe('tesseract-wasm');
      expect(state.language).toBe('eng');
    });

    it('should use default language if not specified', async () => {
      await ocrModule.init({ privacyMode: 'fully-local-managed' });
      
      const state = ocrModule.getState();
      expect(state.language).toBe('eng');
    });

    it('should reject non-local privacy mode', async () => {
      const invalidConfig = { privacyMode: 'any' } as OcrConfig;
      
      await expect(ocrModule.init(invalidConfig)).rejects.toMatchObject({
        code: 'ERROR_OCR_INIT_FAILED',
      });
    });
  });

  describe('ocrImage()', () => {
    beforeEach(async () => {
      await ocrModule.init(validConfig);
    });

    it('should process image ArrayBuffer', async () => {
      const imageBuffer = new ArrayBuffer(1000);
      const result = await ocrModule.ocrImage(imageBuffer);
      
      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should process image Blob', async () => {
      const blob = new Blob([new ArrayBuffer(500)], { type: 'image/png' });
      const result = await ocrModule.ocrImage(blob);
      
      expect(result.text).toBeDefined();
    });

    it('should throw if not initialized', async () => {
      const { createOcrModule } = await import('../ocr-module.js');
      const uninitializedModule = createOcrModule();
      const imageBuffer = new ArrayBuffer(100);
      
      await expect(uninitializedModule.ocrImage(imageBuffer)).rejects.toMatchObject({
        code: 'ERROR_OCR_INIT_FAILED',
      });
    });
  });

  describe('ocrPdf()', () => {
    beforeEach(async () => {
      await ocrModule.init(validConfig);
    });

    it('should process PDF ArrayBuffer', async () => {
      const pdfBuffer = new ArrayBuffer(2000);
      const result = await ocrModule.ocrPdf(pdfBuffer);
      
      expect(result.text).toBeDefined();
      expect(result.pages).toBeDefined();
    });

    it('should throw if not initialized', async () => {
      const { createOcrModule } = await import('../ocr-module.js');
      const uninitializedModule = createOcrModule();
      const pdfBuffer = new ArrayBuffer(100);
      
      await expect(uninitializedModule.ocrPdf(pdfBuffer)).rejects.toMatchObject({
        code: 'ERROR_OCR_INIT_FAILED',
      });
    });
  });

  describe('extractChunks()', () => {
    it('should split text into chunks', async () => {
      await ocrModule.init(validConfig);
      
      const longText = 'A'.repeat(3000);
      const chunks = await ocrModule.extractChunks(longText, {
        chunkSizeChars: 1000,
        overlapChars: 100,
      });
      
      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach(chunk => {
        expect(chunk.length).toBeLessThanOrEqual(1000);
      });
    });

    it('should return empty array for empty text', async () => {
      await ocrModule.init(validConfig);
      
      const chunks = await ocrModule.extractChunks('');
      expect(chunks).toEqual([]);
    });

    it('should respect maxChunks limit', async () => {
      await ocrModule.init(validConfig);
      
      const longText = 'A'.repeat(50000);
      const chunks = await ocrModule.extractChunks(longText, {
        chunkSizeChars: 100,
        maxChunks: 5,
      });
      
      expect(chunks.length).toBeLessThanOrEqual(5);
    });
  });

  describe('getDiagnostics()', () => {
    it('should return diagnostics after init', async () => {
      await ocrModule.init(validConfig);
      
      const diagnostics = ocrModule.getDiagnostics();
      expect(diagnostics.enabled).toBe(true);
      expect(diagnostics.backend).toBe('tesseract-wasm');
      expect(diagnostics.language).toBe('eng');
    });
  });

  describe('teardown()', () => {
    it('should reset state after teardown', async () => {
      await ocrModule.init(validConfig);
      await ocrModule.teardown();
      
      const state = ocrModule.getState();
      expect(state.initialized).toBe(false);
    });
  });
});
