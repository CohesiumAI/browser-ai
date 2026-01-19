/**
 * AIPopover — minimal UI component.
 * CDC v2026.8 §12.2
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { UseLocalCompletionResult } from '@browser-ai/react';

export interface AIPopoverProps {
  completion: UseLocalCompletionResult;
  placeholder?: string;
  className?: string;
}

export function AIPopover({ completion, placeholder = 'Ask AI...', className = '' }: AIPopoverProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { state, output, isReady, isGenerating, isError, error, init, generate, abort } = completion;

  useEffect(() => {
    if (state.name === 'IDLE') {
      init().catch(console.error);
    }
  }, [state.name, init]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !isReady) return;

    try {
      await generate({
        messages: [{ role: 'user', content: input.trim() }],
      });
    } catch (err) {
      console.error('Generation failed:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const getStatusText = (): string => {
    switch (state.name) {
      case 'IDLE': return 'Initializing...';
      case 'BOOTING': return 'Booting...';
      case 'SELECTING_PROVIDER': return 'Selecting provider...';
      case 'PREFLIGHT_QUOTA': return 'Checking storage...';
      case 'CHECKING_CACHE': return 'Checking cache...';
      case 'DOWNLOADING': return 'Downloading model...';
      case 'WARMING_UP': return 'Loading model... (check console for progress)';
      case 'READY': return 'Ready';
      case 'GENERATING': return 'Generating...';
      case 'ERROR': return `Error: ${error?.message ?? 'Unknown'}`;
      case 'TEARING_DOWN': return 'Shutting down...';
      default: return state.name;
    }
  };

  const isLoading = ['IDLE', 'BOOTING', 'SELECTING_PROVIDER', 'PREFLIGHT_QUOTA', 'CHECKING_CACHE', 'DOWNLOADING', 'WARMING_UP'].includes(state.name);

  return (
    <div className={`ai-popover ${className}`} style={styles.container} data-testid="chat-container">
      <div style={styles.status} aria-live="polite" data-testid="status-badge" className="status-badge">
        {getStatusText()}
      </div>

      {isLoading && (
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 0.4; transform: translateX(-100%); }
              50% { opacity: 1; transform: translateX(100%); }
            }
          `}</style>
        </div>
      )}

      {output && (
        <div style={styles.output} role="log" aria-label="AI response">
          {output}
        </div>
      )}

      <form onSubmit={handleSubmit} style={styles.form}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={false}
          style={styles.textarea}
          aria-label="Message input"
          rows={3}
        />

        <div style={styles.buttons}>
          {isGenerating ? (
            <button
              type="button"
              onClick={abort}
              style={{ ...styles.button, ...styles.stopButton }}
              aria-label="Stop generation"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!isReady || !input.trim()}
              style={styles.button}
              aria-label="Generate response"
            >
              Generate
            </button>
          )}
        </div>
      </form>

      {isError && error && (
        <div style={styles.error} role="alert">
          {error.message}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    borderRadius: '8px',
    border: '1px solid #e0e0e0',
    backgroundColor: '#ffffff',
    fontFamily: 'system-ui, sans-serif',
    maxWidth: '400px',
  },
  status: {
    fontSize: '12px',
    color: '#666',
  },
  progressContainer: {
    width: '100%',
  },
  progressBar: {
    height: '4px',
    backgroundColor: '#e0e0e0',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    width: '50%',
    backgroundColor: '#0066cc',
    borderRadius: '2px',
  },
  output: {
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    fontSize: '14px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    maxHeight: '200px',
    overflow: 'auto',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  textarea: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '14px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  buttons: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: 'none',
    backgroundColor: '#0066cc',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  stopButton: {
    backgroundColor: '#cc0000',
  },
  error: {
    padding: '8px',
    backgroundColor: '#fee',
    borderRadius: '4px',
    color: '#c00',
    fontSize: '12px',
  },
};

export default AIPopover;
