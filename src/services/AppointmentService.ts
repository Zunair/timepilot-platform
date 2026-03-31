import { UUID, TenantContext, NotificationType } from '../types/index.js';
import type { Appointment } from '../types/index.js';
import { appointmentRepository } from '../repositories/AppointmentRepository.js';
import { schedulingService } from './SchedulingService.js';
import { notificationService } from './NotificationService.js';
import { generateConfirmationRef } from '../utils/confirmation.js';

export interface CreateAppointmentParams {
  organizationId: UUID;
  userId:         UUID;
  clientName:     string;
  clientEmail:    string;
  clientPhone?:   string;
  startTime:      string; // UTC ISO
  endTime:        string; // UTC ISO
  timezone:       string; // Client's display timezone (stored for intent auditing)
  notes?:         string;
  tenant:         TenantContext;
}

export interface UpdateAppointmentDetailsParams {
  appointmentId: UUID;
  clientName?: string;
  clientEmail?: string;
  clientPhone?: string;
  notes?: string;
  timezone?: string;
  tenant: TenantContext;
}

export interface RescheduleAppointmentParams {
  appointmentId: UUID;
  startTime: string; // UTC ISO
  endTime: string; // UTC ISO
  timezone?: string;
  tenant: TenantContext;
}

export class AppointmentService {
  /**
   * Book a new appointment.
   * Validates slot availability atomically before persisting so concurrent
   * bookings for the same slot are rejected cleanly.
   */
  async create(params: CreateAppointmentParams): Promise<Appointment> {
    const { userId, startTime, endTime, tenant } = params;

    const available = await schedulingService.isSlotAvailable({
      userId, startTime, endTime, tenant,
    });
    if (!available) {
      throw Object.assign(
        new Error('The requested time slot is no longer available'),
        { code: 'SLOT_UNAVAILABLE', statusCode: 409 },
      );
    }

    const appointment = await appointmentRepository.create({
      organizationId: params.organizationId,
      userId,
      clientName:     params.clientName,
      clientEmail:    params.clientEmail,
      clientPhone:    params.clientPhone,
      startTime,
      endTime,
      timezone:       params.timezone,
      notes:          params.notes,
      confirmationRef: generateConfirmationRef(),
    });

    // Fire-and-forget — notification failure must not roll back a successful booking.
    notificationService
      .enqueueForAppointment(appointment, NotificationType.BOOKING_CONFIRMATION)
      .catch(err => console.error('[AppointmentService] notification enqueue failed:', err));

    return appointment;
  }

  async cancel(appointmentId: UUID, tenant: TenantContext): Promise<Appointment> {
    const appointment = await appointmentRepository.cancel(appointmentId, tenant);

    notificationService
      .enqueueForAppointment(appointment, NotificationType.BOOKING_CANCELLATION)
      .catch(err => console.error('[AppointmentService] cancellation notification failed:', err));

    return appointment;
  }

  async updateDetails(params: UpdateAppointmentDetailsParams): Promise<Appointment> {
    const existing = await appointmentRepository.findByIdScoped(params.appointmentId, params.tenant);
    if (!existing) {
      throw Object.assign(new Error('Appointment not found'), {
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    }
    if (existing.status !== 'scheduled') {
      throw Object.assign(new Error('Only scheduled appointments can be modified'), {
        code: 'APPOINTMENT_NOT_MODIFIABLE',
        statusCode: 409,
      });
    }

    return appointmentRepository.updateDetails(params.appointmentId, params.tenant, {
      clientName: params.clientName,
      clientEmail: params.clientEmail,
      clientPhone: params.clientPhone,
      notes: params.notes,
      timezone: params.timezone,
    });
  }

  async reschedule(params: RescheduleAppointmentParams): Promise<Appointment> {
    const existing = await appointmentRepository.findByIdScoped(params.appointmentId, params.tenant);
    if (!existing) {
      throw Object.assign(new Error('Appointment not found'), {
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    }
    if (existing.status !== 'scheduled') {
      throw Object.assign(new Error('Only scheduled appointments can be rescheduled'), {
        code: 'APPOINTMENT_NOT_RESCHEDULABLE',
        statusCode: 409,
      });
    }

    const available = await schedulingService.isSlotAvailable({
      userId: existing.userId,
      startTime: params.startTime,
      endTime: params.endTime,
      tenant: params.tenant,
      excludeAppointmentId: existing.id,
    });
    if (!available) {
      throw Object.assign(new Error('The requested time slot is no longer available'), {
        code: 'SLOT_UNAVAILABLE',
        statusCode: 409,
      });
    }

    return appointmentRepository.reschedule(params.appointmentId, params.tenant, {
      startTime: params.startTime,
      endTime: params.endTime,
      timezone: params.timezone,
    }).then((rescheduled) => {
      // Fire-and-forget — notification failure must not roll back a successful reschedule.
      notificationService
        .enqueueForAppointment(rescheduled, NotificationType.BOOKING_RESCHEDULED)
        .catch(err => console.error('[AppointmentService] reschedule notification failed:', err));
      return rescheduled;
    });
  }

  async getByConfirmationRef(ref: string): Promise<Appointment | null> {
    return appointmentRepository.findByConfirmationRef(ref);
  }

  async listForUser(
    userId: UUID,
    tenant: TenantContext,
    options?: { status?: string; limit?: number; offset?: number },
  ): Promise<Appointment[]> {
    return appointmentRepository.findByUserId(userId, tenant, options);
  }
}

export const appointmentService = new AppointmentService();
