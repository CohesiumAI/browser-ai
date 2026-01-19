/**
 * UUID v4 generation for selectionReportId.
 * Complément §3
 */

export function newSelectionReportId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  throw new Error('crypto.randomUUID() is required to generate selectionReportId');
}
