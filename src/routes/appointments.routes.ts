/**
 * Appointment routes
 *
 * Public booking endpoint (no auth): clients book a slot.
 * Authenticated endpoints: admin lists, cancels, and looks up appointments.
 */

import { Router, Request, Response } from 'express';
import { tenantContextMiddleware, requireRole } from '../middleware/tenantContext.js';
import { appointmentService } from '../services/AppointmentService.js';
import { appointmentRepository } from '../repositories/AppointmentRepository.js';
import { isValidTimezone } from '../utils/timezone.js';
import { RoleType } from '../types/index.js';
import type { UUID } from '../types/index.js';

export const appointmentsRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Public — book an appointment (no auth required)
// ---------------------------------------------------------------------------

/**
 * POST /api/organizations/:organizationId/appointments
 *
 * Body: { userId, clientName, clientEmail, clientPhone?, startTime, endTime, timezone, notes? }
 */
appointmentsRouter.post(
  '/',
  async (req: Request, res: Response) => {
    const { userId, clientName, clientEmail, clientPhone, startTime, endTime, timezone, notes } =
      req.body as Record<string, unknown>;

    if (!userId || !clientName || !clientEmail || !startTime || !endTime || !timezone) {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'userId, clientName, clientEmail, startTime, endTime, timezone required',
      });
      return;
    }
    if (!isValidTimezone(timezone as string)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid IANA timezone' });
      return;
    }

    const organizationId = req.params.organizationId as UUID;

    // Build a minimal tenant context for the booking (org-scoped, no role needed for public booking).
    const tenant = { organizationId, userId: userId as UUID, role: RoleType.VIEWER };

    const appointment = await appointmentService.create({
      organizationId,
      userId:      userId as UUID,
      clientName:  clientName as string,
      clientEmail: clientEmail as string,
      clientPhone: clientPhone as string | undefined,
      startTime:   startTime as string,
      endTime:     endTime as string,
      timezone:    timezone as string,
      notes:       notes as string | undefined,
      tenant,
    });

    res.status(201).json(appointment);
  },
);

// ---------------------------------------------------------------------------
// Public — look up an appointment by confirmation reference
// ---------------------------------------------------------------------------

/** GET /api/appointments/confirm/:ref */
export const confirmationRouter = Router();
confirmationRouter.get('/:ref', async (req: Request, res: Response) => {
  const appointment = await appointmentRepository.findByConfirmationRef(req.params.ref);
  if (!appointment) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'No appointment with that reference' });
    return;
  }
  // Return only client-safe fields (omit internal IDs).
  res.json({
    confirmationRef: appointment.confirmationRef,
    status:          appointment.status,
    clientName:      appointment.clientName,
    startTime:       appointment.startTime,
    endTime:         appointment.endTime,
    timezone:        appointment.timezone,
  });
});

// ---------------------------------------------------------------------------
// Admin — list, view, cancel (requires authentication)
// ---------------------------------------------------------------------------

/** GET /api/organizations/:organizationId/appointments */
appointmentsRouter.get(
  '/',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN, RoleType.MEMBER),
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const { status, limit, offset } = req.query as Record<string, string>;

    const appointments = await appointmentService.listForUser(
      tenant.userId,
      tenant,
      {
        status: status as string | undefined,
        limit:  limit  ? parseInt(limit, 10)  : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      },
    );
    res.json(appointments);
  },
);

/** GET /api/organizations/:organizationId/appointments/:id */
appointmentsRouter.get(
  '/:id',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN, RoleType.MEMBER),
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const appointment = await appointmentRepository.findById(req.params.id as UUID, tenant);
    if (!appointment) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Appointment not found' });
      return;
    }
    res.json(appointment);
  },
);

/** POST /api/organizations/:organizationId/appointments/:id/cancel */
appointmentsRouter.post(
  '/:id/cancel',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const appointment = await appointmentService.cancel(req.params.id as UUID, tenant);
    res.json(appointment);
  },
);

/** PATCH /api/organizations/:organizationId/appointments/:id */
appointmentsRouter.patch(
  '/:id',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN, RoleType.MEMBER),
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const { clientName, clientEmail, clientPhone, notes, timezone } = req.body as Record<string, unknown>;

    if (
      typeof clientName !== 'string' &&
      typeof clientEmail !== 'string' &&
      typeof clientPhone !== 'string' &&
      typeof notes !== 'string' &&
      typeof timezone !== 'string'
    ) {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'At least one updatable field is required',
      });
      return;
    }

    if (typeof timezone === 'string' && !isValidTimezone(timezone)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid IANA timezone' });
      return;
    }

    const appointment = await appointmentService.updateDetails({
      appointmentId: req.params.id as UUID,
      clientName: typeof clientName === 'string' ? clientName : undefined,
      clientEmail: typeof clientEmail === 'string' ? clientEmail : undefined,
      clientPhone: typeof clientPhone === 'string' ? clientPhone : undefined,
      notes: typeof notes === 'string' ? notes : undefined,
      timezone: typeof timezone === 'string' ? timezone : undefined,
      tenant,
    });

    res.json(appointment);
  },
);

/** POST /api/organizations/:organizationId/appointments/:id/reschedule */
appointmentsRouter.post(
  '/:id/reschedule',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN, RoleType.MEMBER),
  async (req: Request, res: Response) => {
    const tenant = req.tenant!;
    const { startTime, endTime, timezone } = req.body as Record<string, unknown>;

    if (typeof startTime !== 'string' || typeof endTime !== 'string') {
      res.status(400).json({
        error: 'BAD_REQUEST',
        message: 'startTime and endTime are required',
      });
      return;
    }
    if (typeof timezone === 'string' && !isValidTimezone(timezone)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid IANA timezone' });
      return;
    }

    const appointment = await appointmentService.reschedule({
      appointmentId: req.params.id as UUID,
      startTime,
      endTime,
      timezone: typeof timezone === 'string' ? timezone : undefined,
      tenant,
    });

    res.json(appointment);
  },
);
