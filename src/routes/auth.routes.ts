/**
 * Authentication routes
 *
 * Handles session lifecycle: create (via dev-only bypass or post-OAuth callback),
 * inspect, and revoke.
 *
 * OAuth provider integration (Google, Apple, Microsoft) is scaffolded here.
 * Each callback stub is marked with INTEGRATE comments where the provider
 * SDK token exchange and user-info fetch need to be wired in once credentials
 * are available.
 */

import { Router, Request, Response } from 'express';
import { sessionService } from '../services/SessionService.js';
import { userRepository } from '../repositories/UserRepository.js';
import { organizationMemberRepository } from '../repositories/OrganizationMemberRepository.js';
import { organizationRepository } from '../repositories/OrganizationRepository.js';
import { env } from '../config/env.js';
import type { UUID } from '../types/index.js';

export const authRouter = Router();

// ---------------------------------------------------------------------------
// Session inspection
// ---------------------------------------------------------------------------

/** GET /api/auth/session — return current user/org if session is valid */
authRouter.get('/session', async (req: Request, res: Response) => {
  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'No session cookie' });
    return;
  }
  const payload = await sessionService.validate(sessionId).catch(() => null);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  const user = await userRepository.findById(payload.userId).catch(() => null);
  res.json({ userId: payload.userId, organizationId: payload.organizationId, role: payload.role, user });
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

/** POST /api/auth/logout — revoke the current session */
authRouter.post('/logout', async (req: Request, res: Response) => {
  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (sessionId) {
    await sessionService.revoke(sessionId as UUID).catch(() => null);
  }
  res.setHeader('Set-Cookie', 'session_id=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/');
  res.json({ message: 'Logged out' });
});

// ---------------------------------------------------------------------------
// OAuth callback stubs
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/google/callback
 * INTEGRATE: exchange `code` for tokens via Google OAuth2 client, then call
 * handleOAuthLogin() below with the resolved user profile.
 */
authRouter.get('/google/callback', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Google OAuth not yet configured' });
});

/**
 * GET /api/auth/apple/callback
 * INTEGRATE: Apple Sign-In uses POST with an id_token. Verify with Apple's
 * public keys, decode claims, call handleOAuthLogin().
 */
authRouter.post('/apple/callback', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Apple Sign-In not yet configured' });
});

/**
 * GET /api/auth/microsoft/callback
 * INTEGRATE: exchange code for tokens via MSAL, call handleOAuthLogin().
 */
authRouter.get('/microsoft/callback', (_req, res) => {
  res.status(501).json({ error: 'NOT_IMPLEMENTED', message: 'Microsoft OAuth not yet configured' });
});

// ---------------------------------------------------------------------------
// Internal helper shared by all provider callbacks once implemented
// ---------------------------------------------------------------------------

export async function handleOAuthLogin(
  res: Response,
  profile: {
    email: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
    organizationSlug: string; // The org the user is logging into
  },
): Promise<void> {
  // Upsert user by email
  let user = await userRepository.findByEmail(profile.email);
  if (!user) {
    user = await userRepository.create({
      email:           profile.email,
      firstName:       profile.firstName,
      lastName:        profile.lastName,
      profileImageUrl: profile.profileImageUrl,
    });
  }

  // Resolve organization
  const org = await organizationRepository.findBySlug(profile.organizationSlug);
  if (!org) {
    res.status(404).json({ error: 'ORG_NOT_FOUND', message: 'Organization not found' });
    return;
  }

  // Verify membership
  const membership = await organizationMemberRepository.findByUserAndOrganization(
    user.id, org.id,
  );
  if (!membership) {
    res.status(403).json({ error: 'NOT_A_MEMBER', message: 'User is not a member of this organization' });
    return;
  }

  const { cookie } = await sessionService.create(user.id, org.id);
  res.setHeader('Set-Cookie', cookie);
  res.json({ userId: user.id, organizationId: org.id, role: membership.role });
}

// ---------------------------------------------------------------------------
// Development-only test login (disabled in production)
// ---------------------------------------------------------------------------

if (env.NODE_ENV !== 'production') {
  /**
   * POST /api/auth/dev-login
   * Body: { email, organizationSlug }
   *
   * Creates a session for an existing user+org pair without OAuth.
   * ONLY available outside production — never expose in production builds.
   */
  authRouter.post('/dev-login', async (req: Request, res: Response) => {
    const { email, organizationSlug } = req.body as { email?: string; organizationSlug?: string };
    if (!email || !organizationSlug) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'email and organizationSlug required' });
      return;
    }

    const user = await userRepository.findByEmail(email).catch(() => null);
    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'No user with that email' });
      return;
    }

    const org = await organizationRepository.findBySlug(organizationSlug).catch(() => null);
    if (!org) {
      res.status(404).json({ error: 'ORG_NOT_FOUND', message: 'Organization not found' });
      return;
    }

    const membership = await organizationMemberRepository.findByUserAndOrganization(
      user.id, org.id,
    ).catch(() => null);
    if (!membership) {
      res.status(403).json({ error: 'NOT_A_MEMBER', message: 'User is not a member of this organization' });
      return;
    }

    const { cookie } = await sessionService.create(user.id, org.id);
    res.setHeader('Set-Cookie', cookie);
    res.json({ userId: user.id, organizationId: org.id, role: membership.role });
  });
}
