/**
 * Email Templates Routes
 *
 * Manages org-scoped email notification templates. Organization owners and admins
 * can customize the subject, HTML body, and text body for each notification type.
 * When no custom template exists, the system uses built-in defaults.
 *
 * Endpoints:
 *   GET    /api/organizations/:organizationId/email-templates            List all templates
 *   GET    /api/organizations/:organizationId/email-templates/:type      Get one template
 *   PUT    /api/organizations/:organizationId/email-templates/:type      Upsert template
 *   DELETE /api/organizations/:organizationId/email-templates/:type      Delete (revert to default)
 *   POST   /api/organizations/:organizationId/email-templates/:type/preview  Preview with sample data
 */

import express, { Request, Response } from 'express';
import { tenantContextMiddleware, requireRole } from '../middleware/tenantContext.js';
import { RoleType } from '../types/index.js';
import type { UUID, TenantContext } from '../types/index.js';
import { emailTemplateRepository } from '../repositories/EmailTemplateRepository.js';
import {
  renderTemplate,
  getDefaultTemplate,
  TEMPLATE_VARIABLES,
} from '../utils/templateRenderer.js';

export const emailTemplatesRouter = express.Router({ mergeParams: true });

const VALID_TEMPLATE_TYPES = [
  'booking_confirmation',
  'booking_cancellation',
  'booking_reminder',
  'booking_rescheduled',
];

function isValidTemplateType(type: string): boolean {
  return VALID_TEMPLATE_TYPES.includes(type);
}

function getSampleVariables(): Record<string, string> {
  return {
    clientName: 'Jane Doe',
    clientEmail: 'jane.doe@example.com',
    appointmentDate: 'Monday, April 6, 2026',
    appointmentTime: '2:00 PM',
    appointmentTimezone: 'America/New_York',
    appointmentDuration: '60',
    confirmationRef: 'TP-A1B2C3',
    organizationName: 'Acme Scheduling',
    userName: 'John Smith',
  };
}

// ---------------------------------------------------------------------------
// GET /api/organizations/:organizationId/email-templates
// ---------------------------------------------------------------------------
emailTemplatesRouter.get(
  '/',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const tenant = (req as Request & { tenant: TenantContext }).tenant;

    const customTemplates = await emailTemplateRepository.findAllByOrg(tenant.organizationId);
    const customMap = new Map(customTemplates.map((t) => [t.type, t]));

    const templates = VALID_TEMPLATE_TYPES.map((type) => {
      const custom = customMap.get(type);
      const defaults = getDefaultTemplate(type);
      return {
        type,
        isCustomized: Boolean(custom),
        subject: custom?.subject ?? defaults.subject,
        htmlBody: custom?.htmlBody ?? defaults.htmlBody,
        textBody: custom?.textBody ?? defaults.textBody,
        isActive: custom?.isActive ?? true,
        updatedAt: custom?.updatedAt ?? null,
      };
    });

    res.json({ templates, variables: TEMPLATE_VARIABLES });
  },
);

// ---------------------------------------------------------------------------
// GET /api/organizations/:organizationId/email-templates/:type
// ---------------------------------------------------------------------------
emailTemplatesRouter.get(
  '/:type',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const type = req.params.type;
    if (!isValidTemplateType(type)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: `Invalid template type: ${type}` });
      return;
    }

    const tenant = (req as Request & { tenant: TenantContext }).tenant;
    const custom = await emailTemplateRepository.findByOrgAndType(tenant.organizationId, type);
    const defaults = getDefaultTemplate(type);

    res.json({
      type,
      isCustomized: Boolean(custom),
      subject: custom?.subject ?? defaults.subject,
      htmlBody: custom?.htmlBody ?? defaults.htmlBody,
      textBody: custom?.textBody ?? defaults.textBody,
      isActive: custom?.isActive ?? true,
      defaults: {
        subject: defaults.subject,
        htmlBody: defaults.htmlBody,
        textBody: defaults.textBody,
      },
      variables: TEMPLATE_VARIABLES,
    });
  },
);

// ---------------------------------------------------------------------------
// PUT /api/organizations/:organizationId/email-templates/:type
// ---------------------------------------------------------------------------
emailTemplatesRouter.put(
  '/:type',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const type = req.params.type;
    if (!isValidTemplateType(type)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: `Invalid template type: ${type}` });
      return;
    }

    const { subject, htmlBody, textBody } = req.body as {
      subject?: string;
      htmlBody?: string;
      textBody?: string;
    };

    if (!subject || !htmlBody) {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'subject and htmlBody are required',
      });
      return;
    }

    const tenant = (req as Request & { tenant: TenantContext }).tenant;
    const template = await emailTemplateRepository.upsertTemplate(
      tenant.organizationId,
      type,
      subject,
      htmlBody,
      textBody ?? '',
    );

    res.json({ template, message: 'Template saved' });
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/organizations/:organizationId/email-templates/:type
// ---------------------------------------------------------------------------
emailTemplatesRouter.delete(
  '/:type',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const type = req.params.type;
    if (!isValidTemplateType(type)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: `Invalid template type: ${type}` });
      return;
    }

    const tenant = (req as Request & { tenant: TenantContext }).tenant;
    await emailTemplateRepository.deleteTemplate(tenant.organizationId, type);
    res.json({ message: 'Template deleted — defaults will be used' });
  },
);

// ---------------------------------------------------------------------------
// POST /api/organizations/:organizationId/email-templates/:type/preview
// ---------------------------------------------------------------------------
emailTemplatesRouter.post(
  '/:type/preview',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const type = req.params.type;
    if (!isValidTemplateType(type)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: `Invalid template type: ${type}` });
      return;
    }

    const { subject, htmlBody } = req.body as { subject?: string; htmlBody?: string };
    const defaults = getDefaultTemplate(type);
    const templateSubject = subject ?? defaults.subject;
    const templateHtml = htmlBody ?? defaults.htmlBody;

    const sampleVars = getSampleVariables();
    const renderedSubject = renderTemplate(templateSubject, sampleVars);
    const renderedHtml = renderTemplate(templateHtml, sampleVars);

    res.json({
      subject: renderedSubject,
      html: renderedHtml,
    });
  },
);
