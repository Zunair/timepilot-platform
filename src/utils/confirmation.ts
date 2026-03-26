import { randomBytes } from 'node:crypto';

/**
 * Generate a human-readable, URL-safe booking confirmation reference.
 *
 * Format: TP-YYYYMMDD-XXXXXXXX
 * Example: TP-20260326-A3F7C912
 *
 * Uses cryptographically random bytes so references cannot be guessed
 * or enumerated by external parties.
 */
export function generateConfirmationRef(): string {
  const datePart   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = randomBytes(4).toString('hex').toUpperCase();
  return `TP-${datePart}-${randomPart}`;
}
