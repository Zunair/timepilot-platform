import { v4 as uuidv4 } from 'uuid';
import type { Appointment, UUID } from '../types/index.js';
import { NotificationType, NotificationChannel } from '../types/index.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { query as db } from '../config/db.js';

export class NotificationService {
  /**
   * Persist email (and SMS if phone is available) notification records for
   * a given appointment lifecycle event. The notification worker picks up
   * pending records and handles actual delivery asynchronously.
   *
   * Also creates a self-notification for the organizer (user) so they
   * receive a copy of each booking-related email.
   *
   * Failures to enqueue are soft-logged and do not surface to the caller —
   * a successful booking must not be rolled back due to notification issues.
   */
  async enqueueForAppointment(
    appointment: Appointment,
    type: NotificationType,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [
      // Client email notification
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

    // Send-to-self: enqueue an email to the organizer (user) as well
    const organizerEmail = await this.getUserEmail(appointment.userId);
    if (organizerEmail && organizerEmail !== appointment.clientEmail) {
      tasks.push(
        notificationRepository.create({
          organizationId: appointment.organizationId,
          appointmentId:  appointment.id,
          type,
          channel:    NotificationChannel.EMAIL,
          recipient:  organizerEmail,
          idempotencyKey: uuidv4() as UUID,
        }),
      );
    }

    await Promise.allSettled(tasks);
  }

  private async getUserEmail(userId: UUID): Promise<string | null> {
    try {
      const result = await db<Record<string, unknown>>(
        'SELECT email FROM users WHERE id = $1',
        [userId],
      );
      if ((result.rowCount ?? 0) === 0) return null;
      const email = result.rows[0]?.email as string | undefined;
      return email && email.trim().length > 0 ? email : null;
    } catch {
      return null;
    }
  }
}

export const notificationService = new NotificationService();
