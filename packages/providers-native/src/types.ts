/**
 * Native provider internal types.
 */

export interface NativeDriverSupports {
  systemRole: boolean;
  streaming: boolean;
  downloadProgress: boolean;
}

export interface NativeSession {
  promptStreaming?: (prompt: string) => AsyncIterable<string>;
  prompt?: (prompt: string) => Promise<string>;
  destroy?: () => void;
}

export interface NativeDriver {
  name: string;
  detect(): Promise<boolean>;
  canCreateSession(): Promise<boolean>;
  createSession(opts?: unknown): Promise<NativeSession>;
  stream(
    session: NativeSession,
    input: string,
    onToken: (token: string) => void
  ): Promise<{ text: string; usage?: { promptTokens?: number; completionTokens?: number } }>;
  getDownloadProgress?(session: NativeSession): { downloadedBytes?: number; totalBytes?: number };
  supports: NativeDriverSupports;
}
