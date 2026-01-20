/**
 * ChatUI — composant de chat complet pour browser-ai.
 * CDC v2026.8 — interface de chat style ChatGPT.
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { UseLocalCompletionResult } from '@cohesiumai/react';
import { DownloadOverlay } from './download-overlay.js';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface ChatUIProps {
  completion: UseLocalCompletionResult;
  welcomeMessage?: string;
  placeholder?: string;
  className?: string;
  onSpeakText?: (text: string) => void;
}

export function ChatUI({
  completion,
  welcomeMessage = 'Bienvenue! Je suis browser-ai, une IA 100% locale. Posez-moi une question!',
  placeholder = 'Écrivez votre message...',
  className = '',
  onSpeakText,
}: ChatUIProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string | null>(null);

  const { state, isReady, init, generate } = completion;
  const isLoading = ['IDLE', 'BOOTING', 'SELECTING_PROVIDER', 'PREFLIGHT_QUOTA', 'CHECKING_CACHE', 'DOWNLOADING', 'WARMING_UP'].includes(state.name);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'system',
        content: welcomeMessage,
        timestamp: Date.now(),
      }]);
    }
  }, [welcomeMessage]);

  useEffect(() => {
    if (isReady && pendingMessageRef.current) {
      const msg = pendingMessageRef.current;
      pendingMessageRef.current = null;
      generateResponse(msg);
    }
  }, [isReady]);

  const generateResponse = useCallback(async (userContent: string) => {
    setIsGenerating(true);
    try {
      const context = messages
        .filter(m => m.role !== 'system')
        .slice(-10)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      context.push({ role: 'user', content: userContent });

      const responseText = await generate({
        messages: context,
        maxTokens: 1024,
        temperature: 0.7,
      });

      setMessages(prev => [...prev, {
        id: 'a-' + Date.now(),
        role: 'assistant',
        content: responseText,
        timestamp: Date.now(),
      }]);
    } catch (err) {
      console.error('Generation error:', err);
      setMessages(prev => [...prev, {
        id: 'e-' + Date.now(),
        role: 'assistant',
        content: 'Erreur de génération. Veuillez réessayer.',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsGenerating(false);
    }
  }, [messages, generate]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isGenerating) return;

    const userContent = input.trim();
    const userMsg: ChatMessage = {
      id: 'u-' + Date.now(),
      role: 'user',
      content: userContent,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');

    if (!hasStarted) {
      setHasStarted(true);
      pendingMessageRef.current = userContent;
      init().catch(console.error);
      return;
    }

    if (!isReady) {
      pendingMessageRef.current = userContent;
      return;
    }

    await generateResponse(userContent);
  }, [input, isGenerating, hasStarted, isReady, init, generateResponse]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const speakText = (text: string) => {
    if (onSpeakText) {
      onSpeakText(text);
    } else {
      const u = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, ''));
      u.lang = 'fr-FR';
      window.speechSynthesis.speak(u);
    }
  };

  const diag = completion.getDiagnostics();
  const modelId = diag?.cache?.modelId || 'Loading...';

  return (
    <div className={`chat-ui ${className}`} style={styles.container}>
      {hasStarted && isLoading && (
        <DownloadOverlay 
          completion={completion} 
          modelName={modelId}
        />
      )}

      <header style={styles.header}>
        <h1 style={styles.title}>🧠 browser-ai</h1>
        <span style={styles.badge}>
          {isReady ? modelId : (hasStarted ? state.name : 'Prêt')}
        </span>
      </header>

      <div style={styles.messages}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            ...styles.message,
            ...(msg.role === 'user' ? styles.userMessage : {}),
            ...(msg.role === 'system' ? styles.systemMessage : {}),
          }}>
            <div style={styles.avatar}>
              {msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : 'ℹ️'}
            </div>
            <div style={styles.messageContent}>
              <div style={styles.messageText}>{msg.content}</div>
              {msg.role === 'assistant' && (
                <button
                  style={styles.speakBtn}
                  onClick={() => speakText(msg.content)}
                  title="Lire à voix haute"
                >
                  🔊
                </button>
              )}
            </div>
          </div>
        ))}

        {isGenerating && (
          <div style={styles.message}>
            <div style={styles.avatar}>🤖</div>
            <div style={styles.messageContent}>
              <div style={styles.typing}>
                <span style={styles.dot} />
                <span style={{ ...styles.dot, animationDelay: '0.2s' }} />
                <span style={{ ...styles.dot, animationDelay: '0.4s' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      <div style={styles.inputArea}>
        <div style={styles.inputRow}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasStarted && !isReady ? 'Chargement du modèle...' : placeholder}
            disabled={isGenerating}
            style={styles.input}
          />
          <button
            onClick={sendMessage}
            disabled={isGenerating || !input.trim()}
            style={{
              ...styles.sendBtn,
              opacity: (isGenerating || !input.trim()) ? 0.5 : 1,
            }}
          >
            Envoyer
          </button>
        </div>
        <div style={styles.footer}>
          🔒 100% local — aucune donnée envoyée
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
    flexDirection: 'column',
    height: '100vh',
    maxWidth: '900px',
    margin: '0 auto',
    backgroundColor: '#212121',
    color: '#ececf1',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    padding: '1rem 2rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #333',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 600,
    margin: 0,
  },
  badge: {
    padding: '0.4rem 1rem',
    backgroundColor: '#2f2f2f',
    borderRadius: '20px',
    fontSize: '0.85rem',
    color: '#4ade80',
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: '1rem 2rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  message: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-start',
  },
  userMessage: {
    flexDirection: 'row-reverse',
  },
  systemMessage: {
    opacity: 0.7,
  },
  avatar: {
    fontSize: '1.5rem',
    flexShrink: 0,
  },
  messageContent: {
    maxWidth: '80%',
    backgroundColor: '#2f2f2f',
    borderRadius: '12px',
    padding: '12px 16px',
    position: 'relative',
  },
  messageText: {
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
  },
  speakBtn: {
    position: 'absolute',
    bottom: '4px',
    right: '8px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1rem',
    opacity: 0.6,
    transition: 'opacity 0.2s',
  },
  typing: {
    display: 'flex',
    gap: '4px',
    padding: '8px 0',
  },
  dot: {
    width: '8px',
    height: '8px',
    backgroundColor: '#4ade80',
    borderRadius: '50%',
    animation: 'blink 1s infinite',
  },
  inputArea: {
    padding: '1rem 2rem',
    borderTop: '1px solid #333',
  },
  inputRow: {
    display: 'flex',
    gap: '12px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    borderRadius: '8px',
    border: '1px solid #444',
    backgroundColor: '#2f2f2f',
    color: '#fff',
    fontSize: '1rem',
    outline: 'none',
  },
  sendBtn: {
    padding: '12px 24px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#4ade80',
    color: '#000',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  footer: {
    textAlign: 'center',
    marginTop: '12px',
    fontSize: '0.85rem',
    color: '#666',
  },
};

export default ChatUI;
