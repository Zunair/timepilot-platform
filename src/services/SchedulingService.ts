import { UUID, TenantContext, DayOfWeek, AvailabilityType, TimeBlockRecurrence } from '../types/index.js';
import { availabilityRepository } from '../repositories/AvailabilityRepository.js';
import { appointmentRepository } from '../repositories/AppointmentRepository.js';
import { timeBlockRepository } from '../repositories/TimeBlockRepository.js';
import {
  rangesOverlap,
  getDayOfWeekInTimezone,
  localDateToUTCSearchRange,
  getLocalDateInTimezone,
  getLocalTimeInTimezone,
  localDateTimeInTimezoneToUTC,
} from '../utils/timezone.js';

export interface TimeSlot {
  startTime: string; // UTC ISO
  endTime:   string; // UTC ISO
}

export interface GetAvailableSlotsParams {
  userId:               UUID;
  date:                 string; // YYYY-MM-DD in the client's timezone
  clientTimezone:       string;
  slotDurationMinutes:  number;
  tenant:               TenantContext;
}

function addDaysToYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export class SchedulingService {
  /**
   * Compute available booking slots for a user on a given calendar date.
   *
   * Algorithm:
   *   1. Build a generous UTC search range for the requested local date.
   *   2. Fetch availability windows that overlap that range.
   *   3. Filter each window by days_of_week (evaluated in the availability's
   *      own timezone so DST is handled correctly).
   *   4. Generate fixed-duration slots within each window, advancing by
   *      slotDuration + bufferMinutes between consecutive offers.
   *   5. Remove slots that conflict with existing scheduled appointments,
   *      applying buffer padding on both sides of each candidate slot.
   *   6. Sort and deduplicate.
   *   7. Filter to only slots whose start time, in clientTimezone, falls on
   *      the requested date — prevents adjacent-day leakage caused by the
   *      generous UTC search range padding.
   */
  async getAvailableSlots(params: GetAvailableSlotsParams): Promise<TimeSlot[]> {
    const { userId, date, clientTimezone, slotDurationMinutes, tenant } = params;

    const { from: utcFrom, to: utcTo } = localDateToUTCSearchRange(date);

    const availabilities = await availabilityRepository.findActiveInRange(
      userId, utcFrom, utcTo, tenant,
    );
    if (availabilities.length === 0) return [];

    const existingAppointments = await appointmentRepository.findConflicting(
      userId, utcFrom, utcTo, tenant,
    );

    // Fetch time blocks and compute effective blocked ranges for the requested date.
    const timeBlocks = await timeBlockRepository.findActiveInRange(
      userId, utcFrom, utcTo, tenant,
    );
    const blockedRanges: Array<{ startTime: string; endTime: string }> = [];

    for (const block of timeBlocks) {
      if (block.recurrence === TimeBlockRecurrence.WEEKLY) {
        // Check day-of-week match using the block's own timezone (DST-safe)
        if (block.daysOfWeek && block.daysOfWeek.length > 0) {
          const requestedDayUTC = `${date}T12:00:00.000Z`;
          const dow = getDayOfWeekInTimezone(requestedDayUTC, block.timezone) as DayOfWeek;
          if (!block.daysOfWeek.includes(dow)) continue;
        }
        // Build the blocked window for this specific day using the block's clock times
        const startClock = getLocalTimeInTimezone(block.startTime, block.timezone);
        const endClock = getLocalTimeInTimezone(block.endTime, block.timezone);
        const endDateForClock = endClock > startClock ? date : addDaysToYmd(date, 1);
        const dayBlockStart = localDateTimeInTimezoneToUTC(date, startClock, block.timezone);
        const dayBlockEnd = localDateTimeInTimezoneToUTC(endDateForClock, endClock, block.timezone);
        blockedRanges.push({ startTime: dayBlockStart, endTime: dayBlockEnd });
      } else if (block.recurrence === TimeBlockRecurrence.DAILY) {
        // Daily: apply the block's clock times to the requested date
        const startClock = getLocalTimeInTimezone(block.startTime, block.timezone);
        const endClock = getLocalTimeInTimezone(block.endTime, block.timezone);
        const endDateForClock = endClock > startClock ? date : addDaysToYmd(date, 1);
        const dayBlockStart = localDateTimeInTimezoneToUTC(date, startClock, block.timezone);
        const dayBlockEnd = localDateTimeInTimezoneToUTC(endDateForClock, endClock, block.timezone);
        blockedRanges.push({ startTime: dayBlockStart, endTime: dayBlockEnd });
      } else {
        // One-time block: use the stored UTC range directly
        blockedRanges.push({ startTime: block.startTime, endTime: block.endTime });
      }
    }

    const slotMs   = slotDurationMinutes * 60_000;
    const slots: TimeSlot[] = [];
    const queryWindowStartMs = new Date(utcFrom).getTime();
    const queryWindowEndMs = new Date(utcTo).getTime();

    for (const avail of availabilities) {
      const bufferMs = avail.bufferMinutes * 60_000;

      // Filter by day-of-week if the availability has a day restriction.
      // Use the availability's own timezone for the day-of-week check (DST-safe).
      if (avail.daysOfWeek && avail.daysOfWeek.length > 0) {
        // Check which day the requested local date falls on, in the availability timezone.
        const requestedDayUTC = `${date}T12:00:00.000Z`; // noon UTC is a safe proxy for any TZ
        const dow = getDayOfWeekInTimezone(requestedDayUTC, avail.timezone) as DayOfWeek;
        if (!avail.daysOfWeek.includes(dow)) continue;
      }

      let windowStart = Math.max(new Date(avail.startTime).getTime(), queryWindowStartMs);
      let windowEnd = Math.min(new Date(avail.endTime).getTime(), queryWindowEndMs);

      // Weekly availability represents recurring daily hours across a date span.
      // Build only this requested day's working window (in availability timezone)
      // so we do not iterate across the full multi-month span.
      if (avail.type === AvailabilityType.WEEK) {
        const startClock = getLocalTimeInTimezone(avail.startTime, avail.timezone);
        const endClock = getLocalTimeInTimezone(avail.endTime, avail.timezone);
        const endDateForClock = endClock > startClock ? date : addDaysToYmd(date, 1);

        const dayWindowStart = new Date(localDateTimeInTimezoneToUTC(date, startClock, avail.timezone)).getTime();
        const dayWindowEnd = new Date(localDateTimeInTimezoneToUTC(endDateForClock, endClock, avail.timezone)).getTime();

        windowStart = Math.max(windowStart, dayWindowStart);
        windowEnd = Math.min(windowEnd, dayWindowEnd);
      }

      if (windowEnd <= windowStart) continue;

      let cursor = windowStart;
      while (cursor + slotMs <= windowEnd) {
        const slotStart = cursor;
        const slotEnd   = cursor + slotMs;

        const slotStartIso = new Date(slotStart).toISOString();
        const slotEndIso   = new Date(slotEnd).toISOString();

        // Expand the candidate slot by buffer on both sides for conflict detection.
        const checkStart = new Date(slotStart - bufferMs).toISOString();
        const checkEnd   = new Date(slotEnd   + bufferMs).toISOString();

        const hasConflict = existingAppointments.some(appt =>
          rangesOverlap(checkStart, checkEnd, appt.startTime, appt.endTime),
        );

        const isBlocked = blockedRanges.some(br =>
          rangesOverlap(slotStartIso, slotEndIso, br.startTime, br.endTime),
        );

        if (!hasConflict && !isBlocked) {
          slots.push({ startTime: slotStartIso, endTime: slotEndIso });
        }

        // Advance cursor by slot duration + inter-slot buffer.
        cursor = slotEnd + bufferMs;
      }
    }

    // Sort, deduplicate, then enforce that every returned slot actually
    // falls on the requested calendar date in the client's timezone.
    // This prevents adjacent-day leakage caused by the ±14 h UTC search
    // range pulling in records that start on the previous local day.
    return slots
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .filter((s, idx, arr) => idx === 0 || s.startTime !== arr[idx - 1].startTime)
      .filter(s => getLocalDateInTimezone(s.startTime, clientTimezone) === date);
  }

  /**
   * Confirm that a specific UTC time range has no conflicting appointments.
   * Used as the final guard before persisting a booking.
   */
  async isSlotAvailable(params: {
    userId:               UUID;
    startTime:            string;
    endTime:              string;
    tenant:               TenantContext;
    excludeAppointmentId?: UUID;
  }): Promise<boolean> {
    const conflicts = await appointmentRepository.findConflicting(
      params.userId,
      params.startTime,
      params.endTime,
      params.tenant,
      params.excludeAppointmentId,
    );
    return conflicts.length === 0;
  }
}

export const schedulingService = new SchedulingService();
