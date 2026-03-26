/**
 * Organization routes
 *
 * Tenant management: look up orgs, manage members, update settings.
 */

import { Router, Request, Response } from 'express';
import { tenantContextMiddleware, requireRole } from '../middleware/tenantContext.js';
import { organizationRepository } from '../repositories/OrganizationRepository.js';
import { organizationMemberRepository } from '../repositories/OrganizationMemberRepository.js';
import { userRepository } from '../repositories/UserRepository.js';
import { sessionService } from '../services/SessionService.js';
import { RoleType } from '../types/index.js';
import type { UUID } from '../types/index.js';

export const organizationsRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// Public — look up org by slug (used by booking page to resolve tenant)
// ---------------------------------------------------------------------------

/** GET /api/organizations/slug/:slug */
organizationsRouter.get('/slug/:slug', async (req: Request, res: Response) => {
  const org = await organizationRepository.findBySlug(req.params.slug);
  if (!org) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found' });
    return;
  }
  // Return only public-safe fields.
  res.json({
    id:             org.id,
    name:           org.name,
    slug:           org.slug,
    description:    org.description,
    logoUrl:        org.logoUrl,
    primaryColor:   org.primaryColor,
    secondaryColor: org.secondaryColor,
    fontFamily:     org.fontFamily,
  });
});

// ---------------------------------------------------------------------------
// Authenticated — organization detail and settings
// ---------------------------------------------------------------------------

/** GET /api/organizations/:organizationId */
organizationsRouter.get(
  '/:organizationId',
  tenantContextMiddleware,
  async (req: Request, res: Response) => {
    const org = await organizationRepository.findById(
      req.params.organizationId as UUID,
      req.tenant!,
    );
    if (!org) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Organization not found' });
      return;
    }
    res.json(org);
  },
);

/** PUT /api/organizations/:organizationId — update branding/settings */
organizationsRouter.put(
  '/:organizationId',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const org = await organizationRepository.update(
      req.params.organizationId as UUID,
      req.body as never,
      req.tenant!,
    );
    res.json(org);
  },
);

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/** GET /api/organizations/:organizationId/members */
organizationsRouter.get(
  '/:organizationId/members',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const members = await organizationMemberRepository.findByOrganization(
      req.params.organizationId as UUID,
      req.tenant!,
    );
    res.json(members);
  },
);

/** POST /api/organizations/:organizationId/members — invite a user by email */
organizationsRouter.post(
  '/:organizationId/members',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    const { email, role } = req.body as { email?: string; role?: string };
    if (!email || !role) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'email and role required' });
      return;
    }
    if (!Object.values(RoleType).includes(role as RoleType)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid role' });
      return;
    }

    const user = await userRepository.findByEmail(email);
    if (!user) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'No user with that email' });
      return;
    }

    const member = await organizationMemberRepository.create({
      organizationId: req.params.organizationId as UUID,
      userId: user.id,
      role: role as RoleType,
    });
    res.status(201).json(member);
  },
);

/** PUT /api/organizations/:organizationId/members/:memberId/role */
organizationsRouter.put(
  '/:organizationId/members/:memberId/role',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER),
  async (req: Request, res: Response) => {
    const { role } = req.body as { role?: string };
    if (!role || !Object.values(RoleType).includes(role as RoleType)) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid role required' });
      return;
    }

    const member = await organizationMemberRepository.updateRole(
      req.params.memberId as UUID,
      role as RoleType,
      req.tenant!,
    );
    res.json(member);
  },
);

/** DELETE /api/organizations/:organizationId/members/:memberId */
organizationsRouter.delete(
  '/:organizationId/members/:memberId',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  async (req: Request, res: Response) => {
    await organizationMemberRepository.removeMember(req.params.memberId as UUID, req.tenant!);
    // Also revoke all sessions for the removed user.
    const member = await organizationMemberRepository
      .findByOrganization(req.params.organizationId as UUID, req.tenant!)
      .then(members => members.find(m => m.id === req.params.memberId))
      .catch(() => null);
    if (member) {
      await sessionService.revokeAll(member.userId).catch(() => null);
    }
    res.status(204).send();
  },
);
