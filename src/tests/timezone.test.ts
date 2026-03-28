/**
 * Timezone Utility Tests
 *
 * Pure function tests covering DST transitions, boundary cases, and
 * correct IANA timezone resolution. No mocking or DB access required.
 */

import { describe, it, expect } from 'vitest';
import {
  getDayOfWeekInTimezone,
  formatInTimezone,
  addMinutes,
  rangesOverlap,
  isValidTimezone,
  localDateToUTCSearchRange,
  localDateTimeInTimezoneToUTC,
} from '../utils/timezone.js';

// ============================================================================
// getDayOfWeekInTimezone
// ============================================================================

describe('getDayOfWeekInTimezone', () => {
  it('returns the correct day for a well-known UTC date (Monday)', () => {
    // 2024-03-04 is a Monday
    expect(getDayOfWeekInTimezone('2024-03-04T12:00:00.000Z', 'UTC')).toBe(1);
  });

  it('returns the correct day for Sunday', () => {
    // 2024-03-03 is a Sunday
    expect(getDayOfWeekInTimezone('2024-03-03T12:00:00.000Z', 'UTC')).toBe(0);
  });

  it('returns the correct local day when timezone is behind UTC', () => {
    // 2024-03-04T02:00:00.000Z is still March 3 in Americas/New_York (EST = UTC-5 => 9pm March 3)
    expect(getDayOfWeekInTimezone('2024-03-04T02:00:00.000Z', 'America/New_York')).toBe(0); // Sunday
  });

  it('returns the correct local day when timezone is ahead of UTC', () => {
    // 2024-03-04T00:00:00.000Z is already March 4 in Asia/Tokyo (JST = UTC+9 => 9am March 4)
    expect(getDayOfWeekInTimezone('2024-03-04T00:00:00.000Z', 'Asia/Tokyo')).toBe(1); // Monday
  });

  // DST boundary: US Spring Forward — 2024-03-10 (2nd Sunday in March)
  it('returns Sunday both before and after the US spring-forward DST boundary', () => {
    // 2024-03-10T06:55:00.000Z = 01:55 am EST (before spring forward)
    expect(getDayOfWeekInTimezone('2024-03-10T06:55:00.000Z', 'America/New_York')).toBe(0);
    // 2024-03-10T07:05:00.000Z = 03:05 am EDT (after spring forward; 2am became 3am)
    expect(getDayOfWeekInTimezone('2024-03-10T07:05:00.000Z', 'America/New_York')).toBe(0);
  });

  // DST boundary: US Fall Back — 2024-11-03 (1st Sunday in November)
  it('returns Sunday both before and after the US fall-back DST boundary', () => {
    // 2024-11-03T05:55:00.000Z = 01:55 am EDT (before fall back)
    expect(getDayOfWeekInTimezone('2024-11-03T05:55:00.000Z', 'America/New_York')).toBe(0);
    // 2024-11-03T06:05:00.000Z = 01:05 am EST (after fall back; 2am became 1am)
    expect(getDayOfWeekInTimezone('2024-11-03T06:05:00.000Z', 'America/New_York')).toBe(0);
    // The next day (Monday November 4) should also be correct
    expect(getDayOfWeekInTimezone('2024-11-04T12:00:00.000Z', 'America/New_York')).toBe(1);
  });
});

// ============================================================================
// rangesOverlap
// ============================================================================

describe('rangesOverlap', () => {
  const T10 = '2024-01-01T10:00:00.000Z';
  const T11 = '2024-01-01T11:00:00.000Z';
  const T12 = '2024-01-01T12:00:00.000Z';
  const T1030 = '2024-01-01T10:30:00.000Z';
  const T1130 = '2024-01-01T11:30:00.000Z';

  it('returns true for fully overlapping ranges', () => {
    expect(rangesOverlap(T10, T12, T10, T12)).toBe(true);
  });

  it('returns true for partially overlapping ranges', () => {
    expect(rangesOverlap(T10, T11, T1030, T12)).toBe(true);
    expect(rangesOverlap(T1030, T12, T10, T11)).toBe(true);
  });

  it('returns true when one range is contained inside the other', () => {
    expect(rangesOverlap(T10, T12, T1030, T1130)).toBe(true);
    expect(rangesOverlap(T1030, T1130, T10, T12)).toBe(true);
  });

  it('returns false for ranges that share only a single boundary point (end === start)', () => {
    // [10:00, 11:00) and [11:00, 12:00) share boundary at 11:00 — NOT an overlap
    expect(rangesOverlap(T10, T11, T11, T12)).toBe(false);
    expect(rangesOverlap(T11, T12, T10, T11)).toBe(false);
  });

  it('returns false for entirely disjoint ranges', () => {
    expect(rangesOverlap(T10, T11, T12, T12)).toBe(false);
    expect(rangesOverlap(T12, T12, T10, T11)).toBe(false);
  });
});

// ============================================================================
// addMinutes
// ============================================================================

describe('addMinutes', () => {
  it('adds minutes to a UTC ISO string and returns a UTC ISO string', () => {
    const result = addMinutes('2024-01-01T10:00:00.000Z', 30);
    expect(result).toBe('2024-01-01T10:30:00.000Z');
  });

  it('correctly handles minute addition that crosses an hour boundary', () => {
    const result = addMinutes('2024-01-01T10:45:00.000Z', 30);
    expect(result).toBe('2024-01-01T11:15:00.000Z');
  });

  it('correctly handles minute addition that crosses a day boundary', () => {
    const result = addMinutes('2024-01-01T23:45:00.000Z', 30);
    expect(result).toBe('2024-01-02T00:15:00.000Z');
  });
});

// ============================================================================
// isValidTimezone
// ============================================================================

describe('isValidTimezone', () => {
  it('returns true for valid IANA identifiers', () => {
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('America/New_York')).toBe(true);
    expect(isValidTimezone('Europe/London')).toBe(true);
    expect(isValidTimezone('Asia/Tokyo')).toBe(true);
    expect(isValidTimezone('Australia/Sydney')).toBe(true);
  });

  it('returns false for non-existent or malformed identifiers', () => {
    expect(isValidTimezone('Not/A/Timezone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
    expect(isValidTimezone('America/Nowhere')).toBe(false);
    expect(isValidTimezone('Fake/Zone')).toBe(false);
  });
});

// ============================================================================
// localDateToUTCSearchRange
// ============================================================================

describe('localDateToUTCSearchRange', () => {
  it('produces a UTC range that spans the full local date with ±14h padding', () => {
    const { from, to } = localDateToUTCSearchRange('2024-03-04');

    // from should be 2024-03-04T00:00:00Z minus 14h = 2024-03-03T10:00:00Z
    expect(from).toBe('2024-03-03T10:00:00.000Z');
    // to should be 2024-03-04T23:59:59.999Z plus 14h = 2024-03-05T13:59:59.999Z
    expect(to).toBe('2024-03-05T13:59:59.999Z');
  });

  it('covers any possible local calendar day regardless of timezone offset', () => {
    // UTC+14 is the furthest-ahead timezone (UTC+14 at 00:01 on March 4 = March 3T10:01 UTC)
    // UTC-12 is the furthest-behind timezone (UTC-12 at 23:59 on March 4 = March 5T11:59 UTC)
    // Our ±14h window from the UTC day boundaries covers both extremes.
    const { from, to } = localDateToUTCSearchRange('2024-06-15');
    const dayStartMs = new Date('2024-06-15T00:00:00.000Z').getTime();
    const dayEndMs   = new Date('2024-06-15T23:59:59.999Z').getTime();
    const pad        = 14 * 60 * 60 * 1000;

    expect(new Date(from).getTime()).toBe(dayStartMs - pad);
    expect(new Date(to).getTime()).toBe(dayEndMs + pad);
  });
});

// ============================================================================
// formatInTimezone
// ============================================================================

describe('formatInTimezone', () => {
  it('returns a string representation of the date in the target timezone', () => {
    const result = formatInTimezone('2024-03-10T15:00:00.000Z', 'America/New_York');
    // March 10, 2024 15:00 UTC = 11:00 AM EDT (UTC-4 after spring forward on that day)
    expect(result).toContain('11:00');
    expect(result).toContain('AM');
  });

  it('correctly converts UTC time before the US spring-forward DST change to EST', () => {
    // 2024-03-10T06:55:00Z = 1:55 am EST (before 2am→3am spring forward)
    const result = formatInTimezone('2024-03-10T06:55:00.000Z', 'America/New_York', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
    expect(result).toBe('01:55');
  });

  it('correctly converts UTC time after the US spring-forward DST change to EDT', () => {
    // 2024-03-10T07:05:00Z = 3:05 am EDT (after spring forward; 2am skipped)
    const result = formatInTimezone('2024-03-10T07:05:00.000Z', 'America/New_York', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
    expect(result).toBe('03:05');
  });
});

// ============================================================================
// localDateTimeInTimezoneToUTC
// ============================================================================

describe('localDateTimeInTimezoneToUTC', () => {
  it('converts local New York business hours to UTC during DST', () => {
    expect(localDateTimeInTimezoneToUTC('2026-04-01', '09:00', 'America/New_York'))
      .toBe('2026-04-01T13:00:00.000Z');
    expect(localDateTimeInTimezoneToUTC('2026-04-01', '16:00', 'America/New_York'))
      .toBe('2026-04-01T20:00:00.000Z');
  });

  it('converts local UTC business hours without shifting them', () => {
    expect(localDateTimeInTimezoneToUTC('2026-04-01', '09:00', 'UTC'))
      .toBe('2026-04-01T09:00:00.000Z');
    expect(localDateTimeInTimezoneToUTC('2026-04-01', '16:00', 'UTC'))
      .toBe('2026-04-01T16:00:00.000Z');
  });
});
