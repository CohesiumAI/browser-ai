/**
 * Models tests — CDC v2026.9 §2.2 (Jinja rejection)
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MODELS,
  getModelById,
  validateChatTemplateFormat,
  type ChatTemplate,
} from '../types/models.js';

describe('DEFAULT_MODELS', () => {
  it('should have nano model with correct CDC spec', () => {
    const nano = DEFAULT_MODELS.nano;
    expect(nano.id).toBe('llama-3.2-1b-instruct-q4f16_1-mlc');
    expect(nano.provider).toBe('webllm');
    expect(nano.hfRepo).toBe('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    expect(nano.tier).toBe(1);
  });

  it('should have standard model with correct CDC spec', () => {
    const standard = DEFAULT_MODELS.standard;
    expect(standard.id).toBe('llama-3.1-8b-instruct-q4f16_1-mlc');
    expect(standard.provider).toBe('webllm');
    expect(standard.hfRepo).toBe('Llama-3.1-8B-Instruct-q4f16_1-MLC');
    expect(standard.tier).toBe(2);
  });
});

describe('getModelById', () => {
  it('should find nano model by lowercase ID', () => {
    const model = getModelById('llama-3.2-1b-instruct-q4f16_1-mlc');
    expect(model).toBeDefined();
    expect(model?.id).toBe(DEFAULT_MODELS.nano.id);
  });

  it('should find standard model by lowercase ID', () => {
    const model = getModelById('llama-3.1-8b-instruct-q4f16_1-mlc');
    expect(model).toBeDefined();
    expect(model?.id).toBe(DEFAULT_MODELS.standard.id);
  });

  it('should normalize MixedCase IDs', () => {
    const model = getModelById('Llama-3.2-1B-Instruct-q4f16_1-MLC');
    expect(model).toBeDefined();
    expect(model?.id).toBe(DEFAULT_MODELS.nano.id);
  });

  it('should return undefined for unknown model', () => {
    const model = getModelById('unknown-model');
    expect(model).toBeUndefined();
  });
});

describe('validateChatTemplateFormat', () => {
  it('should pass for simple format', () => {
    const template: ChatTemplate = { format: 'simple', template: '{user}' };
    expect(() => validateChatTemplateFormat(template)).not.toThrow();
  });

  it('should pass for undefined template', () => {
    expect(() => validateChatTemplateFormat(undefined)).not.toThrow();
  });

  it('should throw ERROR_TEMPLATE_FORMAT_UNSUPPORTED for jinja format', () => {
    const template: ChatTemplate = { format: 'jinja', template: '{{ user }}' };
    expect(() => validateChatTemplateFormat(template)).toThrow();
    
    try {
      validateChatTemplateFormat(template);
    } catch (err: unknown) {
      const error = err as { code: string; message: string };
      expect(error.code).toBe('ERROR_TEMPLATE_FORMAT_UNSUPPORTED');
      expect(error.message).toContain('Jinja');
    }
  });
});
