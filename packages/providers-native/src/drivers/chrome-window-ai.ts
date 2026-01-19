/**
 * ChromeWindowAiDriver — Chrome's window.ai API.
 * CDC v2026.8 §8
 */

import type { NativeDriver, NativeSession, NativeDriverSupports } from '../types.js';

interface WindowAI {
  languageModel?: {
    capabilities?: () => Promise<{ available: string }>;
    create?: (opts?: unknown) => Promise<NativeSession>;
  };
}

function getWindowAI(): WindowAI | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { ai?: WindowAI }).ai;
}

export class ChromeWindowAiDriver implements NativeDriver {
  readonly name = 'ChromeWindowAiDriver';
  readonly supports: NativeDriverSupports = {
    systemRole: false,
    streaming: true,
    downloadProgress: false,
  };

  async detect(): Promise<boolean> {
    const ai = getWindowAI();
    if (!ai?.languageModel) return false;
    
    try {
      const caps = await ai.languageModel.capabilities?.();
      return caps?.available === 'readily' || caps?.available === 'after-download';
    } catch {
      return false;
    }
  }

  async canCreateSession(): Promise<boolean> {
    return this.detect();
  }

  async createSession(opts?: unknown): Promise<NativeSession> {
    const ai = getWindowAI();
    if (!ai?.languageModel?.create) {
      throw new Error('window.ai.languageModel.create not available');
    }
    return await ai.languageModel.create(opts);
  }

  async stream(
    session: NativeSession,
    input: string,
    onToken: (token: string) => void
  ): Promise<{ text: string; usage?: { promptTokens?: number; completionTokens?: number } }> {
    if (session.promptStreaming) {
      const stream = session.promptStreaming(input);
      let fullText = '';
      let prevChunk = '';

      for await (const chunk of stream) {
        const newContent = chunk.slice(prevChunk.length);
        if (newContent) {
          onToken(newContent);
          fullText += newContent;
        }
        prevChunk = chunk;
      }

      return { text: fullText };
    }

    if (session.prompt) {
      const text = await session.prompt(input);
      onToken(text);
      return { text };
    }

    throw new Error('No prompt method available on session');
  }
}

export function createChromeWindowAiDriver(): ChromeWindowAiDriver {
  return new ChromeWindowAiDriver();
}
