/**
 * Public Booking Link Resolve Routes
 *
 * No authentication required. These endpoints are called by the booking SPA
 * to resolve an opaque token into org + user context, and to generate QR codes.
 *
 * Endpoints:
 *   GET /api/b/:token      Resolve token → { organizationSlug, userId }
 *   GET /api/b/:token/qr   Return an inline SVG QR code for the booking URL
 */

import express, { Request, Response } from 'express';
import QRCode from 'qrcode';
import { query as db } from '../config/db.js';
import { env } from '../config/env.js';

export const publicBookingRouter = express.Router();

// ---------------------------------------------------------------------------
// GET /api/b/:token
// ---------------------------------------------------------------------------
publicBookingRouter.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;

  // Validate token format: 12-char URL-safe base64 (alphanumeric + - _)
  if (!/^[\w-]{8,32}$/.test(token)) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Booking link not found' });
    return;
  }

  const result = await db(
    `SELECT bl.user_id, o.slug AS org_slug
     FROM booking_links bl
     JOIN organizations o ON o.id = bl.organization_id
     WHERE bl.token = $1 AND bl.is_active = TRUE`,
    [token],
  );

  if (!result.rowCount) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Booking link not found or inactive' });
    return;
  }

  const row = result.rows[0];
  res.json({
    organizationSlug: row.org_slug,
    userId:           row.user_id,
  });
});

// ---------------------------------------------------------------------------
// GET /api/b/:token/qr
// ---------------------------------------------------------------------------
publicBookingRouter.get('/:token/qr', async (req: Request, res: Response) => {
  const { token } = req.params;

  if (!/^[\w-]{8,32}$/.test(token)) {
    res.status(404).send('Not found');
    return;
  }

  // Verify the token exists and is active before generating QR
  const result = await db(
    'SELECT id FROM booking_links WHERE token = $1 AND is_active = TRUE',
    [token],
  );

  if (!result.rowCount) {
    res.status(404).send('Not found');
    return;
  }

  const bookingUrl = `${env.CLIENT_BASE_URL}/?bk=${token}`;
  const svg = await QRCode.toString(bookingUrl, { type: 'svg', margin: 1 });

  // Admin UI runs on a different origin (port 3001), so allow embedding this image.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(svg);
});
