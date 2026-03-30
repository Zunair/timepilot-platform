/**
 * Availability routes
 *
 * Admin/member routes to manage a user's availability windows.
 * Public endpoint to retrieve available booking slots for a specific date.
 */

import { Router, Request, Response } from 'express';
import { tenantContextMiddleware, requireRole } from '../middleware/tenantContext.js';
import { availabilityRepository } from '../repositories/AvailabilityRepository.js';
import { timeBlockRepository } from '../repositories/TimeBlockRepository.js';
import { schedulingService } from '../services/SchedulingService.js';
import { isValidTimezone } from '../utils/timezone.js';
import { RoleType } from '../types/index.js';
import type { UUID } from '../types/index.js';

export const availabilityRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Admin — manage availability windows (requires auth + owner/admin role)
// ---------------------------------------------------------------------------

/** GET /api/organizations/:organizationId/availability */
availabilityRouter.get(
  '/',
  tenantContextMiddleware,
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const availabilities = await availabilityRepository.findByUserId(tenant.userId, tenant);
    res.json(availabilities);
  },
);

/** POST /api/organizations/:organizationId/availability */
availabilityRouter.post(
  '/',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN, RoleType.MEMBER),
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const { type, startTime, endTime, daysOfWeek, bufferMinutes, timezone } =
      req.body as Record<string, unknown>;

    if (!type || !startTime || !endTime || !timezone) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'type, startTime, endTime, timezone required' });
      return;
    }
    if (!isValidTimezone(timezone as string)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid IANA timezone' });
      return;
    }

    const availability = await availabilityRepository.create({
      organizationId: tenant.organizationId,
      userId:         tenant.userId,
      type:           type as never,
      startTime:      startTime as string,
      endTime:        endTime as string,
      daysOfWeek:     daysOfWeek as never,
      bufferMinutes:  bufferMinutes as number | undefined,
      timezone:       timezone as string,
    });
    res.status(201).json(availability);
  },
);

/** DELETE /api/organizations/:organizationId/availability/:id */
availabilityRouter.delete(
  '/:id',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN, RoleType.MEMBER),
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    await availabilityRepository.delete(req.params.id as UUID, tenant);
    res.status(204).send();
  },
);

// ---------------------------------------------------------------------------
// Public — retrieve available booking slots for a date
// ---------------------------------------------------------------------------

/**
 * GET /api/organizations/:organizationId/slots
 * Query: userId, date (YYYY-MM-DD), timezone, duration (minutes)
 *
 * Public endpoint — no authentication required — used by the booking UI.
 */
availabilityRouter.get(
  '/slots',
  async (req: Request, res: Response) => {
    const { userId, date, timezone, duration } = req.query as Record<string, string>;

    if (!userId || !date || !timezone || !duration) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'userId, date, timezone, duration required' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'date must be YYYY-MM-DD' });
      return;
    }
    if (!isValidTimezone(timezone)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid IANA timezone' });
      return;
    }
    const durationMins = parseInt(duration, 10);
    if (isNaN(durationMins) || durationMins < 15 || durationMins > 480) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'duration must be between 15 and 480 minutes' });
      return;
    }

    const organizationId = req.params.organizationId as UUID;
    const tenant = { organizationId, userId: userId as UUID, role: RoleType.VIEWER };

    const slots = await schedulingService.getAvailableSlots({
      userId: userId as UUID,
      date,
      clientTimezone: timezone,
      slotDurationMinutes: durationMins,
      tenant,
    });

    res.json({ date, timezone, slots });
  },
);

// ============================================================================
// TIME BLOCKS — manage unavailability windows
// ============================================================================

export const timeBlocksRouter = Router({ mergeParams: true });

/** GET /api/organizations/:organizationId/time-blocks */
timeBlocksRouter.get(
  '/',
  tenantContextMiddleware,
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const blocks = await timeBlockRepository.findByUserId(tenant.userId, tenant);
    res.json(blocks);
  },
);

/** POST /api/organizations/:organizationId/time-blocks */
timeBlocksRouter.post(
  '/',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN, RoleType.MEMBER),
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const { title, startTime, endTime, recurrence, daysOfWeek, timezone } =
      req.body as Record<string, unknown>;

    if (!startTime || !endTime || !timezone) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'startTime, endTime, timezone required' });
      return;
    }
    if (!isValidTimezone(timezone as string)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid IANA timezone' });
      return;
    }
    const validRecurrences = ['none', 'daily', 'weekly'];
    if (recurrence && !validRecurrences.includes(recurrence as string)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'recurrence must be none, daily, or weekly' });
      return;
    }
    if (recurrence === 'weekly' && (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'daysOfWeek required for weekly recurrence' });
      return;
    }

    const block = await timeBlockRepository.create({
      organizationId: tenant.organizationId,
      userId:         tenant.userId,
      title:          title as string | undefined,
      startTime:      startTime as string,
      endTime:        endTime as string,
      recurrence:     recurrence as never,
      daysOfWeek:     daysOfWeek as never,
      timezone:       timezone as string,
    });
    res.status(201).json(block);
  },
);

/** DELETE /api/organizations/:organizationId/time-blocks/:id */
timeBlocksRouter.delete(
  '/:id',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN, RoleType.MEMBER),
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    await timeBlockRepository.delete(req.params.id as UUID, tenant);
    res.status(204).send();
  },
);
