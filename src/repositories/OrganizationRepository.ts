/**
 * Organization Repository
 * 
 * Data access for Organizations (tenants).
 * Organizations are the top-level isolation boundary in the system.
 * 
 * Multi-tenant verification:
 * - Organizations are read-only after creation (prevents cross-tenant mutations)
 * - Organization creation is gated to system-level operations
 */

import { UUID, Organization, TenantContext } from '../types/index.js';
import { query as db } from '../config/db.js';
import { BaseRepository } from './BaseRepository.js';

export class OrganizationRepository extends BaseRepository<Organization> {
  protected tableName = 'organizations';
  protected columns = [
    'id',
    'name',
    'slug',
    'description',
    'logo_url',
    'primary_color',
    'secondary_color',
    'background_color',
    'foreground_color',
    'font_family',
    'logo_uploaded_at',
    'created_at',
    'updated_at',
  ];

  /**
   * Create a new organization (system-level operation)
   */
  async create(data: {
    name: string;
    slug: string;
    description?: string;
  }): Promise<Organization> {
    const result = await db(
      `INSERT INTO organizations (name, slug, description, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING ${this.columns.join(', ')}`,
      [data.name, data.slug, data.description]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find organization by slug (public lookup)
   */
  async findBySlug(slug: string): Promise<Organization | null> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM organizations WHERE slug = $1`,
      [slug]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find organization by ID scoped to the tenant.
   * Overrides base: organizations have no organization_id column — the id IS the tenant root.
   */
  async findById(id: UUID, tenant: TenantContext): Promise<Organization | null> {
    if (id !== tenant.organizationId) return null;
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM organizations WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find organization by ID without tenant context.
   * Safe for auth/session org-resolution flows where membership is validated separately.
   */
  async findByIdRaw(id: UUID): Promise<Organization | null> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM organizations WHERE id = $1`,
      [id],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Overrides base: organizations table has no organization_id column.
   * Ownership is verified by confirming the requested id equals the tenant's own org id.
   */
  protected async verifyTenantOwnership(id: UUID, tenant: TenantContext): Promise<void> {
    if (id !== tenant.organizationId) {
      throw new Error('Record not found or does not belong to tenant');
    }
  }

  /**
   * Update organization (admin-level operation)
   */
  async update(
    id: UUID,
    data: Partial<Organization>,
    tenant: TenantContext
  ): Promise<Organization> {
    await this.verifyTenantOwnership(id, tenant);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description || null);
    }
    if (data.logoUrl !== undefined) {
      updates.push(`logo_url = $${paramIndex++}`);
      values.push(data.logoUrl || null);
    }
    if (data.primaryColor) {
      updates.push(`primary_color = $${paramIndex++}`);
      values.push(data.primaryColor);
    }
    if (data.secondaryColor) {
      updates.push(`secondary_color = $${paramIndex++}`);
      values.push(data.secondaryColor);
    }
    if (data.backgroundColor !== undefined) {
      updates.push(`background_color = $${paramIndex++}`);
      values.push(data.backgroundColor || null);
    }
    if (data.foregroundColor !== undefined) {
      updates.push(`foreground_color = $${paramIndex++}`);
      values.push(data.foregroundColor || null);
    }
    if (data.fontFamily) {
      updates.push(`font_family = $${paramIndex++}`);
      values.push(data.fontFamily);
    }

    values.push(id);
    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await db(
      `UPDATE organizations 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING ${this.columns.join(', ')}`,
      values
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Map database row to domain object
   */
  private mapRow(row: Record<string, unknown>): Organization {
    return {
      id: row.id as UUID,
      name: row.name as string,
      slug: row.slug as string,
      description: row.description as string | undefined,
      logoUrl: row.logo_url as string | undefined,
      primaryColor: row.primary_color as string | undefined,
      secondaryColor: row.secondary_color as string | undefined,
      backgroundColor: row.background_color as string | undefined,
      foregroundColor: row.foreground_color as string | undefined,
      fontFamily: row.font_family as string | undefined,
      logoUploadedAt: row.logo_uploaded_at as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export const organizationRepository = new OrganizationRepository();
