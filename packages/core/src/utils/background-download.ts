/**
 * Background Download Helper — Prevents browser throttling during model downloads.
 * Uses Web Locks API to keep the tab active and prevent network request throttling.
 * CDC v2026.8 §5.4 extension
 */

/**
 * Acquire a Web Lock to prevent browser from throttling the tab.
 * Returns a release function to call when download is complete.
 */
export async function acquireDownloadLock(): Promise<() => void> {
  // Check if Web Locks API is available
  if (typeof navigator === 'undefined' || !('locks' in navigator)) {
    console.log('[background-download] Web Locks API not available');
    return () => {};
  }

  let releaseLock: (() => void) | null = null;
  const lockPromise = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  // Acquire lock with a unique name
  const lockName = `browser-ai-download-${Date.now()}`;
  
  navigator.locks.request(lockName, { mode: 'exclusive' }, async () => {
    console.log('[background-download] Lock acquired - tab will stay active');
    await lockPromise;
    console.log('[background-download] Lock released');
  }).catch(() => {
    // Lock request failed or was aborted
  });

  return () => {
    if (releaseLock) {
      releaseLock();
    }
  };
}

/**
 * Monitor page visibility and trigger callback when tab becomes visible again.
 * Useful for retry logic after background throttling.
 */
export function onVisibilityChange(callback: (isVisible: boolean) => void): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const handler = () => {
    callback(document.visibilityState === 'visible');
  };

  document.addEventListener('visibilitychange', handler);
  return () => document.removeEventListener('visibilitychange', handler);
}

/**
 * Check if the page is currently visible.
 */
export function isPageVisible(): boolean {
  if (typeof document === 'undefined') {
    return true;
  }
  return document.visibilityState === 'visible';
}

/**
 * Wrapper that acquires a lock during an async operation.
 * Automatically releases the lock when the operation completes.
 */
export async function withDownloadLock<T>(operation: () => Promise<T>): Promise<T> {
  const releaseLock = await acquireDownloadLock();
  try {
    return await operation();
  } finally {
    releaseLock();
  }
}
