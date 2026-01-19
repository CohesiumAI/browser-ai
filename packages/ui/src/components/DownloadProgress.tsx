/**
 * DownloadProgress — affiche la progression du téléchargement.
 * Overlay modal avec détails: %, taille, temps restant.
 */

'use client';

import React from 'react';
import { tokens } from './styles.js';

export interface DownloadProgressProps {
  isVisible: boolean;
  status: string;
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  estimatedTimeRemaining?: number | null;
  modelName?: string;
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

export function DownloadProgress({
  isVisible,
  status,
  percent,
  downloadedBytes,
  totalBytes,
  estimatedTimeRemaining,
  modelName,
}: DownloadProgressProps) {
  if (!isVisible) return null;

  const isDownloading = status === 'DOWNLOADING';
  const displayPercent = Math.min(100, Math.max(0, percent));

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.iconContainer}>
          <div style={styles.spinner} />
        </div>
        
        {modelName && (
          <div style={styles.modelBadge}>
            🤖 {modelName}
          </div>
        )}
        
        <h2 style={styles.title}>
          {isDownloading
            ? 'Downloading AI Model'
            : status === 'WARMING_UP'
            ? 'Loading model into memory...'
            : 'Initializing...'}
        </h2>
        
        <p style={styles.subtitle}>
          {isDownloading
            ? 'This may take a few minutes on first use. The model will be cached locally for instant loading next time.'
            : 'Preparing the AI engine...'}
        </p>

        {isDownloading ? (
          <div style={styles.progressSection}>
            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${displayPercent}%`,
                }}
              />
            </div>

            <div style={styles.stats}>
              <span style={styles.percent}>{displayPercent.toFixed(1)}%</span>
              
              {totalBytes > 0 && (
                <span style={styles.size}>
                  {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                </span>
              )}
              
              {estimatedTimeRemaining != null && estimatedTimeRemaining > 0 && (
                <span style={styles.eta}>~{formatTime(estimatedTimeRemaining)} remaining</span>
              )}
            </div>
          </div>
        ) : (
          <div style={styles.pulseContainer}>
            <div style={styles.pulseBar}>
              <div style={styles.pulseAnimation} />
            </div>
          </div>
        )}

        <div style={styles.footer}>
          <div style={styles.footerIcon}>💡</div>
          <p style={styles.note}>
            {isDownloading
              ? 'Tip: Once downloaded, the model runs 100% offline in your browser. No data ever leaves your device.'
              : 'Please wait...'}
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pulse-slide {
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
    backgroundColor: tokens.colors.bg.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  modal: {
    backgroundColor: tokens.colors.bg.primary,
    borderRadius: tokens.radius.xl,
    padding: '32px 40px',
    textAlign: 'center',
    maxWidth: '520px',
    width: '90%',
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
    border: `1px solid ${tokens.colors.border.default}`,
  },
  iconContainer: {
    marginBottom: '20px',
  },
  spinner: {
    width: '56px',
    height: '56px',
    border: `4px solid ${tokens.colors.border.default}`,
    borderTopColor: tokens.colors.accent.primary,
    borderRadius: '50%',
    margin: '0 auto',
    animation: 'spin 1s linear infinite',
  },
  modelBadge: {
    display: 'inline-block',
    backgroundColor: tokens.colors.bg.tertiary,
    color: tokens.colors.text.secondary,
    padding: '6px 14px',
    borderRadius: '20px',
    fontSize: tokens.font.size.sm,
    fontWeight: 500,
    marginBottom: '16px',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: tokens.colors.text.primary,
    margin: '0 0 12px 0',
  },
  subtitle: {
    fontSize: tokens.font.size.md,
    color: tokens.colors.text.secondary,
    margin: '0 0 24px 0',
    lineHeight: 1.6,
  },
  progressSection: {
    marginBottom: tokens.spacing.xl,
  },
  progressBar: {
    height: '12px',
    backgroundColor: tokens.colors.bg.tertiary,
    borderRadius: '6px',
    overflow: 'hidden',
    marginBottom: tokens.spacing.md,
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.colors.accent.primary,
    borderRadius: '6px',
    transition: `width ${tokens.transition.normal}`,
  },
  stats: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  percent: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: tokens.colors.accent.primary,
  },
  size: {
    fontSize: tokens.font.size.sm,
    color: tokens.colors.text.secondary,
  },
  eta: {
    fontSize: tokens.font.size.sm,
    color: tokens.colors.text.secondary,
  },
  pulseContainer: {
    marginBottom: tokens.spacing.xl,
  },
  pulseBar: {
    height: '6px',
    backgroundColor: tokens.colors.bg.tertiary,
    borderRadius: '3px',
    overflow: 'hidden',
  },
  pulseAnimation: {
    height: '100%',
    width: '50%',
    backgroundColor: tokens.colors.accent.primary,
    borderRadius: '3px',
    animation: 'pulse-slide 1.5s ease-in-out infinite',
  },
  footer: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    backgroundColor: tokens.colors.bg.secondary,
    borderRadius: tokens.radius.md,
    padding: '12px 16px',
    marginTop: '8px',
  },
  footerIcon: {
    fontSize: '1.2rem',
    flexShrink: 0,
  },
  note: {
    fontSize: tokens.font.size.sm,
    color: tokens.colors.text.muted,
    lineHeight: 1.5,
    margin: 0,
    textAlign: 'left' as const,
  },
};

export default DownloadProgress;
