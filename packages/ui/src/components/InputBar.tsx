/**
 * InputBar — barre de saisie avec boutons d'action.
 * Composant composable pour le chat.
 */

'use client';

import React, { useState, useRef, useCallback } from 'react';
import { tokens } from './styles.js';

export interface InputBarProps {
  onSend: (text: string) => void;
  onVoiceStart?: () => void;
  onVoiceStop?: () => void;
  onAttach?: (files: FileList) => void;
  placeholder?: string;
  disabled?: boolean;
  isRecording?: boolean;
  isGenerating?: boolean;
  showVoice?: boolean;
  showAttach?: boolean;
  acceptFileTypes?: string;
}

export function InputBar({
  onSend,
  onVoiceStart,
  onVoiceStop,
  onAttach,
  placeholder = 'Écrivez votre message...',
  disabled = false,
  isRecording = false,
  isGenerating = false,
  showVoice = true,
  showAttach = true,
  acceptFileTypes = 'image/*,.pdf',
}: InputBarProps) {
  const [input, setInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(() => {
    if (!input.trim() || disabled || isGenerating) return;
    onSend(input.trim());
    setInput('');
  }, [input, disabled, isGenerating, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onAttach) {
      onAttach(e.target.files);
      e.target.value = '';
    }
  };

  const handleVoiceClick = () => {
    if (isRecording) {
      onVoiceStop?.();
    } else {
      onVoiceStart?.();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.inputRow}>
        {showAttach && onAttach && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              style={styles.iconButton}
              disabled={disabled}
              title="Joindre un fichier"
              aria-label="Joindre un fichier"
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptFileTypes}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              multiple
            />
          </>
        )}

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isGenerating ? 'Génération en cours...' : placeholder}
          disabled={disabled || isGenerating}
          style={{
            ...styles.input,
            opacity: disabled ? 0.5 : 1,
          }}
          aria-label="Message input"
        />

        {showVoice && (onVoiceStart || onVoiceStop) && (
          <button
            onClick={handleVoiceClick}
            style={{
              ...styles.iconButton,
              backgroundColor: isRecording ? tokens.colors.accent.error : 'transparent',
              color: isRecording ? '#fff' : tokens.colors.text.primary,
            }}
            disabled={disabled}
            title={isRecording ? 'Arrêter' : 'Enregistrer'}
            aria-label={isRecording ? 'Arrêter enregistrement' : 'Démarrer enregistrement'}
          >
            {isRecording ? '⏹️' : '🎤'}
          </button>
        )}

        <button
          onClick={handleSend}
          disabled={disabled || isGenerating || !input.trim()}
          style={{
            ...styles.sendButton,
            opacity: disabled || isGenerating || !input.trim() ? 0.5 : 1,
          }}
          aria-label="Send"
        >
          {isGenerating ? '⏳' : 'Send'}
        </button>
      </div>

      <div style={styles.footer}>🔒 100% local — no data sent</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: tokens.spacing.lg,
    borderTop: `1px solid ${tokens.colors.border.default}`,
  },
  inputRow: {
    display: 'flex',
    gap: tokens.spacing.md,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
    borderRadius: tokens.radius.md,
    border: `1px solid ${tokens.colors.border.light}`,
    backgroundColor: tokens.colors.bg.secondary,
    color: tokens.colors.text.primary,
    fontSize: tokens.font.size.md,
    fontFamily: 'inherit',
    outline: 'none',
  },
  iconButton: {
    width: '40px',
    height: '40px',
    borderRadius: tokens.radius.md,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    fontSize: '1.2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: `all ${tokens.transition.fast}`,
  },
  sendButton: {
    padding: `${tokens.spacing.md} ${tokens.spacing.xl}`,
    borderRadius: tokens.radius.md,
    border: 'none',
    backgroundColor: tokens.colors.accent.primary,
    color: '#000',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: tokens.font.size.md,
    transition: `opacity ${tokens.transition.fast}`,
  },
  footer: {
    textAlign: 'center',
    marginTop: tokens.spacing.md,
    fontSize: tokens.font.size.sm,
    color: tokens.colors.text.muted,
  },
};

export default InputBar;
