/**
 * SchedulingService Unit Tests
 *
 * Verifies the slot generation algorithm, conflict detection, buffer time,
 * and day-of-week filtering using mocked repositories (no DB required).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UUID, TenantContext, Availability, Appointment } from '../types/index.js';
import { RoleType, AvailabilityType, DayOfWeek } from '../types/index.js';

// Mock repositories before importing the service that depends on them
vi.mock('../repositories/AvailabilityRepository.js', () => ({
  availabilityRepository: {
    findActiveInRange: vi.fn(),
  },
}));
vi.mock('../repositories/AppointmentRepository.js', () => ({
  appointmentRepository: {
    findConflicting: vi.fn(),
    create:          vi.fn(),
    cancel:          vi.fn(),
  },
}));

import { schedulingService } from '../services/SchedulingService.js';
import { availabilityRepository } from '../repositories/AvailabilityRepository.js';
import { appointmentRepository } from '../repositories/AppointmentRepository.js';

// ============================================================================
// Test fixtures
// ============================================================================

const ORG_ID  = 'org-1' as UUID;
const USER_ID = 'user-1' as UUID;

const tenant: TenantContext = {
  organizationId: ORG_ID,
  userId:         USER_ID,
  role:           RoleType.OWNER,
};

/**
 * Build a minimal Availability fixture for the given UTC window.
 */
function makeAvailability(
  startTime: string,
  endTime: string,
  overrides: Partial<Availability> = {},
): Availability {
  return {
    id:             'avail-1' as UUID,
    organizationId: ORG_ID,
    userId:         USER_ID,
    type:           AvailabilityType.HOUR,
    startTime,
    endTime,
    daysOfWeek:     [],     // no day restriction by default
    bufferMinutes:  0,
    timezone:       'UTC',
    createdAt:      '2024-01-01T00:00:00.000Z',
    updatedAt:      '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Build a minimal Appointment fixture for the given UTC window.
 */
function makeAppointment(startTime: string, endTime: string): Appointment {
  return {
    id:              'appt-1' as UUID,
    organizationId:  ORG_ID,
    userId:          USER_ID,
    clientName:      'Test Client',
    clientEmail:     'test@example.com',
    startTime,
    endTime,
    confirmationRef: 'TP-20240101-ABCD1234',
    status:          'scheduled',
    timezone:        'UTC',
    createdAt:       '2024-01-01T00:00:00.000Z',
    updatedAt:       '2024-01-01T00:00:00.000Z',
  };
}

const BASE_PARAMS = {
  userId:              USER_ID,
  date:                '2024-03-04', // Monday UTC
  clientTimezone:      'UTC',
  slotDurationMinutes: 60,
  tenant,
};

// ============================================================================
// Tests
// ============================================================================

describe('SchedulingService.getAvailableSlots', () => {
  beforeEach(() => {
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([]);
    vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([]);
  });

  it('returns an empty array when there is no availability', async () => {
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([]);

    const slots = await schedulingService.getAvailableSlots(BASE_PARAMS);

    expect(slots).toEqual([]);
  });

  it('generates the correct number of 60-minute slots in a 3-hour window with no buffer', async () => {
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2024-03-04T09:00:00.000Z', '2024-03-04T12:00:00.000Z'),
    ]);

    const slots = await schedulingService.getAvailableSlots(BASE_PARAMS);

    // 3-hour window / 60min slots / no buffer = 3 slots
    expect(slots).toHaveLength(3);
    expect(slots[0].startTime).toBe('2024-03-04T09:00:00.000Z');
    expect(slots[0].endTime).toBe('2024-03-04T10:00:00.000Z');
    expect(slots[1].startTime).toBe('2024-03-04T10:00:00.000Z');
    expect(slots[2].startTime).toBe('2024-03-04T11:00:00.000Z');
    expect(slots[2].endTime).toBe('2024-03-04T12:00:00.000Z');
  });

  it('applies buffer time between slots (cursor advances by slot + buffer)', async () => {
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability(
        '2024-03-04T09:00:00.000Z',
        '2024-03-04T13:00:00.000Z',
        { bufferMinutes: 15 },
      ),
    ]);

    const slots = await schedulingService.getAvailableSlots(BASE_PARAMS);

    // slot=60min, buffer=15min → each slot occupies 75 min of the window
    // 09:00-10:00, 10:15-11:15, 11:30-12:30 → next would be 12:45-13:45 which exceeds window
    expect(slots).toHaveLength(3);
    expect(slots[0].startTime).toBe('2024-03-04T09:00:00.000Z');
    expect(slots[1].startTime).toBe('2024-03-04T10:15:00.000Z');
    expect(slots[2].startTime).toBe('2024-03-04T11:30:00.000Z');
  });

  it('removes slots that conflict with existing appointments', async () => {
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2024-03-04T09:00:00.000Z', '2024-03-04T12:00:00.000Z'),
    ]);
    // Existing booking at 10:00-11:00 (the middle slot)
    vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([
      makeAppointment('2024-03-04T10:00:00.000Z', '2024-03-04T11:00:00.000Z'),
    ]);

    const slots = await schedulingService.getAvailableSlots(BASE_PARAMS);

    // 09:00-10:00 and 11:00-12:00 should be available; 10:00-11:00 is taken
    expect(slots).toHaveLength(2);
    expect(slots[0].startTime).toBe('2024-03-04T09:00:00.000Z');
    expect(slots[1].startTime).toBe('2024-03-04T11:00:00.000Z');
  });

  it('returns no slots when all slots are conflicted', async () => {
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2024-03-04T09:00:00.000Z', '2024-03-04T10:00:00.000Z'),
    ]);
    vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([
      makeAppointment('2024-03-04T09:00:00.000Z', '2024-03-04T10:00:00.000Z'),
    ]);

    const slots = await schedulingService.getAvailableSlots(BASE_PARAMS);

    expect(slots).toHaveLength(0);
  });

  it('excludes a day when it does not match the availability daysOfWeek', async () => {
    // Make availability only available on Tuesday (2  in the DayOfWeek enum)
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability(
        '2024-03-04T09:00:00.000Z',
        '2024-03-04T12:00:00.000Z',
        {
          daysOfWeek: [DayOfWeek.TUESDAY], // Only Tuesdays
          timezone: 'UTC',
        },
      ),
    ]);

    // date '2024-03-04' is a Monday → should produce zero slots
    const slots = await schedulingService.getAvailableSlots({
      ...BASE_PARAMS,
      date: '2024-03-04', // Monday
    });

    expect(slots).toHaveLength(0);
  });

  it('includes slots when the date matches the availability daysOfWeek', async () => {
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability(
        '2024-03-05T09:00:00.000Z',
        '2024-03-05T10:00:00.000Z',
        {
          daysOfWeek: [DayOfWeek.TUESDAY], // Only Tuesdays
          timezone: 'UTC',
        },
      ),
    ]);

    // date '2024-03-05' is a Tuesday → should produce 1 slot
    const slots = await schedulingService.getAvailableSlots({
      ...BASE_PARAMS,
      date: '2024-03-05', // Tuesday
    });

    expect(slots).toHaveLength(1);
  });

  it('deduplicates slots that appear from overlapping availability windows', async () => {
    // Two windows that overlap — the same slot 09:00-10:00 would be generated twice
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2024-03-04T09:00:00.000Z', '2024-03-04T10:00:00.000Z'),
      makeAvailability('2024-03-04T09:00:00.000Z', '2024-03-04T10:00:00.000Z'), // duplicate window
    ]);

    const slots = await schedulingService.getAvailableSlots(BASE_PARAMS);

    expect(slots).toHaveLength(1);
    expect(slots[0].startTime).toBe('2024-03-04T09:00:00.000Z');
  });

  it('returns slots sorted in chronological order', async () => {
    // Two non-overlapping windows: afternoon first in array, morning second
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2024-03-04T14:00:00.000Z', '2024-03-04T15:00:00.000Z'),
      makeAvailability('2024-03-04T09:00:00.000Z', '2024-03-04T10:00:00.000Z'),
    ]);

    const slots = await schedulingService.getAvailableSlots(BASE_PARAMS);

    expect(slots).toHaveLength(2);
    expect(slots[0].startTime).toBe('2024-03-04T09:00:00.000Z');
    expect(slots[1].startTime).toBe('2024-03-04T14:00:00.000Z');
  });
});

// ============================================================================
// Timezone date-leak regression tests
//
// Reproduces the bug where the ±14 h UTC search range causes an availability
// window stored for day N in a non-UTC timezone to be returned (and slots
// offered) when the client queries for day N+1.
// ============================================================================

describe('SchedulingService.getAvailableSlots — timezone date-leak prevention', () => {
  beforeEach(() => {
    vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([]);
  });

  it('does not return slots from a previous local day when queried for the next day (America/New_York)', async () => {
    // Availability created for 2026-03-30 09:00–17:00 America/New_York (EDT = UTC-4)
    // → stored as 2026-03-30T13:00:00Z – 2026-03-30T21:00:00Z
    // The ±14 h search range for 2026-03-31 is 2026-03-30T10:00:00Z – 2026-04-01T13:59:59Z,
    // which overlaps this record.  Without the date filter the service would
    // return March 30 ET slots for a March 31 query.
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2026-03-30T13:00:00.000Z', '2026-03-30T21:00:00.000Z'),
    ]);

    const slots = await schedulingService.getAvailableSlots({
      userId:              USER_ID,
      date:                '2026-03-31',
      clientTimezone:      'America/New_York',
      slotDurationMinutes: 60,
      tenant,
    });

    expect(slots).toHaveLength(0);
  });

  it('does return slots when queried for the correct local day (America/New_York)', async () => {
    // Same availability — should produce 8 hourly slots for 2026-03-30 query
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2026-03-30T13:00:00.000Z', '2026-03-30T21:00:00.000Z'),
    ]);

    const slots = await schedulingService.getAvailableSlots({
      userId:              USER_ID,
      date:                '2026-03-30',
      clientTimezone:      'America/New_York',
      slotDurationMinutes: 60,
      tenant,
    });

    expect(slots.length).toBeGreaterThan(0);
    // All returned slots must fall on 2026-03-30 in America/New_York
    for (const slot of slots) {
      const localDate = new Date(slot.startTime).toLocaleDateString('en-CA', {
        timeZone: 'America/New_York',
      });
      expect(localDate).toBe('2026-03-30');
    }
  });

  it('does not leak early-morning slots across local day boundary (America/New_York)', async () => {
    // Availability 02:00–06:00 ET on 2026-03-30 (early morning of March 30)
    // → stored as 2026-03-30T06:00:00Z – 2026-03-30T10:00:00Z
    // The ±14 h search range for 2026-03-29 reaches 2026-03-30T13:59Z, so
    // this record is returned by the DB query.  The date filter must drop it
    // because all slots fall on 2026-03-30 ET, not 2026-03-29.
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2026-03-30T06:00:00.000Z', '2026-03-30T10:00:00.000Z'),
    ]);

    const slots = await schedulingService.getAvailableSlots({
      userId:              USER_ID,
      date:                '2026-03-29',
      clientTimezone:      'America/New_York',
      slotDurationMinutes: 60,
      tenant,
    });

    expect(slots).toHaveLength(0);
  });

  it('weekly availability on single-day range does not bleed into day+1', async () => {
    // WEEK type stored for 2026-03-30 only (Mon): 13:00–21:00Z
    // Query for 2026-03-31 (Tue, in days_of_week) should produce 0 slots
    // because the window itself does not contain any slots on March 31 ET.
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2026-03-30T13:00:00.000Z', '2026-03-30T21:00:00.000Z', {
        type: AvailabilityType.WEEK,
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
                     DayOfWeek.THURSDAY, DayOfWeek.FRIDAY],
        timezone: 'America/New_York',
      }),
    ]);

    const slots = await schedulingService.getAvailableSlots({
      userId:              USER_ID,
      date:                '2026-03-31',
      clientTimezone:      'America/New_York',
      slotDurationMinutes: 60,
      tenant,
    });

    expect(slots).toHaveLength(0);
  });

  it('long recurring weekly range returns only requested-day working hours', async () => {
    // Recurring Mon-Fri 09:00-17:00 ET active for over a year.
    // The service must only produce slots for the requested date, not the full span.
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
      makeAvailability('2026-04-01T13:00:00.000Z', '2027-04-29T21:00:00.000Z', {
        type: AvailabilityType.WEEK,
        daysOfWeek: [DayOfWeek.MONDAY, DayOfWeek.TUESDAY, DayOfWeek.WEDNESDAY,
                     DayOfWeek.THURSDAY, DayOfWeek.FRIDAY],
        timezone: 'America/New_York',
      }),
    ]);

    const slots = await schedulingService.getAvailableSlots({
      userId:              USER_ID,
      date:                '2026-04-06', // Monday
      clientTimezone:      'America/New_York',
      slotDurationMinutes: 60,
      tenant,
    });

    expect(slots).toHaveLength(8);
    expect(new Date(slots[0].startTime).toLocaleTimeString('en-GB', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    })).toBe('09:00');
    expect(new Date(slots[7].startTime).toLocaleTimeString('en-GB', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    })).toBe('16:00');
  });
});

// ============================================================================
// SchedulingService.isSlotAvailable
// ============================================================================

describe('SchedulingService.isSlotAvailable', () => {
  beforeEach(() => {
    vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([]);
  });

  it('returns true when there are no conflicting appointments', async () => {
    vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([]);

    const available = await schedulingService.isSlotAvailable({
      userId:    USER_ID,
      startTime: '2024-03-04T09:00:00.000Z',
      endTime:   '2024-03-04T10:00:00.000Z',
      tenant,
    });

    expect(available).toBe(true);
  });

  it('returns false when there is at least one conflicting appointment', async () => {
    vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([
      makeAppointment('2024-03-04T09:30:00.000Z', '2024-03-04T10:30:00.000Z'),
    ]);

    const available = await schedulingService.isSlotAvailable({
      userId:    USER_ID,
      startTime: '2024-03-04T09:00:00.000Z',
      endTime:   '2024-03-04T10:00:00.000Z',
      tenant,
    });

    expect(available).toBe(false);
  });

  it('passes the excludeAppointmentId parameter through to the repository', async () => {
    const excludeId = 'appt-to-exclude' as UUID;

    await schedulingService.isSlotAvailable({
      userId:               USER_ID,
      startTime:            '2024-03-04T09:00:00.000Z',
      endTime:              '2024-03-04T10:00:00.000Z',
      tenant,
      excludeAppointmentId: excludeId,
    });

    expect(vi.mocked(appointmentRepository.findConflicting)).toHaveBeenCalledWith(
      USER_ID,
      '2024-03-04T09:00:00.000Z',
      '2024-03-04T10:00:00.000Z',
      tenant,
      excludeId,
    );
  });
});
