import { UUID, TimeBlock, TimeBlockRecurrence, DayOfWeek, TenantContext } from '../types/index.js';
import { query as db } from '../config/db.js';
import { BaseRepository } from './BaseRepository.js';

export class TimeBlockRepository extends BaseRepository<TimeBlock> {
  protected tableName = 'time_blocks';
  protected columns = [
    'id', 'organization_id', 'user_id', 'title',
    'start_time', 'end_time', 'recurrence', 'days_of_week',
    'timezone', 'created_at', 'updated_at',
  ];

  async create(data: {
    organizationId: UUID;
    userId: UUID;
    title?: string;
    startTime: string;
    endTime: string;
    recurrence?: TimeBlockRecurrence;
    daysOfWeek?: DayOfWeek[];
    timezone: string;
  }): Promise<TimeBlock> {
    const result = await db(
      `INSERT INTO time_blocks
         (organization_id, user_id, title, start_time, end_time,
          recurrence, days_of_week, timezone, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING ${this.columns.join(', ')}`,
      [
        data.organizationId, data.userId, data.title ?? null,
        data.startTime, data.endTime,
        data.recurrence ?? TimeBlockRecurrence.NONE,
        data.daysOfWeek ?? null,
        data.timezone,
      ],
    );
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: UUID, tenant: TenantContext): Promise<TimeBlock[]> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM time_blocks
       WHERE user_id = $1 AND organization_id = $2
       ORDER BY start_time ASC`,
      [userId, tenant.organizationId],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  /** Find time blocks that overlap a UTC time range — used for slot exclusion. */
  async findActiveInRange(
    userId: UUID,
    rangeStart: string,
    rangeEnd: string,
    tenant: TenantContext,
  ): Promise<TimeBlock[]> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM time_blocks
       WHERE user_id = $1 AND organization_id = $2
         AND start_time <= $4 AND end_time >= $3
       ORDER BY start_time ASC`,
      [userId, tenant.organizationId, rangeStart, rangeEnd],
    );
    return result.rows.map(row => this.mapRow(row));
  }

  private mapRow(row: Record<string, unknown>): TimeBlock {
    const toIso = (v: unknown) =>
      v instanceof Date ? v.toISOString() : (v as string);
    return {
      id: row.id as UUID,
      organizationId: row.organization_id as UUID,
      userId: row.user_id as UUID,
      title: row.title as string | undefined,
      startTime: toIso(row.start_time),
      endTime: toIso(row.end_time),
      recurrence: row.recurrence as TimeBlockRecurrence,
      daysOfWeek: row.days_of_week as DayOfWeek[] | undefined,
      timezone: row.timezone as string,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  }
}

export const timeBlockRepository = new TimeBlockRepository();
