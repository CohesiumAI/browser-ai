/**
 * MessageAdapter — normalize messages between providers.
 * CDC v2026.8 §8.3 + §12
 */

import type { ChatMessage } from '../types/common.js';
import { createError } from '../types/errors.js';

export interface FlattenedMessages {
  messages: ChatMessage[];
  systemWasFlattened: boolean;
}

/**
 * Flatten system prompts into the first user message.
 * Used when provider doesn't support system role.
 * 
 * Format (CDC v2026.9 §7.1 - normative):
 * [System]
 * {system_prompt}
 * [/System]
 * 
 * {first_user_message}
 */
export function flattenSystemPrompts(messages: ChatMessage[]): FlattenedMessages {
  const systemMessages = messages.filter((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  if (systemMessages.length === 0) {
    return { messages, systemWasFlattened: false };
  }

  const firstUserIndex = nonSystemMessages.findIndex((m) => m.role === 'user');
  if (firstUserIndex === -1) {
    throw createError(
      'ERROR_INVALID_INPUT_EMPTY_MESSAGES',
      'Cannot flatten system prompt: no user message found',
      { userAction: 'Add at least one user message', recoverability: 'non-recoverable' }
    );
  }

  const systemBlock = systemMessages.map((m) => m.content).join('\n\n');
  const firstUser = nonSystemMessages[firstUserIndex]!;

  // CDC v2026.9 §7.1 deterministic format
  const flattenedContent = `[System]\n${systemBlock}\n[/System]\n\n${firstUser.content}`;

  const result: ChatMessage[] = [
    ...nonSystemMessages.slice(0, firstUserIndex),
    { role: 'user', content: flattenedContent },
    ...nonSystemMessages.slice(firstUserIndex + 1),
  ];

  return { messages: result, systemWasFlattened: true };
}

/**
 * Validate messages array.
 */
export function validateMessages(messages: ChatMessage[]): void {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw createError(
      'ERROR_INVALID_INPUT_EMPTY_MESSAGES',
      'messages array must not be empty',
      { userAction: 'Provide at least one message', recoverability: 'non-recoverable' }
    );
  }
}
