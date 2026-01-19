/**
 * UnknownDriver — fallback for unknown native APIs.
 * CDC v2026.8 §8.2
 */

import type { NativeDriver, NativeSession, NativeDriverSupports } from '../types.js';

export class UnknownDriver implements NativeDriver {
  readonly name = 'UnknownDriver';
  readonly supports: NativeDriverSupports = {
    systemRole: false,
    streaming: false,
    downloadProgress: false,
  };

  async detect(): Promise<boolean> {
    return false;
  }

  async canCreateSession(): Promise<boolean> {
    return false;
  }

  async createSession(): Promise<NativeSession> {
    throw new Error('UnknownDriver cannot create sessions');
  }

  async stream(): Promise<{ text: string }> {
    throw new Error('UnknownDriver cannot stream');
  }
}

export function createUnknownDriver(): UnknownDriver {
  return new UnknownDriver();
}
