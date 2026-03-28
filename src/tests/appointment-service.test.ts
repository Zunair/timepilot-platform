import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Appointment, TenantContext, UUID } from '../types/index.js';
import { RoleType } from '../types/index.js';

vi.mock('../repositories/AppointmentRepository.js', () => ({
  appointmentRepository: {
    create: vi.fn(),
    cancel: vi.fn(),
    findByConfirmationRef: vi.fn(),
    findByUserId: vi.fn(),
    findByIdScoped: vi.fn(),
    updateDetails: vi.fn(),
    reschedule: vi.fn(),
  },
}));

vi.mock('../services/SchedulingService.js', () => ({
  schedulingService: {
    isSlotAvailable: vi.fn(),
  },
}));

vi.mock('../services/NotificationService.js', () => ({
  notificationService: {
    enqueueForAppointment: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../utils/confirmation.js', () => ({
  generateConfirmationRef: vi.fn(() => 'TP-20260327-ABCDEFGH'),
}));

import { appointmentService } from '../services/AppointmentService.js';
import { appointmentRepository } from '../repositories/AppointmentRepository.js';
import { schedulingService } from '../services/SchedulingService.js';

const ORG_ID = 'org-1' as UUID;
const USER_ID = 'user-1' as UUID;
const APPT_ID = 'appt-1' as UUID;

const tenant: TenantContext = {
  organizationId: ORG_ID,
  userId: USER_ID,
  role: RoleType.ADMIN,
};

const scheduledAppointment: Appointment = {
  id: APPT_ID,
  organizationId: ORG_ID,
  userId: USER_ID,
  clientName: 'Jane Client',
  clientEmail: 'jane@example.com',
  clientPhone: '1234567890',
  status: 'scheduled',
  startTime: '2026-03-27T09:00:00.000Z',
  endTime: '2026-03-27T09:30:00.000Z',
  timezone: 'UTC',
  notes: 'initial note',
  confirmationRef: 'TP-20260327-ABCDEFGH',
  createdAt: '2026-03-27T08:00:00.000Z',
  updatedAt: '2026-03-27T08:00:00.000Z',
};

describe('AppointmentService update and reschedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates appointment details for scheduled appointments', async () => {
    vi.mocked(appointmentRepository.findByIdScoped).mockResolvedValue(scheduledAppointment);
    vi.mocked(appointmentRepository.updateDetails).mockResolvedValue({
      ...scheduledAppointment,
      clientName: 'Updated Name',
      notes: 'Updated note',
      updatedAt: '2026-03-27T08:05:00.000Z',
    });

    const updated = await appointmentService.updateDetails({
      appointmentId: APPT_ID,
      tenant,
      clientName: 'Updated Name',
      notes: 'Updated note',
    });

    expect(updated.clientName).toBe('Updated Name');
    expect(updated.notes).toBe('Updated note');
    expect(appointmentRepository.updateDetails).toHaveBeenCalledWith(
      APPT_ID,
      tenant,
      expect.objectContaining({ clientName: 'Updated Name', notes: 'Updated note' }),
    );
  });

  it('rejects detail update when appointment is not found', async () => {
    vi.mocked(appointmentRepository.findByIdScoped).mockResolvedValue(null);

    await expect(
      appointmentService.updateDetails({
        appointmentId: APPT_ID,
        tenant,
        clientName: 'Updated Name',
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
  });

  it('reschedules when slot is available and excludes current appointment from conflict check', async () => {
    const nextStart = '2026-03-27T10:00:00.000Z';
    const nextEnd = '2026-03-27T10:30:00.000Z';

    vi.mocked(appointmentRepository.findByIdScoped).mockResolvedValue(scheduledAppointment);
    vi.mocked(schedulingService.isSlotAvailable).mockResolvedValue(true);
    vi.mocked(appointmentRepository.reschedule).mockResolvedValue({
      ...scheduledAppointment,
      startTime: nextStart,
      endTime: nextEnd,
      updatedAt: '2026-03-27T08:10:00.000Z',
    });

    const updated = await appointmentService.reschedule({
      appointmentId: APPT_ID,
      startTime: nextStart,
      endTime: nextEnd,
      tenant,
    });

    expect(updated.startTime).toBe(nextStart);
    expect(updated.endTime).toBe(nextEnd);
    expect(schedulingService.isSlotAvailable).toHaveBeenCalledWith({
      userId: USER_ID,
      startTime: nextStart,
      endTime: nextEnd,
      tenant,
      excludeAppointmentId: APPT_ID,
    });
  });

  it('rejects reschedule when slot is unavailable', async () => {
    vi.mocked(appointmentRepository.findByIdScoped).mockResolvedValue(scheduledAppointment);
    vi.mocked(schedulingService.isSlotAvailable).mockResolvedValue(false);

    await expect(
      appointmentService.reschedule({
        appointmentId: APPT_ID,
        startTime: '2026-03-27T10:00:00.000Z',
        endTime: '2026-03-27T10:30:00.000Z',
        tenant,
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'SLOT_UNAVAILABLE' });

    expect(appointmentRepository.reschedule).not.toHaveBeenCalled();
  });
});
