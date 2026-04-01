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
 *
 * Email delivery priority: Google Gmail → Microsoft Outlook → SMTP fallback.
 * Supports .ics calendar attachments for booking confirmations/reschedules.
 * Uses DB-driven templates when available, falling back to built-in defaults.
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { appointmentRepository } from '../repositories/AppointmentRepository.js';
import { emailTemplateRepository } from '../repositories/EmailTemplateRepository.js';
import { sendViaGoogleUserMailbox } from '../services/GoogleMailboxService.js';
import { sendViaMicrosoftUserMailbox } from '../services/MicrosoftMailboxService.js';
import { env } from '../config/env.js';
import { NotificationChannel, NotificationType } from '../types/index.js';
import type { Notification, Appointment, UUID } from '../types/index.js';
import { generateIcsAttachment } from '../utils/icsGenerator.js';
import type { IcsAttachment } from '../utils/icsGenerator.js';
import { renderTemplate, getDefaultTemplate } from '../utils/templateRenderer.js';
import type { TemplateVariables } from '../utils/templateRenderer.js';

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
// Email template builder (DB-first with built-in fallback)
// ---------------------------------------------------------------------------

function buildTemplateVariables(appointment: Appointment, orgName?: string, userName?: string): TemplateVariables {
  const displayDate = new Date(appointment.startTime).toLocaleDateString('en-US', {
    timeZone: appointment.timezone,
    dateStyle: 'full',
  });
  const displayTime = new Date(appointment.startTime).toLocaleTimeString('en-US', {
    timeZone: appointment.timezone,
    timeStyle: 'short',
  });
  const durationMs = new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime();
  const durationMinutes = String(Math.round(durationMs / 60_000));

  return {
    clientName: appointment.clientName,
    clientEmail: appointment.clientEmail,
    appointmentDate: displayDate,
    appointmentTime: displayTime,
    appointmentTimezone: appointment.timezone,
    appointmentDuration: durationMinutes,
    confirmationRef: appointment.confirmationRef,
    organizationName: orgName ?? 'TimePilot',
    userName: userName ?? '',
  };
}

async function buildEmailContent(
  appointment: Appointment,
  type: NotificationType,
): Promise<{ subject: string; html: string }> {
  const variables = buildTemplateVariables(appointment);

  // Try org-specific DB template first
  try {
    const dbTemplate = await emailTemplateRepository.findByOrgAndType(appointment.organizationId, type);
    if (dbTemplate && dbTemplate.isActive) {
      return {
        subject: renderTemplate(dbTemplate.subject, variables),
        html: renderTemplate(dbTemplate.htmlBody, variables),
      };
    }
  } catch {
    // Fall through to defaults on any DB error
  }

  // Fall back to built-in defaults
  const defaults = getDefaultTemplate(type);
  return {
    subject: renderTemplate(defaults.subject, variables),
    html: renderTemplate(defaults.htmlBody, variables),
  };
}

function buildSMSBody(appointment: Appointment, type: NotificationType): string {
  const displayTime = new Date(appointment.startTime).toLocaleString('en-US', {
    timeZone: appointment.timezone,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const ref = appointment.confirmationRef;
  const messages: Record<string, string> = {
    [NotificationType.BOOKING_CONFIRMATION]: `TimePilot: Booking confirmed for ${displayTime}. Ref: ${ref}`,
    [NotificationType.BOOKING_CANCELLATION]: `TimePilot: Your booking on ${displayTime} has been cancelled. Ref: ${ref}`,
    [NotificationType.BOOKING_REMINDER]:     `TimePilot: Reminder — appointment on ${displayTime}. Ref: ${ref}`,
    [NotificationType.BOOKING_RESCHEDULED]:  `TimePilot: Your booking has been moved to ${displayTime}. Ref: ${ref}`,
  };
  return messages[type] ?? `TimePilot: Notification for ${displayTime}. Ref: ${ref}`;
}

// ---------------------------------------------------------------------------
// Back-off helper: 1 min → 2 min → 4 min → 8 min → 16 min
// ---------------------------------------------------------------------------

function nextRetryAt(attempts: number): string {
  const delayMs = Math.min(Math.pow(2, attempts) * 60_000, 16 * 60_000);
  return new Date(Date.now() + delayMs).toISOString();
}

// ---------------------------------------------------------------------------
// .ics attachment helper
// ---------------------------------------------------------------------------

const ICS_ELIGIBLE_TYPES = new Set<string>([
  NotificationType.BOOKING_CONFIRMATION,
  NotificationType.BOOKING_RESCHEDULED,
]);

function buildIcsForAppointment(appointment: Appointment, type: NotificationType): IcsAttachment | null {
  if (!ICS_ELIGIBLE_TYPES.has(type)) return null;
  return generateIcsAttachment({
    uid: appointment.id,
    summary: `Appointment — ${appointment.confirmationRef}`,
    description: `Booking with ${appointment.clientName} (${appointment.confirmationRef})`,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    attendeeName: appointment.clientName,
    attendeeEmail: appointment.clientEmail,
    status: type === NotificationType.BOOKING_CONFIRMATION ? 'CONFIRMED' : 'CONFIRMED',
  });
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
      const { subject, html } = await buildEmailContent(appt, notification.type);
      const icsAttachment = buildIcsForAppointment(appt, notification.type);

      // Try Google Gmail first
      const sentViaGoogle = await sendViaGoogleUserMailbox({
        userId: appt.userId,
        recipient: notification.recipient,
        subject,
        html,
        attachments: icsAttachment ? [icsAttachment] : undefined,
      });

      if (!sentViaGoogle) {
        // Try Microsoft Outlook
        const sentViaMicrosoft = await sendViaMicrosoftUserMailbox({
          userId: appt.userId,
          recipient: notification.recipient,
          subject,
          html,
          attachments: icsAttachment ? [icsAttachment] : undefined,
        });

        if (!sentViaMicrosoft) {
          // Fall back to SMTP
          if (!transporter) {
            throw new Error('Email notifications disabled: Gmail/Outlook scope not granted and SMTP not configured');
          }
          const smtpAttachments = icsAttachment
            ? [{ filename: icsAttachment.filename, content: Buffer.from(icsAttachment.content, 'base64'), contentType: icsAttachment.contentType }]
            : undefined;
          await transporter.sendMail({
            from: env.SMTP_FROM ?? 'noreply@timepilot.app',
            to:   notification.recipient,
            subject,
            html,
            attachments: smtpAttachments,
          });
        }
      }
    } else {
      const body = buildSMSBody(appt, notification.type);
      await sendSMS(notification.recipient, body);
    }

    await notificationRepository.markSent(notification.id);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (notification.attempts + 1 >= 5) {
      await notificationRepository.markDeadLetter(notification.id, reason);
      console.warn(`[NotificationWorker] Notification ${notification.id} moved to dead-letter after ${notification.attempts + 1} attempts`);
    } else {
      await notificationRepository.markFailed(
        notification.id,
        reason,
        nextRetryAt(notification.attempts),
      );
      console.error(`[NotificationWorker] Failed notification ${notification.id}:`, reason);
    }
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
