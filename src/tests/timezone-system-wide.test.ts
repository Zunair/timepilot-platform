/**
 * Timezone System-Wide Tests
 *
 * Ensures timezone correctness across layer boundaries:
 * - Scheduling (slot generation) respects the requested timezone
 * - Appointment storage always uses UTC with timezone context
 * - Notification template variables render correct local times
 * - DST transitions produce correct display dates/times in reminders
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Appointment } from '../types/index.js';
import {
  getDayOfWeekInTimezone,
  formatInTimezone,
  localDateToUTCSearchRange,
  localDateTimeInTimezoneToUTC,
  getLocalDateInTimezone,
  getLocalTimeInTimezone,
  isValidTimezone,
} from '../utils/timezone.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'a0000000-0000-0000-0000-000000000001',
    organizationId: 'org-001',
    userId: 'user-001',
    clientName: 'Alice',
    clientEmail: 'alice@example.com',
    status: 'scheduled',
    startTime: '2026-06-15T14:00:00.000Z', // 10:00 AM EDT / 11:00 PM JST
    endTime: '2026-06-15T14:30:00.000Z',
    timezone: 'America/New_York',
    confirmationRef: 'TZ-001',
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Replicates the NotificationWorker's buildTemplateVariables logic
 * so we can test timezone rendering without importing the worker.
 */
function buildTemplateVariables(appointment: Appointment) {
  const displayDate = new Date(appointment.startTime).toLocaleDateString('en-US', {
    timeZone: appointment.timezone,
    dateStyle: 'full',
  });
  const displayTime = new Date(appointment.startTime).toLocaleTimeString('en-US', {
    timeZone: appointment.timezone,
    timeStyle: 'short',
  });
  const durationMs =
    new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime();
  const durationMinutes = String(Math.round(durationMs / 60_000));

  return {
    clientName: appointment.clientName,
    clientEmail: appointment.clientEmail,
    appointmentDate: displayDate,
    appointmentTime: displayTime,
    appointmentTimezone: appointment.timezone,
    appointmentDuration: durationMinutes,
    confirmationRef: appointment.confirmationRef,
  };
}

// ============================================================================
// UTC storage invariant
// ============================================================================

describe('UTC storage invariant', () => {
  it('appointment start/end are always UTC ISO strings regardless of display timezone', () => {
    const appt = makeAppointment({ timezone: 'Asia/Tokyo' });
    expect(appt.startTime).toMatch(/Z$/);
    expect(appt.endTime).toMatch(/Z$/);
    expect(appt.timezone).toBe('Asia/Tokyo');
  });

  it('stores timezone context separately from time values', () => {
    const appt = makeAppointment({ timezone: 'Australia/Sydney' });
    // Timezone is metadata only — times remain in UTC
    expect(new Date(appt.startTime).toISOString()).toBe(appt.startTime);
    expect(new Date(appt.endTime).toISOString()).toBe(appt.endTime);
  });
});

// ============================================================================
// Template variable rendering across timezones
// ============================================================================

describe('buildTemplateVariables timezone rendering', () => {
  it('renders correct date and time for America/New_York (EDT)', () => {
    // 2026-06-15T14:00Z = June 15 2026 10:00 AM EDT (UTC-4 in summer)
    const vars = buildTemplateVariables(makeAppointment());
    expect(vars.appointmentDate).toContain('June');
    expect(vars.appointmentDate).toContain('15');
    expect(vars.appointmentDate).toContain('2026');
    expect(vars.appointmentTime).toBe('10:00 AM');
    expect(vars.appointmentTimezone).toBe('America/New_York');
    expect(vars.appointmentDuration).toBe('30');
  });

  it('renders correct date and time for Asia/Tokyo (JST, UTC+9)', () => {
    // 2026-06-15T14:00Z = June 15 2026 23:00 JST
    const vars = buildTemplateVariables(makeAppointment({ timezone: 'Asia/Tokyo' }));
    expect(vars.appointmentDate).toContain('June');
    expect(vars.appointmentDate).toContain('15');
    expect(vars.appointmentTime).toBe('11:00 PM');
  });

  it('renders correct date for Asia/Tokyo when UTC midnight crosses date boundary', () => {
    // 2026-06-15T16:00Z = June 16 2026 01:00 JST — crosses into next day
    const appt = makeAppointment({
      startTime: '2026-06-15T16:00:00.000Z',
      endTime: '2026-06-15T16:30:00.000Z',
      timezone: 'Asia/Tokyo',
    });
    const vars = buildTemplateVariables(appt);
    expect(vars.appointmentDate).toContain('June');
    expect(vars.appointmentDate).toContain('16'); // next day in Tokyo
    expect(vars.appointmentTime).toBe('1:00 AM');
  });

  it('renders correct date and time for Europe/London (BST, UTC+1 in summer)', () => {
    // 2026-06-15T14:00Z = June 15 2026 15:00 BST
    const vars = buildTemplateVariables(makeAppointment({ timezone: 'Europe/London' }));
    expect(vars.appointmentDate).toContain('June');
    expect(vars.appointmentDate).toContain('15');
    expect(vars.appointmentTime).toBe('3:00 PM');
  });

  it('renders correct date and time for Australia/Sydney (AEST, UTC+10 in winter)', () => {
    // 2026-06-15T14:00Z = June 16 2026 00:00 AEST (no DST, UTC+10)
    const vars = buildTemplateVariables(makeAppointment({ timezone: 'Australia/Sydney' }));
    expect(vars.appointmentDate).toContain('June');
    expect(vars.appointmentDate).toContain('16'); // crosses date boundary
    expect(vars.appointmentTime).toBe('12:00 AM');
  });

  it('renders correct date and time for Pacific/Auckland (NZST, UTC+12)', () => {
    // 2026-06-15T14:00Z = June 16 2026 02:00 NZST
    const vars = buildTemplateVariables(makeAppointment({ timezone: 'Pacific/Auckland' }));
    expect(vars.appointmentDate).toContain('June');
    expect(vars.appointmentDate).toContain('16');
    expect(vars.appointmentTime).toBe('2:00 AM');
  });

  it('renders UTC correctly when timezone is UTC', () => {
    const vars = buildTemplateVariables(makeAppointment({ timezone: 'UTC' }));
    expect(vars.appointmentDate).toContain('June');
    expect(vars.appointmentDate).toContain('15');
    expect(vars.appointmentTime).toBe('2:00 PM');
  });
});

// ============================================================================
// Scheduling layer timezone correctness
// ============================================================================

describe('scheduling slot timezone correctness', () => {
  it('getDayOfWeekInTimezone returns local day, not UTC day', () => {
    // 2026-06-15T03:00Z = Sunday June 14 at 11pm EDT
    expect(getDayOfWeekInTimezone('2026-06-15T03:00:00.000Z', 'America/New_York')).toBe(0); // Sunday
    // Same instant in UTC is already Monday
    expect(getDayOfWeekInTimezone('2026-06-15T03:00:00.000Z', 'UTC')).toBe(1); // Monday
  });

  it('localDateToUTCSearchRange covers the full local day with ±14h padding', () => {
    const range = localDateToUTCSearchRange('2026-06-15');
    const from = new Date(range.from);
    const to = new Date(range.to);

    // The range extends 14h before midnight and 14h after end of day
    expect(from.toISOString()).toBe('2026-06-14T10:00:00.000Z');
    expect(to.toISOString()).toBe('2026-06-16T13:59:59.999Z');
  });

  it('localDateTimeInTimezoneToUTC converts local time accurately', () => {
    // 10:00 AM on June 15 in New York = 14:00 UTC (EDT = UTC-4)
    const utc = localDateTimeInTimezoneToUTC('2026-06-15', '10:00', 'America/New_York');
    expect(utc).toBe('2026-06-15T14:00:00.000Z');
  });

  it('localDateTimeInTimezoneToUTC works for far-east timezones', () => {
    // 23:00 on June 15 in Tokyo = 14:00 UTC (JST = UTC+9)
    const utc = localDateTimeInTimezoneToUTC('2026-06-15', '23:00', 'Asia/Tokyo');
    expect(utc).toBe('2026-06-15T14:00:00.000Z');
  });

  it('getLocalDateInTimezone and getLocalTimeInTimezone are consistent with template vars', () => {
    const appt = makeAppointment();
    const localDate = getLocalDateInTimezone(appt.startTime, appt.timezone);
    const localTime = getLocalTimeInTimezone(appt.startTime, appt.timezone);

    expect(localDate).toBe('2026-06-15');
    expect(localTime).toBe('10:00');
  });
});

// ============================================================================
// DST transition rendering for reminders
// ============================================================================

describe('DST transitions — reminder display correctness', () => {
  // US 2026 Spring Forward: March 8 at 2:00 AM EST → 3:00 AM EDT
  // US 2026 Fall Back:    November 1 at 2:00 AM EDT → 1:00 AM EST

  it('spring forward: appointment at 10am EDT on March 8 renders correctly', () => {
    // March 8 2026 10:00 AM EDT = 14:00 UTC (EDT = UTC-4)
    const appt = makeAppointment({
      startTime: '2026-03-08T14:00:00.000Z',
      endTime: '2026-03-08T14:30:00.000Z',
      timezone: 'America/New_York',
    });
    const vars = buildTemplateVariables(appt);
    expect(vars.appointmentDate).toContain('March');
    expect(vars.appointmentDate).toContain('8');
    expect(vars.appointmentTime).toBe('10:00 AM');
  });

  it('spring forward: appointment at 2:30am (non-existent local time) uses correct UTC', () => {
    // 2:30 AM EST on March 8 doesn't exist — clocks jump 2am→3am.
    // localDateTimeInTimezoneToUTC should resolve to the nearest valid time.
    // Before spring forward: 2:30 AM EST = 07:30 UTC
    const utcBefore = localDateTimeInTimezoneToUTC('2026-03-08', '02:30', 'America/New_York');
    const utcMs = new Date(utcBefore).getTime();
    // The result should be a valid UTC timestamp near 07:30 UTC
    expect(utcMs).toBeGreaterThanOrEqual(new Date('2026-03-08T07:00:00.000Z').getTime());
    expect(utcMs).toBeLessThanOrEqual(new Date('2026-03-08T08:00:00.000Z').getTime());
  });

  it('spring forward: appointment just before clocks change (1:30 AM EST) renders correctly', () => {
    // 1:30 AM EST on March 8 = 06:30 UTC
    const appt = makeAppointment({
      startTime: '2026-03-08T06:30:00.000Z',
      endTime: '2026-03-08T07:00:00.000Z',
      timezone: 'America/New_York',
    });
    const vars = buildTemplateVariables(appt);
    expect(vars.appointmentTime).toBe('1:30 AM');
    expect(vars.appointmentDate).toContain('March');
    expect(vars.appointmentDate).toContain('8');
  });

  it('spring forward: appointment just after clocks change (3:00 AM EDT) renders correctly', () => {
    // 3:00 AM EDT on March 8 = 07:00 UTC (EDT = UTC-4)
    const appt = makeAppointment({
      startTime: '2026-03-08T07:00:00.000Z',
      endTime: '2026-03-08T07:30:00.000Z',
      timezone: 'America/New_York',
    });
    const vars = buildTemplateVariables(appt);
    expect(vars.appointmentTime).toBe('3:00 AM');
  });

  it('fall back: appointment at 10am EST on Nov 1 renders correctly', () => {
    // Nov 1 2026 10:00 AM EST = 15:00 UTC (EST = UTC-5)
    const appt = makeAppointment({
      startTime: '2026-11-01T15:00:00.000Z',
      endTime: '2026-11-01T15:30:00.000Z',
      timezone: 'America/New_York',
    });
    const vars = buildTemplateVariables(appt);
    expect(vars.appointmentDate).toContain('November');
    expect(vars.appointmentDate).toContain('1');
    expect(vars.appointmentTime).toBe('10:00 AM');
  });

  it('fall back: 1:30 AM EDT before clocks change renders correctly', () => {
    // First 1:30 AM EDT = 05:30 UTC (EDT = UTC-4)
    const appt = makeAppointment({
      startTime: '2026-11-01T05:30:00.000Z',
      endTime: '2026-11-01T06:00:00.000Z',
      timezone: 'America/New_York',
    });
    const vars = buildTemplateVariables(appt);
    expect(vars.appointmentTime).toBe('1:30 AM');
  });

  it('fall back: 1:30 AM EST after clocks change also renders 1:30 AM', () => {
    // Second 1:30 AM EST = 06:30 UTC (EST = UTC-5)
    const appt = makeAppointment({
      startTime: '2026-11-01T06:30:00.000Z',
      endTime: '2026-11-01T07:00:00.000Z',
      timezone: 'America/New_York',
    });
    const vars = buildTemplateVariables(appt);
    // Both occurrences display 1:30 AM — the UTC value disambiguates
    expect(vars.appointmentTime).toBe('1:30 AM');
  });

  it('fall back: localDateTimeInTimezoneToUTC resolves ambiguous local time to a valid UTC', () => {
    // 1:30 AM on Nov 1 in New York is ambiguous (could be EDT or EST)
    const utc = localDateTimeInTimezoneToUTC('2026-11-01', '01:30', 'America/New_York');
    const ms = new Date(utc).getTime();
    // Should resolve to one of the two valid UTC timestamps
    const edtOption = new Date('2026-11-01T05:30:00.000Z').getTime(); // EDT
    const estOption = new Date('2026-11-01T06:30:00.000Z').getTime(); // EST
    expect(ms === edtOption || ms === estOption).toBe(true);
  });
});

// ============================================================================
// Cross-timezone round-trip consistency
// ============================================================================

describe('cross-timezone round-trip', () => {
  it('local→UTC→display round-trips correctly for multiple timezones', () => {
    const timezones = [
      { tz: 'America/New_York', localDate: '2026-06-15', localTime: '10:00' },
      { tz: 'Asia/Tokyo', localDate: '2026-06-15', localTime: '23:00' },
      { tz: 'Europe/London', localDate: '2026-06-15', localTime: '15:00' },
      { tz: 'Australia/Sydney', localDate: '2026-06-16', localTime: '01:00' },
      { tz: 'America/Los_Angeles', localDate: '2026-06-15', localTime: '07:00' },
    ];

    for (const { tz, localDate, localTime } of timezones) {
      const utc = localDateTimeInTimezoneToUTC(localDate, localTime, tz);
      const roundTrippedDate = getLocalDateInTimezone(utc, tz);
      const roundTrippedTime = getLocalTimeInTimezone(utc, tz);

      expect(roundTrippedDate).toBe(localDate);
      expect(roundTrippedTime).toBe(localTime);
    }
  });

  it('all test timezones are valid IANA identifiers', () => {
    const zones = [
      'America/New_York', 'Asia/Tokyo', 'Europe/London',
      'Australia/Sydney', 'Pacific/Auckland', 'America/Los_Angeles', 'UTC',
    ];
    for (const tz of zones) {
      expect(isValidTimezone(tz)).toBe(true);
    }
  });
});
