import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    findPendingForRetry: vi.fn(),
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
  sendViaGoogleUserMailbox: vi.fn().mockResolvedValue(false),
}));

vi.mock('../services/MicrosoftMailboxService.js', () => ({
  sendViaMicrosoftUserMailbox: vi.fn().mockResolvedValue(false),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP unreachable')),
    }),
  },
}));

import { query as dbQuery } from '../config/db.js';
import { notificationRepository } from '../repositories/NotificationRepository.js';
import { startNotificationWorker, stopNotificationWorker } from '../workers/NotificationWorker.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1' as UUID,
    organizationId: 'org-1' as UUID,
    appointmentId: 'appt-1' as UUID,
    type: NotificationType.BOOKING_CONFIRMATION,
    channel: NotificationChannel.EMAIL,
    recipient: 'client@example.com',
    status: NotificationStatus.FAILED,
    idempotencyKey: 'key-1',
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

describe('NotificationWorker dead-letter queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dbQuery).mockResolvedValue({ rows: [APPOINTMENT_ROW], rowCount: 1 } as any);
  });

  it('moves notification to dead-letter when attempts reach max (5)', async () => {
    const notification = makeNotification({ attempts: 4, status: NotificationStatus.FAILED });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);

    startNotificationWorker(999_999);
    // Allow the immediate tick to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    stopNotificationWorker();

    expect(notificationRepository.markDeadLetter).toHaveBeenCalledWith(
      notification.id,
      expect.stringContaining('SMTP'),
    );
    expect(notificationRepository.markFailed).not.toHaveBeenCalled();
  });

  it('retries normally when attempts are below max', async () => {
    const notification = makeNotification({ attempts: 2, status: NotificationStatus.FAILED });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);

    startNotificationWorker(999_999);
    await new Promise(resolve => setTimeout(resolve, 50));
    stopNotificationWorker();

    expect(notificationRepository.markFailed).toHaveBeenCalledWith(
      notification.id,
      expect.any(String),
      expect.any(String),
    );
    expect(notificationRepository.markDeadLetter).not.toHaveBeenCalled();
  });

  it('dead-letters on the boundary attempt (attempt index 4 → 5th try)', async () => {
    const notification = makeNotification({ attempts: 4 });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);

    startNotificationWorker(999_999);
    await new Promise(resolve => setTimeout(resolve, 50));
    stopNotificationWorker();

    expect(notificationRepository.markDeadLetter).toHaveBeenCalledTimes(1);
  });

  it('does not dead-letter on attempt index 3 (4th try)', async () => {
    const notification = makeNotification({ attempts: 3 });
    vi.mocked(notificationRepository.findPendingForRetry).mockResolvedValueOnce([notification]);

    startNotificationWorker(999_999);
    await new Promise(resolve => setTimeout(resolve, 50));
    stopNotificationWorker();

    expect(notificationRepository.markDeadLetter).not.toHaveBeenCalled();
    expect(notificationRepository.markFailed).toHaveBeenCalledTimes(1);
  });
});

describe('NotificationStatus enum', () => {
  it('includes DEAD_LETTER status', () => {
    expect(NotificationStatus.DEAD_LETTER).toBe('dead_letter');
  });

  it('has exactly 6 statuses', () => {
    const values = Object.values(NotificationStatus);
    expect(values).toHaveLength(6);
    expect(values).toContain('dead_letter');
  });
});
