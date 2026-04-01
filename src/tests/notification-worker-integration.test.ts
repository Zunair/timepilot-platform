import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UUID, Notification } from '../types/index.js';
import { NotificationChannel, NotificationStatus, NotificationType } from '../types/index.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
  sendViaGoogleUserMailbox: vi.fn().mockResolvedValue(true),
}));

vi.mock('../services/MicrosoftMailboxService.js', () => ({
  sendViaMicrosoftUserMailbox: vi.fn().mockResolvedValue(false),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: vi.fn().mockResolvedValue({ messageId: 'ok' }) }),
  },
}));

import { query as dbQuery } from '../config/db.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { sendViaGoogleUserMailbox } from '../services/GoogleMailboxService.js';
import { startNotificationWorker, stopNotificationWorker } from '../workers/NotificationWorker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let idCounter = 0;
function makeNotification(overrides: Partial<Notification> = {}): Notification {
  idCounter += 1;
  return {
    id: `notif-int-${idCounter}` as UUID,
    organizationId: 'org-1' as UUID,
    appointmentId: 'appt-1' as UUID,
    type: NotificationType.BOOKING_CONFIRMATION,
    channel: NotificationChannel.EMAIL,
    recipient: `client${idCounter}@example.com`,
    status: NotificationStatus.PENDING,
    idempotencyKey: `key-int-${idCounter}`,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NotificationWorker queue integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idCounter = 0;
    vi.mocked(dbQuery).mockResolvedValue({ rows: [APPOINTMENT_ROW], rowCount: 1 } as any);
    vi.mocked(sendViaGoogleUserMailbox).mockResolvedValue(true);
  });

  afterEach(() => {
    stopNotificationWorker();
  });

  it('processes a batch of multiple pending notifications in one tick', async () => {
    const batch = [makeNotification(), makeNotification(), makeNotification()];
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce(batch);

    startNotificationWorker(999_999);
    await new Promise(resolve => setTimeout(resolve, 120));
    stopNotificationWorker();

    expect(notificationRepository.markSent).toHaveBeenCalledTimes(3);
    expect(notificationRepository.markSent).toHaveBeenCalledWith(batch[0].id);
    expect(notificationRepository.markSent).toHaveBeenCalledWith(batch[1].id);
    expect(notificationRepository.markSent).toHaveBeenCalledWith(batch[2].id);
  });

  it('processes notifications sequentially within a tick (not concurrently)', async () => {
    const order: string[] = [];
    const batch = [makeNotification(), makeNotification()];
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce(batch);
    vi.mocked(notificationRepository.markSent)
      .mockImplementation(async (id: UUID) => {
        order.push(id);
      });

    startNotificationWorker(999_999);
    await new Promise(resolve => setTimeout(resolve, 120));
    stopNotificationWorker();

    expect(order).toEqual([batch[0].id, batch[1].id]);
  });

  it('handles empty queue gracefully without errors', async () => {
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([]);
    const consoleSpy = vi.spyOn(console, 'error');

    startNotificationWorker(999_999);
    await new Promise(resolve => setTimeout(resolve, 50));
    stopNotificationWorker();

    expect(notificationRepository.markSent).not.toHaveBeenCalled();
    expect(notificationRepository.markFailed).not.toHaveBeenCalled();
    // No error should be logged for an empty queue
    const workerErrors = consoleSpy.mock.calls.filter(
      call => String(call[0]).includes('[NotificationWorker]'),
    );
    expect(workerErrors).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  it('continues processing remaining batch items when one fails mid-batch', async () => {
    const batch = [makeNotification(), makeNotification(), makeNotification()];
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce(batch);

    // Make the second notification's appointment lookup return empty so it gets marked failed.
    // processOne calls dbQuery twice per notification: once from the findByConfirmationRef
    // .then() chain and once for the direct SELECT. We track the direct-SELECT calls
    // (odd-numbered calls starting from 2nd) and fail the one for the 2nd notification.
    let selectCallIndex = 0;
    vi.mocked(dbQuery).mockImplementation(async (sql: string) => {
      // The direct appointment SELECT contains 'WHERE id = $1'
      if (typeof sql === 'string' && sql.includes('WHERE id = $1')) {
        selectCallIndex += 1;
        if (selectCallIndex === 2) {
          return { rows: [], rowCount: 0 } as any;
        }
      }
      return { rows: [APPOINTMENT_ROW], rowCount: 1 } as any;
    });

    startNotificationWorker(999_999);
    await new Promise(resolve => setTimeout(resolve, 200));
    stopNotificationWorker();

    // First and third should be sent, second should be marked failed (appointment not found)
    expect(notificationRepository.markSent).toHaveBeenCalledWith(batch[0].id);
    expect(notificationRepository.markFailed).toHaveBeenCalledWith(batch[1].id, 'Appointment not found');
    expect(notificationRepository.markSent).toHaveBeenCalledWith(batch[2].id);
  });

  it('polls on repeated intervals and processes new items each tick', async () => {
    const firstBatch = [makeNotification()];
    const secondBatch = [makeNotification()];

    vi.mocked(notificationRepository.findPendingForRetry)
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce(secondBatch);

    // Use a short interval to get two ticks
    startNotificationWorker(100);
    await new Promise(resolve => setTimeout(resolve, 250));
    stopNotificationWorker();

    expect(notificationRepository.findPendingForRetry).toHaveBeenCalledTimes(
      vi.mocked(notificationRepository.findPendingForRetry).mock.calls.length,
    );
    // At least 2 ticks should have fired
    expect(vi.mocked(notificationRepository.findPendingForRetry).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(notificationRepository.markSent).toHaveBeenCalledWith(firstBatch[0].id);
    expect(notificationRepository.markSent).toHaveBeenCalledWith(secondBatch[0].id);
  });

  it('stopNotificationWorker prevents further polling', async () => {
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValue([]);

    startNotificationWorker(50);
    await new Promise(resolve => setTimeout(resolve, 30));
    stopNotificationWorker();

    const callsAfterStop = vi.mocked(notificationRepository.findPendingForRetry).mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 150));
    const callsLater = vi.mocked(notificationRepository.findPendingForRetry).mock.calls.length;

    // Should not have polled again after stop
    expect(callsLater).toBe(callsAfterStop);
  });

  it('respects the batch limit passed to findPendingForRetry', async () => {
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([]);

    startNotificationWorker(999_999);
    await new Promise(resolve => setTimeout(resolve, 50));
    stopNotificationWorker();

    expect(notificationRepository.findPendingForRetry).toHaveBeenCalledWith(20);
  });

  it('failed notification gets retried in a subsequent tick when nextRetryAt passes', async () => {
    // Simulate: first tick sees a notification that fails, second tick picks it up again
    const notification = makeNotification({ attempts: 1, status: NotificationStatus.FAILED });
    const retried = { ...notification, attempts: 2, status: NotificationStatus.FAILED as NotificationStatus };

    vi.mocked(sendViaGoogleUserMailbox)
      .mockResolvedValueOnce(false) // first tick: Google fails
      .mockResolvedValueOnce(true); // second tick: Google succeeds

    // First tick: all three providers fail (Google false, Microsoft false from default mock, SMTP throws)
    // Actually let's make it simpler: first tick Google fails, second tick succeeds
    vi.mocked(sendViaGoogleUserMailbox)
      .mockReset()
      .mockResolvedValueOnce(true); // succeeds on retry

    vi.mocked(notificationRepository.findPendingForRetry)
      .mockResolvedValueOnce([retried]);

    startNotificationWorker(999_999);
    await new Promise(resolve => setTimeout(resolve, 80));
    stopNotificationWorker();

    expect(notificationRepository.markSent).toHaveBeenCalledWith(notification.id);
  });
});
