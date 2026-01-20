/**
 * Shared styles for @cohesiumai/ui components.
 * Design system tokens and reusable style objects.
 */

import type { CSSProperties } from 'react';

export const tokens = {
  colors: {
    bg: {
      primary: '#212121',
      secondary: '#2f2f2f',
      tertiary: '#3a3a3a',
      overlay: 'rgba(0, 0, 0, 0.85)',
    },
    text: {
      primary: '#ececf1',
      secondary: '#a1a1aa',
      muted: '#71717a',
    },
    accent: {
      primary: '#4ade80',
      secondary: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
    },
    border: {
      default: '#333',
      light: '#444',
    },
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
  },
  font: {
    family: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    size: {
      xs: '0.75rem',
      sm: '0.875rem',
      md: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
    },
  },
  transition: {
    fast: '150ms ease',
    normal: '200ms ease',
    slow: '300ms ease',
  },
} as const;

export const baseStyles: Record<string, CSSProperties> = {
  container: {
    fontFamily: tokens.font.family,
    color: tokens.colors.text.primary,
    backgroundColor: tokens.colors.bg.primary,
  },
  flexCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flexColumn: {
    display: 'flex',
    flexDirection: 'column',
  },
  button: {
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: `opacity ${tokens.transition.fast}`,
  },
  input: {
    border: `1px solid ${tokens.colors.border.light}`,
    backgroundColor: tokens.colors.bg.secondary,
    color: tokens.colors.text.primary,
    fontFamily: 'inherit',
    outline: 'none',
  },
};
