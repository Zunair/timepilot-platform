/**
 * Timezone utility functions.
 *
 * Rule: All storage uses UTC. Conversion to/from user or client local
 * time happens exclusively through this module, only at presentation
 * boundaries or when interpreting user-supplied local dates for queries.
 *
 * DST safety: all conversions use the Intl API, which is DST-aware by
 * design and built into Node.js with full IANA timezone data.
 */

/**
 * Get the ISO day-of-week (0 = Sunday … 6 = Saturday) for a UTC ISO
 * datetime string evaluated in the given IANA timezone.
 * DST-safe: Intl resolves the correct local date automatically.
 */
export function getDayOfWeekInTimezone(utcIso: string, timezone: string): number {
  const date = new Date(utcIso);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return weekdayMap[formatter.format(date)] ?? 0;
}

/**
 * Format a UTC ISO string for display in the given IANA timezone.
 */
export function formatInTimezone(
  utcIso: string,
  timezone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Date(utcIso).toLocaleString('en-US', { timeZone: timezone, ...options });
}

/**
 * Add minutes to a UTC ISO string. Returns a new UTC ISO string.
 */
export function addMinutes(utcIso: string, minutes: number): string {
  return new Date(new Date(utcIso).getTime() + minutes * 60_000).toISOString();
}

/**
 * Return true when time ranges [startA, endA) and [startB, endB) overlap.
 * Two ranges that share only a single boundary point are NOT considered
 * overlapping (e.g. one ends exactly when the other begins).
 */
export function rangesOverlap(
  startA: string, endA: string,
  startB: string, endB: string,
): boolean {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}

/**
 * Return the local YYYY-MM-DD date for a UTC ISO string in a given IANA timezone.
 * Uses en-CA locale which reliably formats as YYYY-MM-DD.
 * DST-safe: Intl resolves the correct local date automatically.
 */
export function getLocalDateInTimezone(utcIso: string, timezone: string): string {
  return new Date(utcIso).toLocaleDateString('en-CA', { timeZone: timezone });
}

/**
 * Return local HH:mm in the given timezone for a UTC ISO string.
 */
export function getLocalTimeInTimezone(utcIso: string, timezone: string): string {
  return new Date(utcIso).toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Validate that a timezone string is a supported IANA identifier on this runtime.
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build a generous UTC search range for a local YYYY-MM-DD date.
 * Adds ±14 h padding to account for any IANA timezone offset, ensuring
 * the full local calendar day is covered by the UTC window.
 */
export function localDateToUTCSearchRange(localDate: string): { from: string; to: string } {
  const dayStart = new Date(`${localDate}T00:00:00.000Z`);
  const dayEnd   = new Date(`${localDate}T23:59:59.999Z`);
  const PAD = 14 * 60 * 60 * 1000;
  return {
    from: new Date(dayStart.getTime() - PAD).toISOString(),
    to:   new Date(dayEnd.getTime()   + PAD).toISOString(),
  };
}

/**
 * Convert a local date/time in an IANA timezone to a UTC ISO timestamp.
 * Uses an iterative correction approach against Intl timezone formatting.
 */
export function localDateTimeInTimezoneToUTC(
  localDate: string,
  localTime: string,
  timezone: string,
): string {
  const [year, month, day] = localDate.split('-').map(Number);
  const [hour, minute] = localTime.split(':').map(Number);
  const desiredUtcParts = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let candidateUtcMs = desiredUtcParts;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  for (let i = 0; i < 3; i += 1) {
    const parts = formatter.formatToParts(new Date(candidateUtcMs));
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const actualUtcParts = Date.UTC(
      Number(lookup.year),
      Number(lookup.month) - 1,
      Number(lookup.day),
      Number(lookup.hour),
      Number(lookup.minute),
      0,
      0,
    );
    const delta = desiredUtcParts - actualUtcParts;
    if (delta === 0) break;
    candidateUtcMs += delta;
  }

  return new Date(candidateUtcMs).toISOString();
}
