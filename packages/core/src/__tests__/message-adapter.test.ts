/**
 * MessageAdapter tests.
 * CDC v2026.9 §7.1 - normative format
 */

import { describe, it, expect } from 'vitest';
import { flattenSystemPrompts, validateMessages } from '../utils/message-adapter.js';
import type { ChatMessage } from '../types/common.js';

describe('flattenSystemPrompts', () => {
  it('should not modify messages without system role', () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ];

    const result = flattenSystemPrompts(messages);

    expect(result.systemWasFlattened).toBe(false);
    expect(result.messages).toEqual(messages);
  });

  it('should flatten single system message', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ];

    const result = flattenSystemPrompts(messages);

    expect(result.systemWasFlattened).toBe(true);
    expect(result.messages).toHaveLength(1);
    // CDC v2026.9 §7.1: [System]...[/System] format
    expect(result.messages[0]?.content).toBe('[System]\nYou are helpful\n[/System]\n\nHello');
  });

  it('should flatten multiple system messages', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'Rule 1' },
      { role: 'system', content: 'Rule 2' },
      { role: 'user', content: 'Hello' },
    ];

    const result = flattenSystemPrompts(messages);

    expect(result.systemWasFlattened).toBe(true);
    // CDC v2026.9 §7.1: multiple system messages joined with \n\n
    expect(result.messages[0]?.content).toBe('[System]\nRule 1\n\nRule 2\n[/System]\n\nHello');
  });

  it('should throw if no user message exists', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'System only' },
    ];

    expect(() => flattenSystemPrompts(messages)).toThrow();
  });
});

describe('validateMessages', () => {
  it('should pass for valid messages', () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'Hello' }];
    expect(() => validateMessages(messages)).not.toThrow();
  });

  it('should throw for empty array', () => {
    expect(() => validateMessages([])).toThrow();
  });
});
