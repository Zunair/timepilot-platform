/**
 * Base Repository Class
 * 
 * Provides common data access patterns for all repositories.
 * Enforces tenant isolation at the repository level.
 * 
 * All repositories must:
 * - Validate tenant ownership on create/update/delete
 * - Filter by organization_id on all queries
 * - Never return cross-tenant data
 */

import { UUID, TenantContext } from '../types/index.js';
import pg from 'pg';
import { query as db } from '../config/db.js';

interface CountRow {
  count: string;
}

export abstract class BaseRepository<T> {
  protected abstract tableName: string;
  protected abstract columns: string[];

  /**
   * Find a single record by ID, scoped to tenant
   * Verifies tenant ownership before returning data
   */
  async findById(id: UUID, tenant: TenantContext): Promise<T | null> {
    const result = await db<T & pg.QueryResultRow>(
      `SELECT * FROM ${this.tableName} WHERE id = $1 AND organization_id = $2`,
      [id, tenant.organizationId]
    );

    return (result.rows[0] as T | undefined) || null;
  }

  /**
   * Find all records for the tenant
   */
  async findAll(tenant: TenantContext, options?: { limit?: number; offset?: number }): Promise<T[]> {
    const limit = options?.limit || 100;
    const offset = options?.offset || 0;

    const result = await db<T & pg.QueryResultRow>(
      `SELECT * FROM ${this.tableName} 
       WHERE organization_id = $1 
       LIMIT $2 OFFSET $3`,
      [tenant.organizationId, limit, offset]
    );

    return result.rows as T[];
  }

  /**
   * Count records for the tenant
   */
  async count(tenant: TenantContext): Promise<number> {
    const result = await db<CountRow>(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE organization_id = $1`,
      [tenant.organizationId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Verify that a record belongs to the tenant (authorization)
   * Throws if record doesn't exist or belongs to different tenant
   */
  protected async verifyTenantOwnership(id: UUID, tenant: TenantContext): Promise<void> {
    const result = await db(
      `SELECT id FROM ${this.tableName} WHERE id = $1 AND organization_id = $2`,
      [id, tenant.organizationId]
    );

    if (result.rowCount === 0) {
      throw new Error(`Record not found or does not belong to tenant`);
    }
  }

  /**
   * Delete a record (soft delete where applicable)
   */
  async delete(id: UUID, tenant: TenantContext): Promise<void> {
    await this.verifyTenantOwnership(id, tenant);
    await db(`DELETE FROM ${this.tableName} WHERE id = $1`, [id]);
  }
}
