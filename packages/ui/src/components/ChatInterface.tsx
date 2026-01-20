/**
 * ChatInterface — interface de chat complète style ChatGPT.
 * Compose tous les composants et intègre les modules browser-ai.
 * 
 * Architecture modulaire: prends ce dont tu as besoin.
 * - Chat LLM: toujours actif
 * - Audio (ASR/TTS): optionnel via enableAudio
 * - OCR: optionnel via enableOcr
 * - Memory: optionnel via enableMemory
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { UseLocalCompletionResult } from '@cohesiumai/react';
import { MessageBubble, type Message } from './MessageBubble.js';
import { InputBar } from './InputBar.js';
import { DownloadProgress } from './DownloadProgress.js';
import { TypingIndicator } from './TypingIndicator.js';
import { tokens } from './styles.js';

export interface ChatInterfaceProps {
  completion: UseLocalCompletionResult;
  title?: string;
  welcomeMessage?: string;
  placeholder?: string;
  enableAudio?: boolean;
  enableOcr?: boolean;
  enableMemory?: boolean;
  onSpeakText?: (text: string) => void;
  onTranscribe?: (blob: Blob) => Promise<string>;
  onProcessFile?: (file: File) => Promise<string>;
  className?: string;
}

export function ChatInterface({
  completion,
  title = '🧠 browser-ai',
  welcomeMessage = 'Welcome! I am browser-ai, a 100% local AI. Send a message to start!',
  placeholder = 'Type your message...',
  enableAudio = true,
  enableOcr = true,
  enableMemory = false,
  onSpeakText,
  onTranscribe,
  onProcessFile,
  className = '',
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState({
    percent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    eta: null as number | null,
  });
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const downloadStartTimeRef = useRef<number | null>(null);

  const { state, isReady, init, generate } = completion;
  const isLoading = ['IDLE', 'BOOTING', 'SELECTING_PROVIDER', 'PREFLIGHT_QUOTA', 'CHECKING_CACHE', 'DOWNLOADING', 'WARMING_UP'].includes(state.name);
  const isDownloading = state.name === 'DOWNLOADING';

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

  useEffect(() => {
    if (!isLoading || !hasStarted) return;

    if (isDownloading && !downloadStartTimeRef.current) {
      downloadStartTimeRef.current = Date.now();
    }

    const interval = setInterval(() => {
      // Read progress directly from state (DownloadingState has downloadedBytes/totalBytes)
      const currentState = state as any;
      const downloaded = currentState.downloadedBytes ?? 0;
      const total = currentState.totalBytes ?? 0;
      const percent = total > 0 ? (downloaded / total) * 100 : 0;

      let eta: number | null = null;
      if (downloadStartTimeRef.current && percent > 0 && percent < 100) {
        const elapsed = (Date.now() - downloadStartTimeRef.current) / 1000;
        const rate = percent / elapsed;
        eta = rate > 0 ? (100 - percent) / rate : null;
      }

      setDownloadInfo({ percent, downloadedBytes: downloaded, totalBytes: total, eta });
    }, 200);

    return () => clearInterval(interval);
  }, [isLoading, hasStarted, isDownloading, state]);

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
        content: `Error: ${err instanceof Error ? err.message : 'Generation failed'}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsGenerating(false);
    }
  }, [messages, generate]);

  const handleSend = useCallback(async (text: string) => {
    const userMsg: Message = {
      id: 'u-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    if (!hasStarted) {
      setHasStarted(true);
      pendingMessageRef.current = text;
      downloadStartTimeRef.current = null;
      init().catch(console.error);
      return;
    }

    if (!isReady) {
      pendingMessageRef.current = text;
      return;
    }

    await generateResponse(text);
  }, [hasStarted, isReady, init, generateResponse]);

  const handleSpeak = useCallback((text: string) => {
    if (onSpeakText) {
      onSpeakText(text);
    } else {
      const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, ''));
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }, [onSpeakText]);

  const handleVoiceStart = useCallback(async () => {
    if (!enableAudio) return;
    
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
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        
        if (onTranscribe) {
          try {
            const text = await onTranscribe(audioBlob);
            if (text.trim()) {
              handleSend(text);
            }
          } catch (err) {
            console.error('Transcription error:', err);
          }
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
    }
  }, [enableAudio, onTranscribe, handleSend]);

  const handleVoiceStop = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const handleAttach = useCallback(async (files: FileList) => {
    if (!enableOcr || !onProcessFile) return;

    for (const file of Array.from(files)) {
      try {
        const extractedText = await onProcessFile(file);
        const attachmentInfo = `[File: ${file.name}]\n${extractedText}`;
        
        const userMsg: Message = {
          id: 'u-' + Date.now(),
          role: 'user',
          content: `Analyze this file:\n${attachmentInfo}`,
          timestamp: Date.now(),
          attachments: [{ type: file.type.includes('pdf') ? 'pdf' : 'image', name: file.name }],
        };
        setMessages(prev => [...prev, userMsg]);

        if (isReady) {
          await generateResponse(userMsg.content);
        }
      } catch (err) {
        console.error('File processing error:', err);
      }
    }
  }, [enableOcr, onProcessFile, isReady, generateResponse]);

  const diag = completion.getDiagnostics();
  const modelId = diag?.cache?.modelId || 'AI';

  return (
    <div className={className} style={styles.container}>
      <DownloadProgress
        isVisible={hasStarted && isLoading}
        status={state.name}
        percent={downloadInfo.percent}
        downloadedBytes={downloadInfo.downloadedBytes}
        totalBytes={downloadInfo.totalBytes}
        estimatedTimeRemaining={downloadInfo.eta}
        modelName={modelId}
      />

      <header style={styles.header}>
        <h1 style={styles.title}>{title}</h1>
        <span style={styles.badge}>
          {isReady ? modelId : hasStarted ? state.name : 'Ready'}
        </span>
      </header>

      <div style={styles.messages}>
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onSpeak={msg.role === 'assistant' ? handleSpeak : undefined}
          />
        ))}
        <TypingIndicator isVisible={isGenerating} />
        <div ref={chatEndRef} />
      </div>

      <InputBar
        onSend={handleSend}
        onVoiceStart={enableAudio && onTranscribe ? handleVoiceStart : undefined}
        onVoiceStop={enableAudio && onTranscribe ? handleVoiceStop : undefined}
        onAttach={enableOcr && onProcessFile ? handleAttach : undefined}
        placeholder={placeholder}
        disabled={false}
        isRecording={isRecording}
        isGenerating={isGenerating}
        showVoice={enableAudio && !!onTranscribe}
        showAttach={enableOcr && !!onProcessFile}
      />
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
    backgroundColor: tokens.colors.bg.primary,
    color: tokens.colors.text.primary,
    fontFamily: tokens.font.family,
  },
  header: {
    padding: `${tokens.spacing.lg} ${tokens.spacing.xl}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: `1px solid ${tokens.colors.border.default}`,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: 600,
    margin: 0,
  },
  badge: {
    padding: `${tokens.spacing.xs} ${tokens.spacing.lg}`,
    backgroundColor: tokens.colors.bg.secondary,
    borderRadius: tokens.radius.full,
    fontSize: tokens.font.size.sm,
    color: tokens.colors.accent.primary,
  },
  messages: {
    flex: 1,
    overflowY: 'auto',
    padding: `${tokens.spacing.lg} ${tokens.spacing.xl}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing.lg,
  },
};

export default ChatInterface;
