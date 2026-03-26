import { UUID, Availability, AvailabilityType, DayOfWeek, TenantContext } from '../types/index.js';
import { query as db } from '../config/db.js';
import { BaseRepository } from './BaseRepository.js';

export class AvailabilityRepository extends BaseRepository<Availability> {
  protected tableName = 'availabilities';
  protected columns = [
    'id', 'organization_id', 'user_id', 'type',
    'start_time', 'end_time', 'days_of_week', 'buffer_minutes',
    'timezone', 'created_at', 'updated_at',
  ];

  async create(data: {
    organizationId: UUID;
    userId: UUID;
    type: AvailabilityType;
    startTime: string;
    endTime: string;
    daysOfWeek?: DayOfWeek[];
    bufferMinutes?: number;
    timezone: string;
  }): Promise<Availability> {
    const result = await db(
      `INSERT INTO availabilities
         (organization_id, user_id, type, start_time, end_time,
          days_of_week, buffer_minutes, timezone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING ${this.columns.join(', ')}`,
      [
        data.organizationId, data.userId, data.type,
        data.startTime, data.endTime,
        data.daysOfWeek ?? [1, 2, 3, 4, 5],
        data.bufferMinutes ?? 0,
        data.timezone,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: UUID, tenant: TenantContext): Promise<Availability[]> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM availabilities
       WHERE user_id = $1 AND organization_id = $2
       ORDER BY start_time ASC`,
      [userId, tenant.organizationId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  /** Find availability windows that overlap a UTC time range — used for slot calculation. */
  async findActiveInRange(
    userId: UUID,
    rangeStart: string,
    rangeEnd: string,
    tenant: TenantContext,
  ): Promise<Availability[]> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM availabilities
       WHERE user_id = $1 AND organization_id = $2
         AND start_time <= $4 AND end_time >= $3
       ORDER BY start_time ASC`,
      [userId, tenant.organizationId, rangeStart, rangeEnd],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  async update(
    id: UUID,
    data: Partial<Pick<Availability, 'type' | 'startTime' | 'endTime' | 'daysOfWeek' | 'bufferMinutes' | 'timezone'>>,
    tenant: TenantContext,
  ): Promise<Availability> {
    await this.verifyTenantOwnership(id, tenant);

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.type !== undefined)          { updates.push(`type = $${idx++}`);           values.push(data.type); }
    if (data.startTime !== undefined)      { updates.push(`start_time = $${idx++}`);     values.push(data.startTime); }
    if (data.endTime !== undefined)        { updates.push(`end_time = $${idx++}`);       values.push(data.endTime); }
    if (data.daysOfWeek !== undefined)     { updates.push(`days_of_week = $${idx++}`);   values.push(data.daysOfWeek); }
    if (data.bufferMinutes !== undefined)  { updates.push(`buffer_minutes = $${idx++}`); values.push(data.bufferMinutes); }
    if (data.timezone !== undefined)       { updates.push(`timezone = $${idx++}`);       values.push(data.timezone); }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id, tenant.organizationId);

    const result = await db(
      `UPDATE availabilities
       SET ${updates.join(', ')}
       WHERE id = $${idx} AND organization_id = $${idx + 1}
       RETURNING ${this.columns.join(', ')}`,
      values,
    );
    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: Record<string, unknown>): Availability {
    const toIso = (v: unknown) =>
      v instanceof Date ? v.toISOString() : (v as string);
    return {
      id: row.id as UUID,
      organizationId: row.organization_id as UUID,
      userId: row.user_id as UUID,
      type: row.type as AvailabilityType,
      startTime: toIso(row.start_time),
      endTime: toIso(row.end_time),
      daysOfWeek: row.days_of_week as DayOfWeek[],
      bufferMinutes: row.buffer_minutes as number,
      timezone: row.timezone as string,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }
}

export const availabilityRepository = new AvailabilityRepository();
