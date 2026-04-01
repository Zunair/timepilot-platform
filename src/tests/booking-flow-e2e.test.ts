/**
 * Full Booking Flow E2E Test
 *
 * Exercises the entire client booking lifecycle through the service layer:
 *   1. Slot lookup via SchedulingService
 *   2. Appointment creation via AppointmentService (with slot validation)
 *   3. Notification enqueued on successful booking
 *   4. Confirmation reference lookup
 *   5. Appointment cancellation with cancellation notification
 *   6. Appointment rescheduling with reschedule notification
 *   7. Conflict rejection for double-booking
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appointment, TenantContext, UUID } from '../types/index.js';
import { RoleType, NotificationType } from '../types/index.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../repositories/AppointmentRepository.js', () => ({
  appointmentRepository: {
    create: vi.fn(),
    cancel: vi.fn(),
    findByConfirmationRef: vi.fn(),
    findByUserId: vi.fn(),
    findByIdScoped: vi.fn(),
    findConflicting: vi.fn(),
    updateDetails: vi.fn(),
    reschedule: vi.fn(),
  },
}));

vi.mock('../repositories/AvailabilityRepository.js', () => ({
  availabilityRepository: {
    findActiveInRange: vi.fn(),
  },
}));

vi.mock('../repositories/TimeBlockRepository.js', () => ({
  timeBlockRepository: {
    findActiveInRange: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../services/NotificationService.js', () => ({
  notificationService: {
    enqueueForAppointment: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../utils/confirmation.js', () => ({
  generateConfirmationRef: vi.fn(() => 'TP-20260401-TESTREF1'),
}));

import { appointmentService } from '../services/AppointmentService.js';
import { appointmentRepository } from '../repositories/AppointmentRepository.js';
import { schedulingService } from '../services/SchedulingService.js';
import { availabilityRepository } from '../repositories/AvailabilityRepository.js';
import { notificationService } from '../services/NotificationService.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-e2e-1' as UUID;
const USER_ID = 'user-e2e-1' as UUID;
const APPT_ID = 'appt-e2e-1' as UUID;

const tenant: TenantContext = {
  organizationId: ORG_ID,
  userId: USER_ID,
  role: RoleType.ADMIN,
};

const SLOT_START = '2026-04-01T14:00:00.000Z';
const SLOT_END = '2026-04-01T15:00:00.000Z';

function makeAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: APPT_ID,
    organizationId: ORG_ID,
    userId: USER_ID,
    clientName: 'Alice Test',
    clientEmail: 'alice@example.com',
    clientPhone: '+15551234567',
    status: 'scheduled',
    startTime: SLOT_START,
    endTime: SLOT_END,
    timezone: 'America/New_York',
    notes: 'Test booking',
    confirmationRef: 'TP-20260401-TESTREF1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Full booking flow E2E', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Step 1: Slot availability lookup', () => {
    it('returns available slots from scheduling service when availability exists', async () => {
      vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([
        {
          id: 'avail-1' as UUID,
          organizationId: ORG_ID,
          userId: USER_ID,
          type: 'week' as any,
          startTime: '2026-03-01T13:00:00.000Z',
          endTime: '2026-06-01T21:00:00.000Z',
          daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
          bufferMinutes: 0,
          timezone: 'America/New_York',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ] as any);
      vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([]);

      const slots = await schedulingService.getAvailableSlots({
        userId: USER_ID,
        date: '2026-04-01', // Wednesday
        clientTimezone: 'America/New_York',
        slotDurationMinutes: 60,
        tenant,
      });

      expect(slots.length).toBeGreaterThan(0);
      // All slots should be within the requested date boundaries in the client timezone
      for (const slot of slots) {
        expect(slot.startTime).toBeDefined();
        expect(slot.endTime).toBeDefined();
        expect(new Date(slot.endTime).getTime()).toBeGreaterThan(new Date(slot.startTime).getTime());
      }
    });

    it('returns empty when no availability windows exist', async () => {
      vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([]);

      const slots = await schedulingService.getAvailableSlots({
        userId: USER_ID,
        date: '2026-04-01',
        clientTimezone: 'America/New_York',
        slotDurationMinutes: 60,
        tenant,
      });

      expect(slots).toEqual([]);
    });
  });

  describe('Step 2: Appointment creation with slot validation', () => {
    it('creates appointment when slot is available and enqueues confirmation notification', async () => {
      const created = makeAppointment();
      vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([]);
      vi.mocked(appointmentRepository.create).mockResolvedValue(created);

      const result = await appointmentService.create({
        organizationId: ORG_ID,
        userId: USER_ID,
        clientName: 'Alice Test',
        clientEmail: 'alice@example.com',
        clientPhone: '+15551234567',
        startTime: SLOT_START,
        endTime: SLOT_END,
        timezone: 'America/New_York',
        notes: 'Test booking',
        tenant,
      });

      expect(result.id).toBe(APPT_ID);
      expect(result.confirmationRef).toBe('TP-20260401-TESTREF1');
      expect(result.status).toBe('scheduled');

      // Notification should be enqueued for confirmation
      expect(notificationService.enqueueForAppointment).toHaveBeenCalledWith(
        created,
        NotificationType.BOOKING_CONFIRMATION,
      );
    });

    it('rejects double-booking with SLOT_UNAVAILABLE error', async () => {
      vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([makeAppointment()]);

      await expect(
        appointmentService.create({
          organizationId: ORG_ID,
          userId: USER_ID,
          clientName: 'Bob Test',
          clientEmail: 'bob@example.com',
          startTime: SLOT_START,
          endTime: SLOT_END,
          timezone: 'America/New_York',
          tenant,
        }),
      ).rejects.toThrow('The requested time slot is no longer available');
    });

    it('succeeds even if notification enqueue fails (fire-and-forget)', async () => {
      const created = makeAppointment();
      vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([]);
      vi.mocked(appointmentRepository.create).mockResolvedValue(created);
      vi.mocked(notificationService.enqueueForAppointment).mockRejectedValueOnce(
        new Error('DB connection lost'),
      );

      const result = await appointmentService.create({
        organizationId: ORG_ID,
        userId: USER_ID,
        clientName: 'Alice Test',
        clientEmail: 'alice@example.com',
        startTime: SLOT_START,
        endTime: SLOT_END,
        timezone: 'America/New_York',
        tenant,
      });

      // Booking must succeed even though notification failed
      expect(result.id).toBe(APPT_ID);
    });
  });

  describe('Step 3: Confirmation reference lookup', () => {
    it('returns appointment by confirmation reference', async () => {
      const appointment = makeAppointment();
      vi.mocked(appointmentRepository.findByConfirmationRef).mockResolvedValue(appointment);

      const result = await appointmentService.getByConfirmationRef('TP-20260401-TESTREF1');

      expect(result).not.toBeNull();
      expect(result!.confirmationRef).toBe('TP-20260401-TESTREF1');
      expect(result!.clientName).toBe('Alice Test');
      expect(result!.status).toBe('scheduled');
    });

    it('returns null for non-existent confirmation reference', async () => {
      vi.mocked(appointmentRepository.findByConfirmationRef).mockResolvedValue(null);

      const result = await appointmentService.getByConfirmationRef('TP-00000000-INVALID');

      expect(result).toBeNull();
    });
  });

  describe('Step 4: Appointment cancellation', () => {
    it('cancels appointment and enqueues cancellation notification', async () => {
      const cancelled = makeAppointment({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
      });
      vi.mocked(appointmentRepository.cancel).mockResolvedValue(cancelled);

      const result = await appointmentService.cancel(APPT_ID, tenant);

      expect(result.status).toBe('cancelled');
      expect(notificationService.enqueueForAppointment).toHaveBeenCalledWith(
        cancelled,
        NotificationType.BOOKING_CANCELLATION,
      );
    });
  });

  describe('Step 5: Appointment rescheduling', () => {
    it('reschedules to a new slot and enqueues rescheduled notification', async () => {
      const newStart = '2026-04-02T14:00:00.000Z';
      const newEnd = '2026-04-02T15:00:00.000Z';
      const rescheduled = makeAppointment({ startTime: newStart, endTime: newEnd });

      vi.mocked(appointmentRepository.findByIdScoped).mockResolvedValue(makeAppointment());
      vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([]);
      vi.mocked(appointmentRepository.reschedule).mockResolvedValue(rescheduled);

      const result = await appointmentService.reschedule({
        appointmentId: APPT_ID,
        startTime: newStart,
        endTime: newEnd,
        timezone: 'America/New_York',
        tenant,
      });

      expect(result.startTime).toBe(newStart);
      expect(result.endTime).toBe(newEnd);
      expect(notificationService.enqueueForAppointment).toHaveBeenCalledWith(
        rescheduled,
        NotificationType.BOOKING_RESCHEDULED,
      );
    });

    it('rejects reschedule to a conflicting slot', async () => {
      vi.mocked(appointmentRepository.findByIdScoped).mockResolvedValue(makeAppointment());
      vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([
        makeAppointment({ id: 'other-appt' as UUID }),
      ]);

      await expect(
        appointmentService.reschedule({
          appointmentId: APPT_ID,
          startTime: '2026-04-02T14:00:00.000Z',
          endTime: '2026-04-02T15:00:00.000Z',
          tenant,
        }),
      ).rejects.toThrow('The requested time slot is no longer available');
    });

    it('rejects reschedule of a cancelled appointment', async () => {
      vi.mocked(appointmentRepository.findByIdScoped).mockResolvedValue(
        makeAppointment({ status: 'cancelled' }),
      );

      await expect(
        appointmentService.reschedule({
          appointmentId: APPT_ID,
          startTime: '2026-04-02T14:00:00.000Z',
          endTime: '2026-04-02T15:00:00.000Z',
          tenant,
        }),
      ).rejects.toThrow('Only scheduled appointments can be rescheduled');
    });
  });

  describe('Step 6: List appointments for user', () => {
    it('returns appointments filtered by user and tenant', async () => {
      const appointments = [makeAppointment(), makeAppointment({ id: 'appt-2' as UUID })];
      vi.mocked(appointmentRepository.findByUserId).mockResolvedValue(appointments);

      const result = await appointmentService.listForUser(USER_ID, tenant);

      expect(result).toHaveLength(2);
      expect(appointmentRepository.findByUserId).toHaveBeenCalledWith(
        USER_ID,
        tenant,
        undefined,
      );
    });

    it('passes status filter to repository', async () => {
      vi.mocked(appointmentRepository.findByUserId).mockResolvedValue([]);

      await appointmentService.listForUser(USER_ID, tenant, { status: 'cancelled' });

      expect(appointmentRepository.findByUserId).toHaveBeenCalledWith(
        USER_ID,
        tenant,
        { status: 'cancelled' },
      );
    });
  });
});
