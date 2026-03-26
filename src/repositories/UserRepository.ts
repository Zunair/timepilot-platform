/**
 * User Repository
 * 
 * Data access for Users.
 * Users can belong to multiple organizations through OrganizationMember records.
 * 
 * Cross-tenant access prevention:
 * - Users are queried by email globally (for login)
 * - User data is not organization-scoped (global user table)
 * - Organization membership is validated via OrganizationMember
 */

import { UUID, User, TenantContext } from '../types/index.js';
import { query as db } from '../config/db.js';

export class UserRepository {
  /**
   * Create a new user (typically from OAuth login)
   */
  async create(data: {
    email: string;
    firstName: string;
    lastName: string;
    timezone?: string;
    profileImageUrl?: string;
  }): Promise<User> {
    const result = await db(
      `INSERT INTO users (email, first_name, last_name, timezone, profile_image_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING id, email, first_name, last_name, profile_image_url, timezone, created_at, updated_at`,
      [
        data.email,
        data.firstName,
        data.lastName,
        data.timezone || 'UTC',
        data.profileImageUrl,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find user by email (for login flows)
   */
  async findByEmail(email: string): Promise<User | null> {
    const result = await db(
      `SELECT id, email, first_name, last_name, profile_image_url, timezone, created_at, updated_at
       FROM users 
       WHERE email = $1`,
      [email]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find user by ID
   */
  async findById(id: UUID): Promise<User | null> {
    const result = await db(
      `SELECT id, email, first_name, last_name, profile_image_url, timezone, created_at, updated_at
       FROM users 
       WHERE id = $1`,
      [id]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Update user (non-sensitive fields)
   */
  async update(id: UUID, data: Partial<User>): Promise<User> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.firstName) {
      updates.push(`first_name = $${paramIndex++}`);
      values.push(data.firstName);
    }
    if (data.lastName) {
      updates.push(`last_name = $${paramIndex++}`);
      values.push(data.lastName);
    }
    if (data.timezone) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(data.timezone);
    }
    if (data.profileImageUrl) {
      updates.push(`profile_image_url = $${paramIndex++}`);
      values.push(data.profileImageUrl);
    }

    values.push(id);

    const result = await db(
      `UPDATE users 
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramIndex}
       RETURNING id, email, first_name, last_name, profile_image_url, timezone, created_at, updated_at`,
      values
    );

    if (result.rowCount === 0) {
      throw new Error('User not found');
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Map database row to domain object
   */
  private mapRow(row: Record<string, unknown>): User {
    return {
      id: row.id as UUID,
      email: row.email as string,
      firstName: row.first_name as string,
      lastName: row.last_name as string,
      profileImageUrl: row.profile_image_url as string | undefined,
      timezone: row.timezone as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export const userRepository = new UserRepository();
