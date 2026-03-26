import { v4 as uuidv4 } from 'uuid';
import type { Appointment, UUID } from '../types/index.js';
import { NotificationType, NotificationChannel } from '../types/index.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';

export class NotificationService {
  /**
   * Persist email (and SMS if phone is available) notification records for
   * a given appointment lifecycle event. The notification worker picks up
   * pending records and handles actual delivery asynchronously.
   *
   * Failures to enqueue are soft-logged and do not surface to the caller —
   * a successful booking must not be rolled back due to notification issues.
   */
  async enqueueForAppointment(
    appointment: Appointment,
    type: NotificationType,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [
      notificationRepository.create({
        organizationId: appointment.organizationId,
        appointmentId:  appointment.id,
        type,
        channel:    NotificationChannel.EMAIL,
        recipient:  appointment.clientEmail,
        idempotencyKey: uuidv4() as UUID,
      }),
    ];

    if (appointment.clientPhone) {
      tasks.push(
        notificationRepository.create({
          organizationId: appointment.organizationId,
          appointmentId:  appointment.id,
          type,
          channel:    NotificationChannel.SMS,
          recipient:  appointment.clientPhone,
          idempotencyKey: uuidv4() as UUID,
        }),
      );
    }

    await Promise.allSettled(tasks);
  }
}

export const notificationService = new NotificationService();
