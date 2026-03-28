/**
 * Notification Worker
 *
 * Polls the notifications table for pending/retryable records and dispatches
 * them via email (nodemailer/SendGrid SMTP) or SMS (Twilio).
 *
 * Design:
 *  - DB-polling at a fixed interval (no external queue dependency for Phase 1).
 *  - Retries up to 5 times with exponential back-off (1 min, 2 min, 4 min …).
 *  - Idempotency keys prevent duplicate sends across worker restarts.
 *  - Credentials are optional: if not present the worker logs and skips.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { appointmentRepository } from '../repositories/AppointmentRepository.js';
import { sendViaGoogleUserMailbox } from '../services/GoogleMailboxService.js';
import { env } from '../config/env.js';
import { NotificationChannel, NotificationType } from '../types/index.js';
import type { Notification, Appointment, UUID } from '../types/index.js';

// ---------------------------------------------------------------------------
// Mail transport (SendGrid SMTP relay — optional)
// ---------------------------------------------------------------------------

function buildTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_PASS) {
    console.warn('[NotificationWorker] SMTP not configured — email notifications skipped');
    return null;
  }
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

let transporter: Transporter | null = null;

// ---------------------------------------------------------------------------
// Twilio SMS (optional)
// ---------------------------------------------------------------------------

async function sendSMS(to: string, body: string): Promise<void> {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_PHONE_NUMBER) {
    console.warn('[NotificationWorker] Twilio not configured — SMS notification skipped');
    return;
  }
  // Dynamic import keeps Twilio optional at startup: the worker can run
  // email-only even if Twilio credentials are absent.
  const twilio = (await import('twilio')).default;
  const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  await client.messages.create({
    from: env.TWILIO_PHONE_NUMBER,
    to,
    body,
  });
}

// ---------------------------------------------------------------------------
// Email template builder
// ---------------------------------------------------------------------------

function buildEmailContent(
  appointment: Appointment,
  type: NotificationType,
): { subject: string; html: string } {
  const { clientName, confirmationRef, startTime, timezone } = appointment;

  const displayTime = new Date(startTime).toLocaleString('en-US', {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  });

  const templates: Record<NotificationType, { subject: string; heading: string; body: string }> = {
    [NotificationType.BOOKING_CONFIRMATION]: {
      subject: `Booking confirmed — ${confirmationRef}`,
      heading: 'Your booking is confirmed ✓',
      body: `Hi ${clientName},<br><br>Your appointment has been confirmed for <strong>${displayTime}</strong>.<br>Confirmation reference: <strong>${confirmationRef}</strong>`,
    },
    [NotificationType.BOOKING_CANCELLATION]: {
      subject: `Booking cancelled — ${confirmationRef}`,
      heading: 'Your booking has been cancelled',
      body: `Hi ${clientName},<br><br>Your appointment scheduled for <strong>${displayTime}</strong> has been cancelled.<br>Reference: <strong>${confirmationRef}</strong>`,
    },
    [NotificationType.BOOKING_REMINDER]: {
      subject: `Reminder: upcoming appointment — ${confirmationRef}`,
      heading: 'Reminder: your appointment is coming up',
      body: `Hi ${clientName},<br><br>This is a reminder for your appointment on <strong>${displayTime}</strong>.<br>Reference: <strong>${confirmationRef}</strong>`,
    },
  };

  const t = templates[type];
  const html = `
    <!DOCTYPE html><html lang="en"><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
      <h2 style="color:#0f766e">${t.heading}</h2>
      <p>${t.body}</p>
      <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb">
      <p style="color:#6b7280;font-size:0.85rem">TimePilot — calendar booking platform</p>
    </body></html>`;

  return { subject: t.subject, html };
}

function buildSMSBody(appointment: Appointment, type: NotificationType): string {
  const displayTime = new Date(appointment.startTime).toLocaleString('en-US', {
    timeZone: appointment.timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const ref = appointment.confirmationRef;
  const messages: Record<NotificationType, string> = {
    [NotificationType.BOOKING_CONFIRMATION]: `TimePilot: Booking confirmed for ${displayTime}. Ref: ${ref}`,
    [NotificationType.BOOKING_CANCELLATION]: `TimePilot: Your booking on ${displayTime} has been cancelled. Ref: ${ref}`,
    [NotificationType.BOOKING_REMINDER]:     `TimePilot: Reminder — appointment on ${displayTime}. Ref: ${ref}`,
  };
  return messages[type];
}

// ---------------------------------------------------------------------------
// Back-off helper: 1 min → 2 min → 4 min → 8 min → 16 min
// ---------------------------------------------------------------------------

function nextRetryAt(attempts: number): string {
  const delayMs = Math.min(Math.pow(2, attempts) * 60_000, 16 * 60_000);
  return new Date(Date.now() + delayMs).toISOString();
}

// ---------------------------------------------------------------------------
// Processing loop
// ---------------------------------------------------------------------------

async function processOne(notification: Notification): Promise<void> {
  const appointment = await appointmentRepository.findByConfirmationRef(
    // We need to look up by appointmentId — fall back to a direct query via the
    // appointment repository's findById without tenant (worker is internal).
    '',
  ).then(() => null) // unused path; replaced below
    .catch(() => null);

  // Look up appointment directly since the worker runs internally (no tenant guard needed).
  const result = await (await import('../config/db.js')).query<Record<string, unknown>>(
    'SELECT * FROM appointments WHERE id = $1',
    [notification.appointmentId],
  );
  if ((result.rowCount ?? 0) === 0) {
    await notificationRepository.markFailed(notification.id, 'Appointment not found');
    return;
  }
  const row = result.rows[0];
  const appt: Appointment = {
    id: row.id as UUID,
    organizationId: row.organization_id as UUID,
    userId: row.user_id as UUID,
    clientName: row.client_name as string,
    clientEmail: row.client_email as string,
    clientPhone: row.client_phone as string | undefined,
    status: row.status as Appointment['status'],
    startTime: (row.start_time instanceof Date ? row.start_time.toISOString() : row.start_time) as string,
    endTime:   (row.end_time   instanceof Date ? row.end_time.toISOString()   : row.end_time)   as string,
    timezone: row.timezone as string,
    notes: row.notes as string | undefined,
    confirmationRef: row.confirmation_ref as string,
    createdAt: (row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at) as string,
    updatedAt: (row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at) as string,
  };

  try {
    if (notification.channel === NotificationChannel.EMAIL) {
      const { subject, html } = buildEmailContent(appt, notification.type);
      const sentViaGoogle = await sendViaGoogleUserMailbox({
        userId: appt.userId,
        recipient: notification.recipient,
        subject,
        html,
      });

      if (!sentViaGoogle) {
        if (!transporter) {
          throw new Error('Email notifications disabled: Gmail scope not granted and SMTP not configured');
        }
        await transporter.sendMail({
          from: env.SMTP_FROM ?? 'noreply@timepilot.app',
          to:   notification.recipient,
          subject,
          html,
        });
      }
    } else {
      const body = buildSMSBody(appt, notification.type);
      await sendSMS(notification.recipient, body);
    }

    await notificationRepository.markSent(notification.id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await notificationRepository.markFailed(
      notification.id,
      reason,
      nextRetryAt(notification.attempts),
    );
    console.error(`[NotificationWorker] Failed notification ${notification.id}:`, reason);
  }
}

let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startNotificationWorker(pollIntervalMs = 30_000): void {
  transporter = buildTransporter();

  const tick = async () => {
    try {
      const pending = await notificationRepository.findPendingForRetry(20);
      for (const notification of pending) {
        await processOne(notification);
      }
    } catch (err) {
      console.error('[NotificationWorker] poll error:', err);
    }
  };

  // Run immediately then on interval.
  void tick();
  workerInterval = setInterval(tick, pollIntervalMs);
  console.log(`[NotificationWorker] Started — polling every ${pollIntervalMs / 1000}s`);
}

export function stopNotificationWorker(): void {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}
