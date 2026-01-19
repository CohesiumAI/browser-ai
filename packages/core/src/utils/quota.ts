/**
 * Quota preflight utilities.
 * CDC v2026.8 §15.1–15.2
 */

const MB = 1024 * 1024;

/**
 * Calculate quota margin per CDC formula.
 * QUOTA_MARGIN_BYTES = min(500MB, max(200MB, model.sizeBytes * 0.10))
 */
export function calculateQuotaMargin(modelSizeBytes: number): number {
  return Math.min(500 * MB, Math.max(200 * MB, Math.floor(modelSizeBytes * 0.1)));
}

export interface QuotaEstimate {
  supported: boolean;
  quotaBytes?: number;
  usageBytes?: number;
  availableBytes?: number;
}

/**
 * Get storage quota estimate.
 */
export async function getQuotaEstimate(): Promise<QuotaEstimate> {
  if (
    typeof navigator === 'undefined' ||
    !('storage' in navigator) ||
    typeof navigator.storage.estimate !== 'function'
  ) {
    return { supported: false };
  }

  try {
    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota ?? 0;
    const usage = estimate.usage ?? 0;
    return {
      supported: true,
      quotaBytes: quota,
      usageBytes: usage,
      availableBytes: quota - usage,
    };
  } catch {
    return { supported: false };
  }
}

/**
 * Check if there's enough quota for a model.
 */
export interface QuotaPreflightResult {
  ok: boolean;
  estimate: QuotaEstimate;
  requiredBytes: number;
  marginBytes: number;
}

export async function checkQuotaPreflight(modelSizeBytes: number): Promise<QuotaPreflightResult> {
  const estimate = await getQuotaEstimate();
  const marginBytes = calculateQuotaMargin(modelSizeBytes);
  const requiredBytes = modelSizeBytes + marginBytes;

  if (!estimate.supported) {
    return { ok: true, estimate, requiredBytes, marginBytes };
  }

  const available = estimate.availableBytes ?? 0;
  return {
    ok: available >= requiredBytes,
    estimate,
    requiredBytes,
    marginBytes,
  };
}

/**
 * Quota attempt record for diagnostics (Option C spec §7).
 */
export interface QuotaAttempt {
  modelId: string;
  sizeBytes: number;
  marginBytes: number;
  requiredBytes: number;
  ok: boolean;
  estimateSupported: boolean;
  availableBytes?: number;
  quotaBytes?: number;
  usageBytes?: number;
}

/**
 * Quota preflight report for diagnostics (Option C spec §7).
 */
export interface QuotaPreflightReport {
  providerId: string;
  attempts: QuotaAttempt[];
  selectedModelId?: string;
}
