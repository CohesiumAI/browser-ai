/**
 * MockProvider — for CI without GPU.
 * CDC v2026.8 §22 + Complément §4.6
 */

import type {
  Provider,
  DetectResult,
  BrowserAIConfig,
  GenerateParams,
  GenerateResult,
  ModelSpec,
  ProviderId,
} from '@browser-ai/core';

export type MockScenario = 'happy' | 'slow' | 'hang' | 'crash' | 'quota';

export interface MockProviderConfig {
  scenario: MockScenario;
  tokensPerSecond?: number;
  firstTokenDelayMs?: number;
  stallAfterTokens?: number;
  mockText?: string;
}

const DEFAULT_MOCK_TEXT = 'This is a mock response from browser-ai MockProvider. It simulates AI generation for testing purposes without requiring a real model or GPU.';

export class MockProvider implements Provider {
  readonly id: ProviderId = 'mock';
  
  private config: MockProviderConfig;
  private aborted = false;
  private initialized = false;

  constructor(config: MockProviderConfig = { scenario: 'happy' }) {
    this.config = config;
  }

  async detect(): Promise<DetectResult> {
    return {
      available: true,
      reason: 'MockProvider always available',
      privacyClaim: 'on-device-claimed',
      supports: {
        streaming: true,
        abort: true,
        systemRole: true,
        downloadProgress: false,
      },
    };
  }

  async init(cfg: BrowserAIConfig, model?: ModelSpec): Promise<void> {
    if (this.config.scenario === 'quota') {
      throw new Error('ERROR_QUOTA_PREFLIGHT_FAIL: Mock quota exceeded');
    }
    this.initialized = true;
    this.aborted = false;
  }

  async generate(
    params: GenerateParams,
    onToken: (token: string) => void
  ): Promise<GenerateResult> {
    if (!this.initialized) {
      throw new Error('MockProvider not initialized');
    }

    this.aborted = false;

    const tokensPerSecond = this.config.tokensPerSecond ?? 
      (this.config.scenario === 'slow' ? 3 : 12);
    const firstDelay = this.config.firstTokenDelayMs ?? 150;
    const stallAfter = this.config.stallAfterTokens ?? 10;
    const mockText = this.config.mockText ?? DEFAULT_MOCK_TEXT;

    await this.delay(firstDelay);

    if (this.aborted) {
      return this.createResult('', params);
    }

    const words = mockText.split(' ');
    const maxTokens = Math.min(params.maxTokens ?? 256, words.length);
    const tokens: string[] = [];

    for (let i = 0; i < maxTokens; i++) {
      if (this.aborted) break;

      if (this.config.scenario === 'crash' && i === 10) {
        throw new Error('ERROR_WORKER_CRASH: Mock crash at token 10');
      }

      if (this.config.scenario === 'hang' && i === stallAfter) {
        await new Promise(() => {});
      }

      const token = (i === 0 ? '' : ' ') + (words[i % words.length] ?? '');
      tokens.push(token);
      onToken(token);

      await this.delay(Math.round(1000 / tokensPerSecond));
    }

    const text = tokens.join('');
    return this.createResult(text, params);
  }

  abort(): void {
    this.aborted = true;
  }

  async teardown(): Promise<void> {
    this.initialized = false;
    this.aborted = false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createResult(text: string, params: GenerateParams): GenerateResult {
    const promptTokens = params.messages.reduce((acc: number, m) => acc + m.content.length / 4, 0);
    const completionTokens = text.length / 4;
    return {
      text,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      providerId: 'mock',
      modelId: 'mock-model',
      selectionReportId: '',
    };
  }
}

export function createMockProvider(config?: MockProviderConfig): MockProvider {
  return new MockProvider(config);
}
