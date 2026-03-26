import { UUID, Appointment, TenantContext } from '../types/index.js';
import { query as db } from '../config/db.js';
import { BaseRepository } from './BaseRepository.js';

export class AppointmentRepository extends BaseRepository<Appointment> {
  protected tableName = 'appointments';
  protected columns = [
    'id', 'organization_id', 'user_id',
    'client_name', 'client_email', 'client_phone',
    'status', 'start_time', 'end_time', 'timezone',
    'notes', 'confirmation_ref',
    'created_at', 'updated_at', 'cancelled_at',
  ];

  async create(data: {
    organizationId: UUID;
    userId: UUID;
    clientName: string;
    clientEmail: string;
    clientPhone?: string;
    startTime: string;
    endTime: string;
    timezone: string;
    notes?: string;
    confirmationRef: string;
  }): Promise<Appointment> {
    const result = await db(
      `INSERT INTO appointments
         (organization_id, user_id, client_name, client_email, client_phone,
          status, start_time, end_time, timezone, notes, confirmation_ref,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'scheduled', $6, $7, $8, $9, $10,
               CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING ${this.columns.join(', ')}`,
      [
        data.organizationId, data.userId,
        data.clientName, data.clientEmail, data.clientPhone ?? null,
        data.startTime, data.endTime, data.timezone,
        data.notes ?? null, data.confirmationRef,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  /** Public lookup — no tenant guard; used for confirmation page. */
  async findByConfirmationRef(ref: string): Promise<Appointment | null> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM appointments
       WHERE confirmation_ref = $1`,
      [ref],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async findByUserId(
    userId: UUID,
    tenant: TenantContext,
    options?: { status?: string; limit?: number; offset?: number },
  ): Promise<Appointment[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const values: unknown[] = [userId, tenant.organizationId];
    let sql = `SELECT ${this.columns.join(', ')} FROM appointments
               WHERE user_id = $1 AND organization_id = $2`;

    if (options?.status) {
      sql += ` AND status = $${values.length + 1}`;
      values.push(options.status);
    }

    sql += ` ORDER BY start_time ASC
             LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
    values.push(limit, offset);

    const result = await db(sql, values);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find scheduled appointments that overlap the given UTC time range.
   * Used to detect booking conflicts before creating a new appointment.
   */
  async findConflicting(
    userId: UUID,
    startTime: string,
    endTime: string,
    tenant: TenantContext,
    excludeId?: UUID,
  ): Promise<Appointment[]> {
    const values: unknown[] = [userId, tenant.organizationId, startTime, endTime];
    let sql = `SELECT ${this.columns.join(', ')} FROM appointments
               WHERE user_id = $1 AND organization_id = $2
                 AND status = 'scheduled'
                 AND start_time < $4 AND end_time > $3`;

    if (excludeId) {
      sql += ` AND id != $${values.length + 1}`;
      values.push(excludeId);
    }

    const result = await db(sql, values);
    return result.rows.map(row => this.mapRow(row));
  }

  async cancel(id: UUID, tenant: TenantContext): Promise<Appointment> {
    await this.verifyTenantOwnership(id, tenant);
    const result = await db(
      `UPDATE appointments
       SET status = 'cancelled',
           cancelled_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND organization_id = $2
       RETURNING ${this.columns.join(', ')}`,
      [id, tenant.organizationId],
    );
    if ((result.rowCount ?? 0) === 0) throw new Error('Appointment not found');
    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): Appointment {
    const toIso = (v: unknown) =>
      v instanceof Date ? v.toISOString() : (v as string);
    return {
      id: row.id as UUID,
      organizationId: row.organization_id as UUID,
      userId: row.user_id as UUID,
      clientName: row.client_name as string,
      clientEmail: row.client_email as string,
      clientPhone: row.client_phone as string | undefined,
      status: row.status as 'scheduled' | 'completed' | 'cancelled',
      startTime: toIso(row.start_time),
      endTime: toIso(row.end_time),
      timezone: row.timezone as string,
      notes: row.notes as string | undefined,
      confirmationRef: row.confirmation_ref as string,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
      cancelledAt: row.cancelled_at ? toIso(row.cancelled_at) : undefined,
    };
  }
}

export const appointmentRepository = new AppointmentRepository();
