/**
 * ChatApp — Full-featured chat application with multi-conversation support.
 * Includes: TTS, ASR, file attachments, OCR, and conversation management.
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import type { UseLocalCompletionResult } from '@browser-ai/react';
import { ConversationSidebar, type Conversation } from './ConversationSidebar.js';
import { MessageBubble, type Message } from './MessageBubble.js';
import { DownloadProgress } from './DownloadProgress.js';
import { TypingIndicator } from './TypingIndicator.js';
import { tokens } from './styles.js';

export interface ChatAppProps {
  completion: UseLocalCompletionResult;
  title?: string;
  welcomeMessage?: string;
  placeholder?: string;
  enableTTS?: boolean;
  enableASR?: boolean;
  enableOCR?: boolean;
  enableFileAttach?: boolean;
  /** Process file and return display text (e.g., "[PDF: file.pdf]") */
  onProcessFile?: (file: File) => Promise<string>;
  /** Get RAG context for a query (returns relevant document chunks) */
  onGetContext?: (query: string) => Promise<string>;
  /** Custom actions to render in the header (e.g., settings button, clear cache) */
  headerActions?: React.ReactNode;
  className?: string;
}

interface ConversationData extends Conversation {
  messages: Message[];
}

// Generate conversation title from first user message
function generateTitle(messages: Message[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (firstUserMsg) {
    const text = firstUserMsg.content.slice(0, 30);
    return text.length < firstUserMsg.content.length ? text + '...' : text;
  }
  return 'New Chat';
}

export function ChatApp({
  completion,
  title = 'browser-ai',
  welcomeMessage = 'Welcome! I am browser-ai, a 100% local AI. Send a message to start!',
  placeholder = 'Type your message...',
  enableTTS = true,
  enableASR = true,
  enableOCR = true,
  enableFileAttach = true,
  onProcessFile,
  onGetContext,
  headerActions,
  className = '',
}: ChatAppProps) {
  // Conversation management
  const [conversations, setConversations] = useState<ConversationData[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Chat state
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [downloadInfo, setDownloadInfo] = useState({
    percent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    eta: null as number | null,
  });
  // Error tracking for status badge
  const [lastError, setLastError] = useState<string | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const downloadStartTimeRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Smoothed ETA: simple moving average of last N samples
  const etaSamplesRef = useRef<number[]>([]);
  const lastPercentRef = useRef<number>(0);
  // Ref for generateResponse to avoid initialization order issues
  const generateResponseRef = useRef<((content: string, assistantMsgId: string) => Promise<void>) | null>(null);
  // Generation epoch to prevent race conditions when aborting and starting new generation
  const generationEpochRef = useRef<number>(0);

  const { state, isReady, init, generate, generateWithCallbacks, abort } = completion;
  const isLoading = ['IDLE', 'BOOTING', 'SELECTING_PROVIDER', 'PREFLIGHT_QUOTA', 'CHECKING_CACHE', 'DOWNLOADING', 'WARMING_UP'].includes(state.name);
  const isDownloading = state.name === 'DOWNLOADING';

  // Get active conversation
  const activeConv = conversations.find(c => c.id === activeConvId);
  const messages = activeConv?.messages || [];

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize first conversation
  useEffect(() => {
    if (conversations.length === 0) {
      handleCreateConversation();
    }
  }, []);

  // Track download progress with smoothed ETA (simple moving average)
  useEffect(() => {
    if (!isLoading || !hasStarted) return;

    if (isDownloading && !downloadStartTimeRef.current) {
      downloadStartTimeRef.current = Date.now();
      etaSamplesRef.current = [];
      lastPercentRef.current = 0;
    }

    const MAX_SAMPLES = 10; // Keep last 10 ETA samples for averaging
    const interval = setInterval(() => {
      const currentState = state as any;
      const downloaded = currentState.downloadedBytes ?? 0;
      const total = currentState.totalBytes ?? 0;
      const percent = total > 0 ? (downloaded / total) * 100 : 0;

      let eta: number | null = null;

      // Calculate ETA based on elapsed time and progress
      if (downloadStartTimeRef.current && percent > 0.5 && percent < 100) {
        const elapsedSec = (Date.now() - downloadStartTimeRef.current) / 1000;
        const remainingPercent = 100 - percent;
        
        // Raw ETA: time_elapsed / percent_done * percent_remaining
        const rawEta = (elapsedSec / percent) * remainingPercent;

        // Only update samples when percent actually changes
        if (percent > lastPercentRef.current + 0.1) {
          etaSamplesRef.current.push(rawEta);
          if (etaSamplesRef.current.length > MAX_SAMPLES) {
            etaSamplesRef.current.shift();
          }
          lastPercentRef.current = percent;
        }

        // Use average of samples for stable ETA
        if (etaSamplesRef.current.length > 0) {
          const sum = etaSamplesRef.current.reduce((a, b) => a + b, 0);
          eta = sum / etaSamplesRef.current.length;
        } else {
          eta = rawEta;
        }
      }

      setDownloadInfo({ percent, downloadedBytes: downloaded, totalBytes: total, eta });
    }, 200);

    return () => clearInterval(interval);
  }, [isLoading, hasStarted, isDownloading, state]);

  // Process pending message when ready (uses ref to avoid initialization order issues)
  useEffect(() => {
    if (isReady && pendingMessageRef.current && generateResponseRef.current) {
      const pending = pendingMessageRef.current;
      pendingMessageRef.current = null;
      try {
        const { content, assistantMsgId } = JSON.parse(pending);
        generateResponseRef.current(content, assistantMsgId);
      } catch {
        console.warn('[ChatApp] Invalid pending message format');
      }
    }
  }, [isReady]);

  // Conversation handlers
  const handleCreateConversation = useCallback(() => {
    const uniqueId = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const newConv: ConversationData = {
      id: 'conv-' + uniqueId,
      title: 'New Chat',
      createdAt: Date.now(),
      messageCount: 0,
      messages: [{
        id: 'welcome-' + uniqueId,
        role: 'system',
        content: welcomeMessage,
        timestamp: Date.now(),
      }],
    };
    setConversations(prev => [newConv, ...prev]);
    setActiveConvId(newConv.id);
  }, [welcomeMessage]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConvId(id);
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations(prev => {
      const filtered = prev.filter(c => c.id !== id);
      if (activeConvId === id && filtered.length > 0 && filtered[0]) {
        setActiveConvId(filtered[0].id);
      } else if (filtered.length === 0) {
        handleCreateConversation();
      }
      return filtered;
    });
  }, [activeConvId, handleCreateConversation]);

  const handleRenameConversation = useCallback((id: string, newTitle: string) => {
    setConversations(prev => prev.map(c => 
      c.id === id ? { ...c, title: newTitle } : c
    ));
  }, []);

  // Update messages for active conversation
  const updateActiveMessages = useCallback((updater: (msgs: Message[]) => Message[]) => {
    setConversations(prev => prev.map(c => {
      if (c.id !== activeConvId) return c;
      const newMessages = updater(c.messages);
      const newTitle = c.title === 'New Chat' ? generateTitle(newMessages) : c.title;
      return { ...c, messages: newMessages, messageCount: newMessages.length, title: newTitle };
    }));
  }, [activeConvId]);

  // Generate response with streaming Option A (bubble assistant mise à jour en place)
  const generateResponse = useCallback(async (userContent: string, assistantMsgId: string) => {
    // Capture current epoch to detect if this generation was superseded
    const myEpoch = generationEpochRef.current;
    try {
      // Get RAG context if available
      let ragContext = '';
      if (onGetContext) {
        try {
          ragContext = await onGetContext(userContent);
          console.log('[ChatApp] RAG context retrieved:', ragContext ? `${ragContext.length} chars` : 'empty');
        } catch (err) {
          console.warn('[ChatApp] RAG context retrieval failed:', err);
        }
      }

      // Build message context (exclude the streaming assistant placeholder)
      // Note: userContent is already in messages (added by handleSend before calling generateResponse)
      const context: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
      
      // Add system prompt for proper model behavior
      context.push({
        role: 'system',
        content: 'You are a helpful, friendly AI assistant. Provide clear and concise answers.',
      });
      
      // Add conversation history (exclude system welcome message and assistant placeholder)
      const history = messages
        .filter(m => m.role !== 'system' && m.id !== assistantMsgId)
        .slice(-6)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      
      context.push(...history);

      // Ensure the current user message is present as the last turn.
      // In some cases (flushSync + stale closures), `messages` may not include the latest user message yet.
      const last = context[context.length - 1];
      if (!last || last.role !== 'user' || last.content !== userContent) {
        context.push({ role: 'user', content: userContent });
      }

      // Inject RAG context if available (modify the last user message)
      if (ragContext && context.length > 0) {
        // Remove last user message to replace it with RAG-augmented version
        const lastUserMsg = context.pop();
        if (lastUserMsg && lastUserMsg.role === 'user') {
          context.push({
            role: 'user',
            content: `[Document Context]\n${ragContext}\n[End Context]\n\nBased on the document context above, please answer: ${lastUserMsg.content}`,
          });
        } else if (lastUserMsg) {
          // Put it back if it wasn't a user message
          context.push(lastUserMsg);
        }
      }

      // Use generateWithCallbacks for streaming Option A
      await generateWithCallbacks(
        {
          messages: context,
          maxTokens: 1024,
          temperature: 0.7,
        },
        {
          onToken: (token: string) => {
            // Update assistant bubble content in place
            updateActiveMessages(prev => prev.map(m => 
              m.id === assistantMsgId 
                ? { ...m, content: m.content + token }
                : m
            ));
          },
          onFinal: (text: string) => {
            // Mark as final
            updateActiveMessages(prev => prev.map(m => 
              m.id === assistantMsgId 
                ? { ...m, status: 'final' as const }
                : m
            ));
          },
          onAborted: () => {
            // Mark as aborted (keep partial text)
            updateActiveMessages(prev => prev.map(m => 
              m.id === assistantMsgId 
                ? { ...m, status: 'aborted' as const }
                : m
            ));
          },
          onError: (err: Error) => {
            const errorMsg = err.message;
            // Check if abort error
            if (errorMsg.includes('ERROR_ABORTED') || errorMsg.includes('aborted')) {
              updateActiveMessages(prev => prev.map(m => 
                m.id === assistantMsgId 
                  ? { ...m, status: 'aborted' as const }
                  : m
              ));
            } else {
              setLastError(errorMsg);
              updateActiveMessages(prev => prev.map(m => 
                m.id === assistantMsgId 
                  ? { ...m, content: `Error: ${errorMsg}`, status: 'error' as const }
                  : m
              ));
            }
          },
        }
      );
    } catch (err) {
      // Catch-all for unexpected errors (not abort)
      const errorMsg = err instanceof Error ? err.message : 'Generation failed';
      if (!errorMsg.includes('ERROR_ABORTED') && !errorMsg.includes('aborted')) {
        console.error('Generation error:', err);
        setLastError(errorMsg);
        updateActiveMessages(prev => prev.map(m => 
          m.id === assistantMsgId 
            ? { ...m, content: `Error: ${errorMsg}`, status: 'error' as const }
            : m
        ));
      }
    } finally {
      // Only clear isGenerating if this generation is still the current one
      if (generationEpochRef.current === myEpoch) {
        setIsGenerating(false);
      }
    }
  }, [messages, generateWithCallbacks, updateActiveMessages, onGetContext]);

  // Update ref for pending message processing
  generateResponseRef.current = generateResponse;

  // Send message
  const handleSend = useCallback(async () => {
    const input = inputRef.current;
    if (!input) return;
    
    const text = input.value.trim();
    if (!text && attachedFiles.length === 0) return;

    // Auto-abort current generation if one is in progress (ChatGPT-style UX)
    if (isGenerating) {
      // Increment epoch so the aborted generation's finally won't clear isGenerating
      generationEpochRef.current++;
      try {
        abort();
      } catch {
        // Ignore abort errors
      }
      // Don't setIsGenerating(false) here - the new generation will take over
    }

    // Capture files before clearing
    const filesToProcess = [...attachedFiles];
    setAttachedFiles([]);
    input.value = '';

    // Process attached files
    let fileContent = '';
    if (filesToProcess.length > 0 && onProcessFile) {
      for (const file of filesToProcess) {
        if (!file) continue;
        try {
          const content = await onProcessFile(file);
          fileContent += `\n[File: ${file.name}]\n${content}\n`;
        } catch (err) {
          console.error('File processing error:', err);
        }
      }
    }

    const fullContent = text + fileContent;

    const userMsg: Message = {
      id: 'u-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      role: 'user',
      content: fullContent,
      timestamp: Date.now(),
      attachments: filesToProcess.length > 0 ? filesToProcess.map(f => ({ type: f.type.startsWith('image') ? 'image' as const : 'pdf' as const, name: f.name })) : undefined,
    };

    // Create assistant placeholder for streaming Option A
    const assistantMsgId = 'a-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const assistantPlaceholder: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    };

    // flushSync forces immediate DOM update so user sees their message + assistant placeholder instantly
    flushSync(() => {
      updateActiveMessages(prev => [...prev, userMsg, assistantPlaceholder]);
      setIsGenerating(true);
    });

    if (!hasStarted) {
      setHasStarted(true);
      pendingMessageRef.current = JSON.stringify({ content: fullContent, assistantMsgId });
      downloadStartTimeRef.current = null;
      init().catch(console.error);
      return;
    }

    if (!isReady) {
      pendingMessageRef.current = JSON.stringify({ content: fullContent, assistantMsgId });
      return;
    }

    // Use ref to always call the latest generateResponse (avoids stale `messages` closure after flushSync)
    await generateResponseRef.current?.(fullContent, assistantMsgId);
  }, [attachedFiles, hasStarted, isReady, isGenerating, init, abort, generateResponse, updateActiveMessages, onProcessFile]);

  // TTS
  const handleSpeak = useCallback((text: string) => {
    if (!enableTTS) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, ''));
    utterance.lang = 'en-US';
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [enableTTS]);

  const handleStopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // ASR
  const handleVoiceStart = useCallback(async () => {
    if (!enableASR) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        
        // Use Web Speech API for transcription (browser-native, no external deps)
        try {
          const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (!SpeechRecognition) {
            console.warn('[ChatApp] Web Speech API not supported');
            return;
          }
          // Note: Web Speech API works in real-time, not on recorded audio
          // For recorded audio, we'd need a server or local model
          // For now, just log that recording stopped
          console.log('[ChatApp] Recording stopped, audio captured:', audioChunksRef.current.length, 'chunks');
        } catch (err) {
          console.error('[ChatApp] Speech recognition error:', err);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, [enableASR]);

  const handleVoiceStop = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  // File attachment
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      // Capture files BEFORE clearing input (FileList is a live reference)
      const newFiles = Array.from(e.target.files);
      console.log('[ChatApp] Files selected:', newFiles.map(f => f.name));
      setAttachedFiles(prev => {
        const updated = [...prev, ...newFiles];
        console.log('[ChatApp] Updated attachedFiles:', updated.length);
        return updated;
      });
      // Clear input after capturing
      e.target.value = '';
    }
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Stop generation
  const handleStop = useCallback(() => {
    if (isGenerating) {
      abort();
      setIsGenerating(false);
    }
  }, [isGenerating, abort]);

  // Key handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const diag = completion.getDiagnostics();
  const modelId = diag?.cache?.modelId || 'AI';

  return (
    <div className={className} style={styles.appContainer} data-testid="chat-container" role="main">
      <ConversationSidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onCreate={handleCreateConversation}
        onDelete={handleDeleteConversation}
        onRename={handleRenameConversation}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div style={styles.mainPanel}>
        <DownloadProgress
          isVisible={hasStarted && isLoading}
          status={state.name}
          percent={downloadInfo.percent}
          downloadedBytes={downloadInfo.downloadedBytes}
          totalBytes={downloadInfo.totalBytes}
          estimatedTimeRemaining={downloadInfo.eta}
          modelName={modelId}
        />

        <header style={styles.header} className="chat-header">
          <div style={styles.headerLeft}>
            <span style={styles.logo}>🧠</span>
            <h1 style={styles.title} className="chat-title">{title}</h1>
          </div>
          <div style={styles.headerRight}>
            {headerActions}
            {(() => {
              // Check for errors: either from lastError state or FSM error state
              const fsmError = state.name.includes('ERROR') ? (state as any).error?.message || state.name : null;
              const errorMessage = lastError || fsmError;
              const hasError = errorMessage !== null;
              const statusText = isGenerating ? 'Generating...' : isReady ? modelId : hasStarted ? state.name : 'Ready';
              const badgeStyle = {
                ...styles.badge,
                ...(hasError ? { backgroundColor: '#ef4444', cursor: 'pointer' } : {}),
                ...(isGenerating ? { backgroundColor: tokens.colors.accent.primary } : {}),
              };
              const handleBadgeClick = () => {
                if (hasError && errorMessage) {
                  setLastError(errorMessage);
                  setShowErrorModal(true);
                }
              };
              return (
                <span
                  style={badgeStyle}
                  onClick={hasError ? handleBadgeClick : undefined}
                  title={hasError ? 'Click to view error details' : undefined}
                  data-testid="status-badge"
                  className="status-badge"
                >
                  {hasError ? '⚠️ Error' : statusText}
                </span>
              );
            })()}
            {enableTTS && isSpeaking && (
              <button onClick={handleStopSpeaking} style={styles.stopSpeakButton} title="Stop speaking">
                🔇
              </button>
            )}
          </div>
        </header>

        <div style={styles.messagesContainer} data-testid="messages" role="log" className="chat-messages">
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onSpeak={enableTTS && msg.role === 'assistant' ? handleSpeak : undefined}
            />
          ))}
          <TypingIndicator isVisible={isGenerating} />
          <div ref={chatEndRef} />
        </div>

        <div style={styles.inputArea}>
          {/* Attached files preview */}
          {attachedFiles.length > 0 && (
            <div style={styles.attachedFilesBar}>
              {attachedFiles.map((file, idx) => (
                <div key={idx} style={styles.attachedFile}>
                  <span style={styles.fileIcon}>📄</span>
                  <span style={styles.fileName}>{file.name}</span>
                  <button onClick={() => handleRemoveFile(idx)} style={styles.removeFileBtn}>×</button>
                </div>
              ))}
            </div>
          )}

          <div style={styles.inputRow} className="chat-input-row">
            {enableFileAttach && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={styles.iconButton}
                  title="Attach file"
                >
                  📎
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt,.md"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                  multiple
                  data-testid="file-upload"
                />
              </>
            )}

            <input
              ref={inputRef}
              type="text"
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              style={styles.input}
            />

            {enableASR && (
              <button
                onClick={isRecording ? handleVoiceStop : handleVoiceStart}
                style={{
                  ...styles.iconButton,
                  backgroundColor: isRecording ? tokens.colors.accent.error : 'transparent',
                  color: isRecording ? '#fff' : tokens.colors.text.primary,
                }}
                title={isRecording ? 'Stop recording' : 'Start recording'}
              >
                {isRecording ? '⏹️' : '🎤'}
              </button>
            )}

            <button
              onClick={isGenerating ? handleStop : handleSend}
              style={{
                ...styles.sendButton,
                ...(isGenerating ? styles.stopButton : {}),
              }}
              aria-label={isGenerating ? 'Stop generation' : 'Send message'}
            >
              {isGenerating ? <span style={styles.stopIcon} /> : 'Send'}
            </button>
          </div>

          <div style={styles.footer}>🔒 100% local — no data sent</div>
        </div>
      </div>

      {/* Error Modal */}
      {showErrorModal && lastError && (
        <div style={styles.modalOverlay} onClick={() => setShowErrorModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={styles.modalTitle}>⚠️ Error Details</span>
              <button 
                onClick={() => setShowErrorModal(false)} 
                style={styles.modalCloseButton}
              >
                ✕
              </button>
            </div>
            <div style={styles.modalBody}>
              <pre style={styles.errorText}>{lastError}</pre>
            </div>
            <div style={styles.modalFooter}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(lastError);
                  alert('Error copied to clipboard');
                }}
                style={styles.copyButton}
              >
                📋 Copy Error
              </button>
              <button
                onClick={() => {
                  setLastError(null);
                  setShowErrorModal(false);
                }}
                style={styles.dismissButton}
              >
                Dismiss Error
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Responsive CSS */}
      <style>{`
        @media (max-width: 768px) {
          [data-testid="chat-container"] {
            flex-direction: column;
          }
          [data-testid="chat-container"] > div:first-child {
            position: fixed;
            z-index: 100;
            height: 100%;
          }
        }
        .chat-header-mobile {
          padding: 8px 12px !important;
        }
        @media (max-width: 480px) {
          .chat-input-row {
            gap: 8px !important;
          }
          .chat-input-row input {
            padding: 10px 12px !important;
            font-size: 16px !important;
          }
          .chat-send-btn {
            min-width: 44px !important;
            padding: 10px !important;
          }
          .chat-messages {
            padding: 12px !important;
          }
          .chat-header {
            padding: 8px 12px !important;
          }
          .chat-title {
            font-size: 1rem !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    display: 'flex',
    height: '100%',
    width: '100%',
    backgroundColor: tokens.colors.bg.primary,
    fontFamily: tokens.font.family,
    color: tokens.colors.text.primary,
  },
  mainPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacing.md} ${tokens.spacing.xl}`,
    borderBottom: `1px solid ${tokens.colors.border.default}`,
    backgroundColor: tokens.colors.bg.secondary,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  logo: {
    fontSize: '1.5rem',
  },
  title: {
    margin: 0,
    fontSize: tokens.font.size.lg,
    fontWeight: 600,
  },
  badge: {
    fontSize: tokens.font.size.xs,
    padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
    backgroundColor: tokens.colors.accent.primary,
    color: '#000',
    borderRadius: tokens.radius.full,
    fontWeight: 500,
  },
  stopSpeakButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: tokens.spacing.sm,
  },
  messagesContainer: {
    flex: 1,
    overflowY: 'auto',
    padding: tokens.spacing.xl,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing.md,
  },
  inputArea: {
    padding: tokens.spacing.lg,
    borderTop: `1px solid ${tokens.colors.border.default}`,
    backgroundColor: tokens.colors.bg.secondary,
  },
  attachedFilesBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    marginBottom: tokens.spacing.md,
  },
  attachedFile: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    padding: `${tokens.spacing.xs} ${tokens.spacing.md}`,
    backgroundColor: tokens.colors.bg.tertiary,
    borderRadius: tokens.radius.md,
    fontSize: tokens.font.size.sm,
  },
  fileIcon: {
    fontSize: '0.9rem',
  },
  fileName: {
    maxWidth: '150px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  removeFileBtn: {
    background: 'none',
    border: 'none',
    color: tokens.colors.text.secondary,
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0 2px',
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
    backgroundColor: tokens.colors.bg.primary,
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
    transition: `all ${tokens.transition.fast}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '80px',
    minHeight: '44px',
  },
  stopButton: {
    backgroundColor: tokens.colors.accent.error,
    padding: tokens.spacing.md,
    minWidth: '44px',
  },
  stopIcon: {
    display: 'block',
    width: '14px',
    height: '14px',
    backgroundColor: '#fff',
    borderRadius: '2px',
  },
  footer: {
    textAlign: 'center',
    marginTop: tokens.spacing.md,
    fontSize: tokens.font.size.sm,
    color: tokens.colors.text.muted,
  },
  // Error Modal styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: tokens.colors.bg.secondary,
    borderRadius: tokens.radius.lg,
    border: `1px solid ${tokens.colors.border.default}`,
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacing.lg,
    borderBottom: `1px solid ${tokens.colors.border.default}`,
  },
  modalTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: 600,
    color: '#ef4444',
  },
  modalCloseButton: {
    background: 'none',
    border: 'none',
    color: tokens.colors.text.secondary,
    cursor: 'pointer',
    fontSize: '1.2rem',
    padding: tokens.spacing.sm,
  },
  modalBody: {
    padding: tokens.spacing.lg,
    overflowY: 'auto',
    flex: 1,
  },
  errorText: {
    backgroundColor: tokens.colors.bg.primary,
    padding: tokens.spacing.md,
    borderRadius: tokens.radius.md,
    fontSize: tokens.font.size.sm,
    color: tokens.colors.text.primary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    margin: 0,
    fontFamily: 'monospace',
  },
  modalFooter: {
    display: 'flex',
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
    borderTop: `1px solid ${tokens.colors.border.default}`,
    justifyContent: 'flex-end',
  },
  copyButton: {
    padding: `${tokens.spacing.sm} ${tokens.spacing.lg}`,
    borderRadius: tokens.radius.md,
    border: `1px solid ${tokens.colors.border.default}`,
    backgroundColor: tokens.colors.bg.tertiary,
    color: tokens.colors.text.primary,
    cursor: 'pointer',
    fontSize: tokens.font.size.sm,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  dismissButton: {
    padding: `${tokens.spacing.sm} ${tokens.spacing.lg}`,
    borderRadius: tokens.radius.md,
    border: 'none',
    backgroundColor: '#ef4444',
    color: '#fff',
    cursor: 'pointer',
    fontSize: tokens.font.size.sm,
    fontWeight: 500,
  },
};

export default ChatApp;
