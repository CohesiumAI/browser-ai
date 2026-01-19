/**
 * Provider selection logic.
 * CDC v2026.8 §11
 */

import type { ProviderId, PrivacyMode } from '../types/common.js';
import type { BrowserAIConfig } from '../types/config.js';
import type { Provider, DetectResult } from '../types/provider.js';
import type { SelectionReport, SelectionReportEntry } from '../types/diagnostics.js';
import { newSelectionReportId } from '../utils/uuid.js';

export interface ProviderRegistry {
  get(id: ProviderId): Provider | undefined;
  getAll(): Provider[];
}

export interface SelectionResult {
  provider: Provider | null;
  report: SelectionReport;
}

/**
 * Select a provider based on policy order and constraints.
 */
export async function selectProvider(
  config: BrowserAIConfig,
  registry: ProviderRegistry
): Promise<SelectionResult> {
  const { providerPolicy, privacyMode = 'any' } = config;
  const { order, constraints } = providerPolicy;

  const report: SelectionReport = {
    id: newSelectionReportId(),
    createdAtMs: Date.now(),
    policyOrder: order,
    reasons: [],
  };

  for (const providerId of order) {
    const provider = registry.get(providerId);

    if (!provider) {
      console.log(`[provider-selector] ${providerId}: not registered`);
      report.reasons.push({
        providerId,
        ok: false,
        reason: 'UNSUPPORTED',
        details: { message: 'Provider not registered' },
      });
      continue;
    }

    if (!isProviderAllowedByPrivacy(providerId, privacyMode)) {
      console.log(`[provider-selector] ${providerId}: excluded by privacy`);
      report.reasons.push({
        providerId,
        ok: false,
        reason: 'PRIVACY_MODE',
        details: { privacyMode, message: 'Excluded by privacy policy' },
      });
      continue;
    }

    try {
      const detectResult = await provider.detect(config);

      if (!detectResult.available) {
        console.log(`[provider-selector] ${providerId}: unavailable - ${detectResult.reason}`);
        report.reasons.push({
          providerId,
          ok: false,
          reason: 'PROBE_FAILED',
          details: { detectReason: detectResult.reason },
        });
        continue;
      }

      console.log(`[provider-selector] ${providerId}: SELECTED ✓`);
      report.reasons.push({
        providerId,
        ok: true,
        reason: 'ORDER_POLICY',
        details: { privacyClaim: detectResult.privacyClaim },
      });
      report.selected = providerId;

      return { provider, report };
    } catch (error) {
      console.log(`[provider-selector] ${providerId}: error - ${error}`);
      report.reasons.push({
        providerId,
        ok: false,
        reason: 'PROBE_FAILED',
        details: { error: String(error) },
      });
    }
  }

  return { provider: null, report };
}

/**
 * Check if a provider is allowed by privacy mode.
 * - 'any': all providers allowed
 * - 'fully-local-managed': only managed providers (webllm, mock), not native
 */
function isProviderAllowedByPrivacy(providerId: ProviderId, privacyMode: PrivacyMode): boolean {
  if (privacyMode === 'any') return true;
  if (privacyMode === 'fully-local-managed') {
    return providerId !== 'native';
  }
  return true;
}
