/**
 * NativeProvider — uses browser's native AI APIs.
 * CDC v2026.8 §8
 */

import type {
  Provider,
  DetectResult,
  BrowserAIConfig,
  GenerateParams,
  GenerateResult,
  ModelSpec,
  ProviderId,
  ChatMessage,
} from '@cohesiumai/core';

import { NativeShim } from './native-shim.js';
import type { NativeDriver, NativeSession } from './types.js';

export class NativeProvider implements Provider {
  readonly id: ProviderId = 'native';

  private shim: NativeShim;
  private driver: NativeDriver | null = null;
  private session: NativeSession | null = null;
  private aborted = false;

  constructor(shim?: NativeShim) {
    this.shim = shim ?? new NativeShim();
  }

  async detect(): Promise<DetectResult> {
    const driver = await this.shim.detectDriver();

    if (!driver) {
      return {
        available: false,
        reason: 'No native AI driver detected',
      };
    }

    return {
      available: true,
      reason: `Detected ${driver.name}`,
      privacyClaim: 'unknown',
      supports: {
        streaming: driver.supports.streaming,
        abort: true,
        systemRole: driver.supports.systemRole,
        downloadProgress: driver.supports.downloadProgress,
      },
    };
  }

  async init(cfg: BrowserAIConfig, model?: ModelSpec): Promise<void> {
    this.driver = await this.shim.detectDriver();

    if (!this.driver) {
      throw new Error('No native AI driver available');
    }

    this.session = await this.driver.createSession(cfg.providerOptions);
    this.aborted = false;
  }

  async generate(
    params: GenerateParams,
    onToken: (token: string) => void
  ): Promise<GenerateResult> {
    if (!this.driver || !this.session) {
      throw new Error('NativeProvider not initialized');
    }

    this.aborted = false;

    const prompt = this.formatPrompt(params.messages, this.driver.supports.systemRole);

    const result = await this.driver.stream(this.session, prompt, (token) => {
      if (!this.aborted) {
        onToken(token);
      }
    });

    return {
      text: result.text,
      usage: result.usage ? {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: (result.usage.promptTokens ?? 0) + (result.usage.completionTokens ?? 0),
      } : undefined,
      providerId: 'native',
      modelId: this.driver.name,
      selectionReportId: '',
    };
  }

  abort(): void {
    this.aborted = true;
  }

  async teardown(): Promise<void> {
    if (this.session?.destroy) {
      this.session.destroy();
    }
    this.session = null;
    this.driver = null;
    this.aborted = false;
  }

  /**
   * Format messages into a prompt string.
   * Flattens system messages if driver doesn't support systemRole.
   * CDC v2026.8 §8.3
   */
  private formatPrompt(messages: ChatMessage[], supportsSystemRole: boolean): string {
    if (supportsSystemRole) {
      return messages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    }

    const systemMessages = messages.filter((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    if (systemMessages.length === 0) {
      return nonSystemMessages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    }

    const systemBlock = systemMessages.map((m) => m.content).join('\n\n---\n\n');
    const firstUserIdx = nonSystemMessages.findIndex((m) => m.role === 'user');

    if (firstUserIdx === -1) {
      return `[System]\n${systemBlock}\n\n` + 
        nonSystemMessages.map((m) => `${m.role}: ${m.content}`).join('\n\n');
    }

    const before = nonSystemMessages.slice(0, firstUserIdx);
    const firstUser = nonSystemMessages[firstUserIdx]!;
    const after = nonSystemMessages.slice(firstUserIdx + 1);

    const flattenedFirst = `[System]\n${systemBlock}\n\n[User]\n${firstUser.content}`;

    const parts = [
      ...before.map((m) => `${m.role}: ${m.content}`),
      flattenedFirst,
      ...after.map((m) => `${m.role}: ${m.content}`),
    ];

    return parts.join('\n\n');
  }
}

export function createNativeProvider(shim?: NativeShim): NativeProvider {
  return new NativeProvider(shim);
}
