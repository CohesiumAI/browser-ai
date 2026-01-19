/**
 * MessageBubble — affiche un message dans le chat.
 * Composant atomique réutilisable.
 */

'use client';

import React from 'react';
import { tokens } from './styles.js';

export type MessageRole = 'user' | 'assistant' | 'system';
export type MessageStatus = 'final' | 'streaming' | 'aborted' | 'error';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp?: number;
  status?: MessageStatus;
  requestId?: string;
  attachments?: Array<{ type: 'image' | 'pdf'; name: string; url?: string }>;
}

export interface MessageBubbleProps {
  message: Message;
  onSpeak?: (text: string) => void;
  showTimestamp?: boolean;
}

const roleConfig: Record<MessageRole, { avatar: string; align: 'left' | 'right' }> = {
  user: { avatar: '👤', align: 'right' },
  assistant: { avatar: '🤖', align: 'left' },
  system: { avatar: 'ℹ️', align: 'left' },
};

export function MessageBubble({ message, onSpeak, showTimestamp = false }: MessageBubbleProps) {
  const config = roleConfig[message.role];
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: tokens.spacing.md,
        alignItems: 'flex-start',
        opacity: isSystem ? 0.7 : 1,
      }}
    >
      <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>{config.avatar}</div>
      
      <div
        style={{
          maxWidth: '80%',
          backgroundColor: isUser ? tokens.colors.accent.primary : tokens.colors.bg.secondary,
          color: isUser ? '#000' : tokens.colors.text.primary,
          borderRadius: tokens.radius.lg,
          padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
          position: 'relative',
        }}
      >
        {message.attachments && message.attachments.length > 0 && (
          <div style={{ marginBottom: tokens.spacing.sm, display: 'flex', gap: tokens.spacing.xs, flexWrap: 'wrap' }}>
            {message.attachments.map((att, i) => (
              <span
                key={i}
                style={{
                  fontSize: tokens.font.size.xs,
                  backgroundColor: 'rgba(0,0,0,0.2)',
                  padding: `2px ${tokens.spacing.sm}`,
                  borderRadius: tokens.radius.sm,
                }}
              >
                {att.type === 'image' ? '🖼️' : '📄'} {att.name}
              </span>
            ))}
          </div>
        )}

        <div style={{ lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
          {message.content || (message.status === 'streaming' ? '…' : '')}
        </div>

        {message.status === 'aborted' && (
          <div style={{
            fontSize: tokens.font.size.xs,
            color: tokens.colors.text.muted,
            marginTop: tokens.spacing.xs,
            fontStyle: 'italic',
          }}>
            ⏹ Stopped
          </div>
        )}

        {showTimestamp && message.timestamp && (
          <div
            style={{
              fontSize: tokens.font.size.xs,
              color: isUser ? 'rgba(0,0,0,0.5)' : tokens.colors.text.muted,
              marginTop: tokens.spacing.xs,
            }}
          >
            {new Date(message.timestamp).toLocaleTimeString()}
          </div>
        )}

        {message.role === 'assistant' && onSpeak && (
          <button
            onClick={() => onSpeak(message.content)}
            style={{
              position: 'absolute',
              bottom: tokens.spacing.xs,
              right: tokens.spacing.sm,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              opacity: 0.6,
              transition: `opacity ${tokens.transition.fast}`,
            }}
            title="Lire à voix haute"
            aria-label="Lire le message"
          >
            🔊
          </button>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;
