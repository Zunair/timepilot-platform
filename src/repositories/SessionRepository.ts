import { UUID, Session } from '../types/index.js';
import { query as db } from '../config/db.js';

export class SessionRepository {
  private columns = ['id', 'user_id', 'organization_id', 'expires_at', 'created_at'];

  async create(data: {
    userId: UUID;
    organizationId: UUID;
    expiresAt: string;
  }): Promise<Session> {
    const result = await db(
      `INSERT INTO sessions (user_id, organization_id, expires_at, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       RETURNING ${this.columns.join(', ')}`,
      [data.userId, data.organizationId, data.expiresAt],
    );
    return this.mapRow(result.rows[0]);
  }

  /** Return the session only if it exists and has not expired. */
  async findValidById(id: UUID): Promise<Session | null> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM sessions
       WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  async deleteById(id: UUID): Promise<void> {
    await db('DELETE FROM sessions WHERE id = $1', [id]);
  }

  /** Revoke all sessions for a user (security reset, password change). */
  async deleteAllForUser(userId: UUID): Promise<void> {
    await db('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }

  /** Remove all expired sessions. Returns the count of deleted rows. */
  async cleanupExpired(): Promise<number> {
    const result = await db(
      'DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP',
    );
    return result.rowCount ?? 0;
  }

  private mapRow(row: Record<string, unknown>): Session {
    const toIso = (v: unknown) =>
      v instanceof Date ? v.toISOString() : (v as string);
    return {
      id: row.id as UUID,
      userId: row.user_id as UUID,
      organizationId: row.organization_id as UUID,
      expiresAt: toIso(row.expires_at),
      createdAt: toIso(row.created_at),
    };
  }
}

export const sessionRepository = new SessionRepository();
