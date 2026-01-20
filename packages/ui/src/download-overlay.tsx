/**
 * DownloadOverlay — affiche la progression du téléchargement du modèle.
 * CDC v2026.8 — composant UI pour feedback utilisateur pendant le téléchargement.
 */

'use client';

import React, { useEffect, useState } from 'react';
import type { UseLocalCompletionResult } from '@cohesiumai/react';

export interface DownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  estimatedTimeRemaining: number | null;
}

export interface DownloadOverlayProps {
  completion: UseLocalCompletionResult;
  modelName?: string;
  onReady?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function DownloadOverlay({ completion, modelName, onReady }: DownloadOverlayProps) {
  const { state } = completion;
  const [progress, setProgress] = useState<DownloadProgress>({
    percent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    estimatedTimeRemaining: null,
  });
  const [startTime, setStartTime] = useState<number | null>(null);

  const isDownloading = state.name === 'DOWNLOADING';
  const isLoading = ['IDLE', 'BOOTING', 'SELECTING_PROVIDER', 'PREFLIGHT_QUOTA', 'CHECKING_CACHE', 'DOWNLOADING', 'WARMING_UP'].includes(state.name);
  const isReady = state.name === 'READY';

  useEffect(() => {
    if (isReady && onReady) {
      onReady();
    }
  }, [isReady, onReady]);

  useEffect(() => {
    if (isDownloading && !startTime) {
      setStartTime(Date.now());
    }
  }, [isDownloading, startTime]);

  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      const diag = completion.getDiagnostics();
      const downloadInfo = (diag as any)?.download;
      
      if (downloadInfo) {
        const percent = downloadInfo.progressPercent ?? 0;
        const downloaded = downloadInfo.downloadedBytes ?? 0;
        const total = downloadInfo.totalBytes ?? 0;

        let eta: number | null = null;
        if (startTime && percent > 0 && percent < 100) {
          const elapsed = (Date.now() - startTime) / 1000;
          const rate = percent / elapsed;
          eta = (100 - percent) / rate;
        }

        setProgress({
          percent,
          downloadedBytes: downloaded,
          totalBytes: total,
          estimatedTimeRemaining: eta,
        });
      }
    }, 200);

    return () => clearInterval(interval);
  }, [isLoading, completion, startTime]);

  if (!isLoading) return null;

  const diag = completion.getDiagnostics();
  const displayModelName = modelName || diag?.cache?.modelId || 'AI Model';

  const getStatusText = (): string => {
    switch (state.name) {
      case 'IDLE': return 'Initialisation...';
      case 'BOOTING': return 'Démarrage...';
      case 'SELECTING_PROVIDER': return 'Sélection du provider...';
      case 'PREFLIGHT_QUOTA': return 'Vérification du stockage...';
      case 'CHECKING_CACHE': return 'Vérification du cache...';
      case 'DOWNLOADING': return `Téléchargement de ${displayModelName}...`;
      case 'WARMING_UP': return 'Chargement du modèle...';
      default: return state.name;
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.spinner} />
        <h2 style={styles.title}>{getStatusText()}</h2>
        
        {isDownloading && (
          <div style={styles.progressSection}>
            <div style={styles.progressBar}>
              <div 
                style={{ 
                  ...styles.progressFill, 
                  width: `${progress.percent}%` 
                }} 
              />
            </div>
            
            <div style={styles.progressStats}>
              <span style={styles.percent}>{progress.percent.toFixed(1)}%</span>
              {progress.totalBytes > 0 && (
                <span style={styles.size}>
                  {formatBytes(progress.downloadedBytes)} / {formatBytes(progress.totalBytes)}
                </span>
              )}
              {progress.estimatedTimeRemaining !== null && progress.estimatedTimeRemaining > 0 && (
                <span style={styles.eta}>
                  ~{formatTime(progress.estimatedTimeRemaining)} restant
                </span>
              )}
            </div>
          </div>
        )}

        {!isDownloading && (
          <div style={styles.pulseContainer}>
            <div style={styles.pulseBar}>
              <div style={styles.pulseAnimation} />
            </div>
          </div>
        )}

        <p style={styles.note}>
          {isDownloading 
            ? 'Premier téléchargement: le modèle sera mis en cache pour les prochaines utilisations.'
            : 'Veuillez patienter...'}
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    backgroundColor: '#1e1e1e',
    borderRadius: '16px',
    padding: '40px',
    textAlign: 'center',
    maxWidth: '480px',
    width: '90%',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #333',
    borderTopColor: '#4ade80',
    borderRadius: '50%',
    margin: '0 auto 24px',
    animation: 'spin 1s linear infinite',
  },
  title: {
    fontSize: '1.25rem',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '24px',
  },
  progressSection: {
    marginBottom: '24px',
  },
  progressBar: {
    height: '12px',
    backgroundColor: '#333',
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: '12px',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4ade80',
    borderRadius: '6px',
    transition: 'width 0.3s ease',
  },
  progressStats: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
  },
  percent: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#4ade80',
  },
  size: {
    fontSize: '0.9rem',
    color: '#888',
  },
  eta: {
    fontSize: '0.9rem',
    color: '#888',
  },
  pulseContainer: {
    marginBottom: '24px',
  },
  pulseBar: {
    height: '6px',
    backgroundColor: '#333',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  pulseAnimation: {
    height: '100%',
    width: '50%',
    backgroundColor: '#4ade80',
    borderRadius: '3px',
    animation: 'pulse 1.5s ease-in-out infinite',
  },
  note: {
    fontSize: '0.85rem',
    color: '#666',
    lineHeight: 1.5,
  },
};

export default DownloadOverlay;
