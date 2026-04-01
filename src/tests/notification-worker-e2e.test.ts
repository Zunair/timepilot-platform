import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UUID, Notification } from '../types/index.js';
import { NotificationChannel, NotificationStatus, NotificationType } from '../types/index.js';

// ---------------------------------------------------------------------------
// Mocks — order matters: vi.mock calls are hoisted before imports
// ---------------------------------------------------------------------------

const mockSendMail = vi.fn();

vi.mock('../config/env.js', () => ({
  env: {
    SMTP_HOST: 'smtp.test',
    SMTP_PORT: 587,
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    SMTP_FROM: 'noreply@test.com',
  },
}));

vi.mock('../config/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../repositories/NotificationRepository.js', () => ({
  notificationRepository: {
    findPendingForRetry: vi.fn().mockResolvedValue([]),
    markSent: vi.fn(),
    markFailed: vi.fn(),
    markDeadLetter: vi.fn(),
  },
}));

vi.mock('../repositories/AppointmentRepository.js', () => ({
  appointmentRepository: { findByConfirmationRef: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../repositories/EmailTemplateRepository.js', () => ({
  emailTemplateRepository: { findByOrgAndType: vi.fn().mockResolvedValue(null) },
}));

vi.mock('../services/GoogleMailboxService.js', () => ({
  sendViaGoogleUserMailbox: vi.fn(),
}));

vi.mock('../services/MicrosoftMailboxService.js', () => ({
  sendViaMicrosoftUserMailbox: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: mockSendMail }),
  },
}));

import { query as dbQuery } from '../config/db.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { sendViaGoogleUserMailbox } from '../services/GoogleMailboxService.js';
import { sendViaMicrosoftUserMailbox } from '../services/MicrosoftMailboxService.js';
import { startNotificationWorker, stopNotificationWorker } from '../workers/NotificationWorker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-e2e-1' as UUID,
    organizationId: 'org-1' as UUID,
    appointmentId: 'appt-1' as UUID,
    type: NotificationType.BOOKING_CONFIRMATION,
    channel: NotificationChannel.EMAIL,
    recipient: 'client@example.com',
    status: NotificationStatus.PENDING,
    idempotencyKey: 'key-e2e-1',
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const APPOINTMENT_ROW = {
  id: 'appt-1',
  organization_id: 'org-1',
  user_id: 'user-1',
  client_name: 'Alice',
  client_email: 'client@example.com',
  client_phone: null,
  status: 'scheduled',
  start_time: new Date('2026-04-01T10:00:00Z'),
  end_time: new Date('2026-04-01T11:00:00Z'),
  timezone: 'America/New_York',
  notes: null,
  confirmation_ref: 'TP-20260401-ABCDEFGH',
  created_at: new Date(),
  updated_at: new Date(),
};

/** Start the worker, let the immediate tick complete, then stop. */
async function runSingleTick(): Promise<void> {
  startNotificationWorker(999_999);
  await new Promise(resolve => setTimeout(resolve, 80));
  stopNotificationWorker();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationWorker email delivery chain (Google → Microsoft → SMTP)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbQuery).mockResolvedValue({ rows: [APPOINTMENT_ROW], rowCount: 1 } as any);
  });

  it('sends via Google Gmail when available and marks sent', async () => {
    const notification = makeNotification();
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);
    vi.mocked(sendViaGoogleUserMailbox).mockResolvedValueOnce(true);

    await runSingleTick();

    expect(sendViaGoogleUserMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        recipient: 'client@example.com',
        subject: expect.any(String),
        html: expect.any(String),
      }),
    );
    expect(sendViaMicrosoftUserMailbox).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(notificationRepository.markSent).toHaveBeenCalledWith(notification.id);
  });

  it('falls through to Microsoft when Google returns false', async () => {
    const notification = makeNotification();
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);
    vi.mocked(sendViaGoogleUserMailbox).mockResolvedValueOnce(false);
    vi.mocked(sendViaMicrosoftUserMailbox).mockResolvedValueOnce(true);

    await runSingleTick();

    expect(sendViaGoogleUserMailbox).toHaveBeenCalled();
    expect(sendViaMicrosoftUserMailbox).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        recipient: 'client@example.com',
      }),
    );
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(notificationRepository.markSent).toHaveBeenCalledWith(notification.id);
  });

  it('falls through to SMTP when both Google and Microsoft return false', async () => {
    const notification = makeNotification();
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);
    vi.mocked(sendViaGoogleUserMailbox).mockResolvedValueOnce(false);
    vi.mocked(sendViaMicrosoftUserMailbox).mockResolvedValueOnce(false);
    mockSendMail.mockResolvedValueOnce({ messageId: 'smtp-msg-1' });

    await runSingleTick();

    expect(sendViaGoogleUserMailbox).toHaveBeenCalled();
    expect(sendViaMicrosoftUserMailbox).toHaveBeenCalled();
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'noreply@test.com',
        to: 'client@example.com',
        subject: expect.any(String),
        html: expect.any(String),
      }),
    );
    expect(notificationRepository.markSent).toHaveBeenCalledWith(notification.id);
  });

  it('marks failed with retry when SMTP also fails on a retryable attempt', async () => {
    const notification = makeNotification({ attempts: 1 });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);
    vi.mocked(sendViaGoogleUserMailbox).mockResolvedValueOnce(false);
    vi.mocked(sendViaMicrosoftUserMailbox).mockResolvedValueOnce(false);
    mockSendMail.mockRejectedValueOnce(new Error('Connection refused'));

    await runSingleTick();

    expect(notificationRepository.markFailed).toHaveBeenCalledWith(
      notification.id,
      'Connection refused',
      expect.any(String), // nextRetryAt ISO timestamp
    );
    expect(notificationRepository.markSent).not.toHaveBeenCalled();
    expect(notificationRepository.markDeadLetter).not.toHaveBeenCalled();
  });

  it('dead-letters when all providers fail and max attempts exhausted', async () => {
    const notification = makeNotification({ attempts: 4, status: NotificationStatus.FAILED });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);
    vi.mocked(sendViaGoogleUserMailbox).mockResolvedValueOnce(false);
    vi.mocked(sendViaMicrosoftUserMailbox).mockResolvedValueOnce(false);
    mockSendMail.mockRejectedValueOnce(new Error('Connection refused'));

    await runSingleTick();

    expect(notificationRepository.markDeadLetter).toHaveBeenCalledWith(
      notification.id,
      'Connection refused',
    );
    expect(notificationRepository.markFailed).not.toHaveBeenCalled();
    expect(notificationRepository.markSent).not.toHaveBeenCalled();
  });

  it('marks failed when appointment is not found in DB', async () => {
    const notification = makeNotification();
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);
    vi.mocked(dbQuery).mockResolvedValue({ rows: [], rowCount: 0 } as any);

    await runSingleTick();

    expect(notificationRepository.markFailed).toHaveBeenCalledWith(
      notification.id,
      'Appointment not found',
    );
    expect(sendViaGoogleUserMailbox).not.toHaveBeenCalled();
  });

  it('includes .ics attachment for booking confirmation emails', async () => {
    const notification = makeNotification({ type: NotificationType.BOOKING_CONFIRMATION });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);
    vi.mocked(sendViaGoogleUserMailbox).mockResolvedValueOnce(true);

    await runSingleTick();

    const callArgs = vi.mocked(sendViaGoogleUserMailbox).mock.calls[0][0];
    expect(callArgs.attachments).toBeDefined();
    expect(callArgs.attachments).toHaveLength(1);
    expect(callArgs.attachments![0].filename).toMatch(/\.ics$/);
  });

  it('omits .ics attachment for reminder notifications', async () => {
    const notification = makeNotification({ type: NotificationType.BOOKING_REMINDER });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);
    vi.mocked(sendViaGoogleUserMailbox).mockResolvedValueOnce(true);

    await runSingleTick();

    const callArgs = vi.mocked(sendViaGoogleUserMailbox).mock.calls[0][0];
    expect(callArgs.attachments).toBeUndefined();
  });

  it('includes .ics attachment for rescheduled notifications', async () => {
    const notification = makeNotification({ type: NotificationType.BOOKING_RESCHEDULED });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);
    vi.mocked(sendViaGoogleUserMailbox).mockResolvedValueOnce(true);

    await runSingleTick();

    const callArgs = vi.mocked(sendViaGoogleUserMailbox).mock.calls[0][0];
    expect(callArgs.attachments).toBeDefined();
    expect(callArgs.attachments![0].filename).toMatch(/\.ics$/);
  });
});

describe('NotificationWorker SMS delivery path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbQuery).mockResolvedValue({ rows: [APPOINTMENT_ROW], rowCount: 1 } as any);
  });

  it('skips email providers for SMS channel and marks sent when Twilio is unconfigured', async () => {
    const notification = makeNotification({
      channel: NotificationChannel.SMS,
      recipient: '+15551234567',
    });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);

    await runSingleTick();

    // SMS path does not call email providers
    expect(sendViaGoogleUserMailbox).not.toHaveBeenCalled();
    expect(sendViaMicrosoftUserMailbox).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
    // Twilio is not configured — sendSMS logs a warning and returns without throwing
    expect(notificationRepository.markSent).toHaveBeenCalledWith(notification.id);
  });
});
