/**
 * Organization Member Repository
 * 
 * Data access for OrganizationMember (RBAC junction table).
 * Manages user roles within organizations.
 * 
 * Multi-tenant verification:
 * - All queries scoped to organization_id
 * - Role updates validated against least-privilege rules
 * - Cross-organization access blocked at repository level
 */

import { UUID, OrganizationMember, RoleType, TenantContext } from '../types/index.js';
import { query as db } from '../config/db.js';
import { BaseRepository } from './BaseRepository.js';

export interface UserOrganizationMembership {
  organizationId: UUID;
  organizationSlug: string;
  organizationName: string;
  role: RoleType;
}

export class OrganizationMemberRepository extends BaseRepository<OrganizationMember> {
  protected tableName = 'organization_members';
  protected columns = [
    'id',
    'organization_id',
    'user_id',
    'role',
    'created_at',
    'updated_at',
  ];

  /**
   * Add a user to an organization with a role
   */
  async create(data: {
    organizationId: UUID;
    userId: UUID;
    role: RoleType;
  }): Promise<OrganizationMember> {
    const result = await db(
      `INSERT INTO organization_members (organization_id, user_id, role, created_at, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       RETURNING ${this.columns.join(', ')}`,
      [data.organizationId, data.userId, data.role]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find all members of an organization
   */
  async findByOrganization(organizationId: UUID, tenant: TenantContext): Promise<OrganizationMember[]> {
    // Verify tenant isolation
    if (organizationId !== tenant.organizationId) {
      throw new Error('Cross-organization access denied');
    }

    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM organization_members 
       WHERE organization_id = $1`,
      [organizationId]
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find a user's role in an organization
   */
  async findByUserAndOrganization(
    userId: UUID,
    organizationId: UUID
  ): Promise<OrganizationMember | null> {
    const result = await db(
      `SELECT ${this.columns.join(', ')} FROM organization_members 
       WHERE user_id = $1 AND organization_id = $2`,
      [userId, organizationId]
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * List all organizations a user belongs to.
   * Used after identity-first login to resolve org routing/selection.
   */
  async findOrganizationsForUser(userId: UUID): Promise<UserOrganizationMembership[]> {
    const result = await db(
      `SELECT
         om.organization_id,
         om.role,
         o.slug AS organization_slug,
         o.name AS organization_name
       FROM organization_members om
       INNER JOIN organizations o ON o.id = om.organization_id
       WHERE om.user_id = $1
       ORDER BY o.name ASC`,
      [userId],
    );

    return result.rows.map((row) => ({
      organizationId: row.organization_id as UUID,
      organizationSlug: row.organization_slug as string,
      organizationName: row.organization_name as string,
      role: row.role as RoleType,
    }));
  }

  /**
   * Update member role (admin-level operation)
   */
  async updateRole(
    id: UUID,
    newRole: RoleType,
    tenant: TenantContext
  ): Promise<OrganizationMember> {
    await this.verifyTenantOwnership(id, tenant);

    const result = await db(
      `UPDATE organization_members 
       SET role = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND organization_id = $3
       RETURNING ${this.columns.join(', ')}`,
      [newRole, id, tenant.organizationId]
    );

    if (result.rowCount === 0) {
      throw new Error('Member not found or does not belong to organization');
    }

    return this.mapRow(result.rows[0]);
  }

  /**
   * Remove a member from an organization
   */
  async removeMember(id: UUID, tenant: TenantContext): Promise<void> {
    await this.verifyTenantOwnership(id, tenant);
    await db(
      `DELETE FROM organization_members WHERE id = $1 AND organization_id = $2`,
      [id, tenant.organizationId]
    );
  }

  /**
   * Map database row to domain object
   */
  private mapRow(row: Record<string, unknown>): OrganizationMember {
    return {
      id: row.id as UUID,
      organizationId: row.organization_id as UUID,
      userId: row.user_id as UUID,
      role: row.role as RoleType,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export const organizationMemberRepository = new OrganizationMemberRepository();
