/**
 * TypingIndicator — indicateur de frappe animé.
 */

'use client';

import React from 'react';
import { tokens } from './styles.js';

export interface TypingIndicatorProps {
  isVisible: boolean;
}

export function TypingIndicator({ isVisible }: TypingIndicatorProps) {
  if (!isVisible) return null;

  return (
    <div style={styles.container}>
      <div style={styles.avatar}>🤖</div>
      <div style={styles.bubble}>
        <div style={styles.dots}>
          <span style={{ ...styles.dot, animationDelay: '0s' }} />
          <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
          <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
        </div>
      </div>
      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    gap: tokens.spacing.md,
    alignItems: 'flex-start',
  },
  avatar: {
    fontSize: '1.5rem',
    flexShrink: 0,
  },
  bubble: {
    backgroundColor: tokens.colors.bg.secondary,
    borderRadius: tokens.radius.lg,
    padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
  },
  dots: {
    display: 'flex',
    gap: tokens.spacing.xs,
    padding: `${tokens.spacing.sm} 0`,
  },
  dot: {
    width: '8px',
    height: '8px',
    backgroundColor: tokens.colors.accent.primary,
    borderRadius: '50%',
    animation: 'blink 1s infinite',
  },
};

export default TypingIndicator;
