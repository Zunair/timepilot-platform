/**
 * Booking Links Routes
 *
 * Manages opaque short-token booking links that map an org + user to a
 * shareable URL without exposing internal IDs. Token entropy: 72 bits (12
 * URL-safe base64 chars), collision probability negligible at scale.
 *
 * All mutating routes require an authenticated session with OWNER or ADMIN role.
 *
 * Endpoints:
 *   POST   /api/organizations/:organizationId/booking-links        Create a link
 *   GET    /api/organizations/:organizationId/booking-links        List links
 *   DELETE /api/organizations/:organizationId/booking-links/:id    Deactivate a link
 */

import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import { query as db } from '../config/db.js';
import { tenantContextMiddleware } from '../middleware/tenantContext.js';
import { requireRole } from '../middleware/tenantContext.js';
import { RoleType, UUID } from '../types/index.js';
import { env } from '../config/env.js';

export const bookingLinksRouter = express.Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateToken(): string {
  // 9 random bytes → 12-char URL-safe base64 (72 bits of entropy)
  return crypto.randomBytes(9).toString('base64url');
}

function buildBookingUrl(token: string): string {
  return `${env.CLIENT_BASE_URL}/?bk=${token}`;
}

// ---------------------------------------------------------------------------
// POST /api/organizations/:organizationId/booking-links
// ---------------------------------------------------------------------------
bookingLinksRouter.post(
  '/',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const { userId, label } = req.body as { userId?: string; label?: string };

    if (!userId) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'userId is required' });
      return;
    }

    // Verify the user belongs to this org
    const memberCheck = await db(
      'SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2',
      [req.tenant!.organizationId, userId],
    );
    if (!memberCheck.rowCount) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'User is not a member of this organization' });
      return;
    }

    const token = generateToken();
    const result = await db(
      `INSERT INTO booking_links (organization_id, user_id, token, label)
       VALUES ($1, $2, $3, $4)
       RETURNING id, token, label, user_id, is_active, created_at`,
      [req.tenant!.organizationId, userId, token, label || null],
    );

    const row = result.rows[0];
    res.status(201).json({
      id:         row.id,
      token:      row.token,
      label:      row.label,
      userId:     row.user_id,
      isActive:   row.is_active,
      bookingUrl: buildBookingUrl(row.token),
      createdAt:  row.created_at,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/organizations/:organizationId/booking-links
// ---------------------------------------------------------------------------
bookingLinksRouter.get(
  '/',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN, RoleType.MEMBER),
  async (req: Request, res: Response) => {
    const result = await db(
      `SELECT bl.id, bl.token, bl.label, bl.user_id, bl.is_active, bl.created_at,
              u.first_name, u.last_name, u.email
       FROM booking_links bl
       JOIN users u ON u.id = bl.user_id
       WHERE bl.organization_id = $1
       ORDER BY bl.created_at DESC`,
      [req.tenant!.organizationId],
    );

    res.json(result.rows.map(row => ({
      id:         row.id,
      token:      row.token,
      label:      row.label,
      userId:     row.user_id,
      userName:   `${row.first_name} ${row.last_name}`.trim(),
      userEmail:  row.email,
      isActive:   row.is_active,
      bookingUrl: buildBookingUrl(row.token),
      createdAt:  row.created_at,
    })));
  },
);

// ---------------------------------------------------------------------------
// DELETE /api/organizations/:organizationId/booking-links/:linkId
// ---------------------------------------------------------------------------
bookingLinksRouter.delete(
  '/:linkId',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const result = await db(
      `DELETE FROM booking_links WHERE id = $1 AND organization_id = $2 RETURNING id`,
      [req.params.linkId as UUID, req.tenant!.organizationId],
    );

    if (!result.rowCount) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Booking link not found' });
      return;
    }

    res.status(204).send();
  },
);
