import {
  UUID, Notification, NotificationType, NotificationChannel, NotificationStatus,
} from '../types/index.js';
import { query as db } from '../config/db.js';

export class NotificationRepository {
  private columns = [
    'id', 'organization_id', 'appointment_id', 'type', 'channel',
    'recipient', 'status', 'idempotency_key', 'attempts',
    'next_retry_at', 'sent_at', 'failure_reason',
    'created_at', 'updated_at',
  ];

  async create(data: {
    organizationId: UUID;
    appointmentId: UUID;
    type: NotificationType;
    channel: NotificationChannel;
    recipient: string;
    idempotencyKey: UUID;
  }): Promise<Notification> {
    const result = await db(
      `INSERT INTO notifications
         (organization_id, appointment_id, type, channel, recipient,
          status, idempotency_key, attempts, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, 0,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING ${this.columns.join(', ')}`,
      [
        data.organizationId, data.appointmentId,
        data.type, data.channel, data.recipient, data.idempotencyKey,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  /** Pick up notifications that are pending or ready for retry. */
  async findPendingForRetry(limit = 50): Promise<Notification[]> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM notifications
       WHERE status IN ('pending', 'failed')
         AND (next_retry_at IS NULL OR next_retry_at <= CURRENT_TIMESTAMP)
         AND attempts < 5
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async markSent(id: UUID): Promise<void> {
    await db(
      `UPDATE notifications
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id],
    );
  }

  async markFailed(id: UUID, reason: string, nextRetryAt?: string): Promise<void> {
    await db(
      `UPDATE notifications
       SET status = 'failed',
           failure_reason = $2,
           attempts = attempts + 1,
           next_retry_at = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id, reason, nextRetryAt ?? null],
    );
  }

  async markDelivered(id: UUID): Promise<void> {
    await db(
      `UPDATE notifications
       SET status = 'delivered', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id],
    );
  }

  async markDeadLetter(id: UUID, reason: string): Promise<void> {
    await db(
      `UPDATE notifications
       SET status = 'dead_letter',
           failure_reason = $2,
           attempts = attempts + 1,
           next_retry_at = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [id, reason],
    );
  }

  async findDeadLetter(organizationId: UUID, limit = 50): Promise<Notification[]> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM notifications
       WHERE organization_id = $1
         AND status = 'dead_letter'
       ORDER BY updated_at DESC
       LIMIT $2`,
      [organizationId, limit],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>): Notification {
    const toIso = (v: unknown) =>
      v instanceof Date ? v.toISOString() : (v as string);
    const toIsoOpt = (v: unknown) => (v ? toIso(v) : undefined);
    return {
      id: row.id as UUID,
      organizationId: row.organization_id as UUID,
      appointmentId: row.appointment_id as UUID,
      type: row.type as NotificationType,
      channel: row.channel as NotificationChannel,
      recipient: row.recipient as string,
      status: row.status as NotificationStatus,
      idempotencyKey: row.idempotency_key as string,
      attempts: row.attempts as number,
      nextRetryAt: toIsoOpt(row.next_retry_at),
      sentAt: toIsoOpt(row.sent_at),
      failureReason: row.failure_reason as string | undefined,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }
}

export const notificationRepository = new NotificationRepository();
