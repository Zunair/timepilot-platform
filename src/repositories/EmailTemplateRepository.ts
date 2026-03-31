/**
 * Email Template Repository
 *
 * Manages org-scoped email notification templates.
 * Each organization can have one custom template per notification type.
 * When no custom template exists, the system falls back to hardcoded defaults.
 */

import { query as db } from '../config/db.js';
import type { UUID } from '../types/index.js';

export interface EmailTemplateRecord {
  id: UUID;
  organizationId: UUID;
  type: string;
  subject: string;
  htmlBody: string;
  textBody: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const COLUMNS = [
  'id', 'organization_id', 'type', 'subject', 'html_body', 'text_body',
  'is_active', 'created_at', 'updated_at',
];

function mapRow(row: Record<string, unknown>): EmailTemplateRecord {
  const toIso = (v: unknown) => v instanceof Date ? v.toISOString() : (v as string);
  return {
    id: row.id as UUID,
    organizationId: row.organization_id as UUID,
    type: row.type as string,
    subject: row.subject as string,
    htmlBody: row.html_body as string,
    textBody: row.text_body as string,
    isActive: row.is_active as boolean,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export class EmailTemplateRepository {
  async findByOrgAndType(organizationId: UUID, type: string): Promise<EmailTemplateRecord | null> {
    const result = await db(
      `SELECT ${COLUMNS.join(', ')} FROM email_templates
       WHERE organization_id = $1 AND type = $2`,
      [organizationId, type],
    );
    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async findAllByOrg(organizationId: UUID): Promise<EmailTemplateRecord[]> {
    const result = await db(
      `SELECT ${COLUMNS.join(', ')} FROM email_templates
       WHERE organization_id = $1
       ORDER BY type ASC`,
      [organizationId],
    );
    return result.rows.map(mapRow);
  }

  async upsertTemplate(
    organizationId: UUID,
    type: string,
    subject: string,
    htmlBody: string,
    textBody: string,
  ): Promise<EmailTemplateRecord> {
    const result = await db(
      `INSERT INTO email_templates (organization_id, type, subject, html_body, text_body, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (organization_id, type)
       DO UPDATE SET
         subject = EXCLUDED.subject,
         html_body = EXCLUDED.html_body,
         text_body = EXCLUDED.text_body,
         is_active = true,
         updated_at = CURRENT_TIMESTAMP
       RETURNING ${COLUMNS.join(', ')}`,
      [organizationId, type, subject, htmlBody, textBody],
    );
    return mapRow(result.rows[0]);
  }

  async deleteTemplate(organizationId: UUID, type: string): Promise<boolean> {
    const result = await db(
      `DELETE FROM email_templates WHERE organization_id = $1 AND type = $2`,
      [organizationId, type],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

export const emailTemplateRepository = new EmailTemplateRepository();
