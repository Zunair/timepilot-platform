import { UUID, RoleType } from '../types/index.js';
import type { Session } from '../types/index.js';
import { sessionRepository } from '../repositories/SessionRepository.js';
import { organizationMemberRepository } from '../repositories/OrganizationMemberRepository.js';
import { env } from '../config/env.js';

export interface SessionPayload {
  sessionId:      UUID;
  userId:         UUID;
  organizationId: UUID;
  role:           RoleType;
}

export class SessionService {
  /**
   * Create a new session for an authenticated user in a given organization.
   * Returns the session record and a ready-to-use Set-Cookie header value.
   */
  async create(
    userId: UUID,
    organizationId: UUID,
  ): Promise<{ session: Session; cookie: string }> {
    const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE).toISOString();
    const session = await sessionRepository.create({ userId, organizationId, expiresAt });

    const cookie =
      `session_id=${session.id}; HttpOnly; SameSite=Strict; ` +
      `Max-Age=${Math.floor(env.SESSION_MAX_AGE / 1000)}; Path=/` +
      (env.NODE_ENV === 'production' ? '; Secure' : '');

    return { session, cookie };
  }

  /**
   * Validate a session ID and resolve the caller's identity and role.
   * Returns null when the session does not exist, is expired, or the user
   * no longer has membership in the associated organization.
   */
  async validate(sessionId: string): Promise<SessionPayload | null> {
    const session = await sessionRepository.findValidById(sessionId as UUID);
    if (!session) return null;

    const membership = await organizationMemberRepository.findByUserAndOrganization(
      session.userId,
      session.organizationId,
    );
    if (!membership) return null;

    return {
      sessionId: session.id,
      userId:    session.userId,
      organizationId: session.organizationId,
      role:      membership.role,
    };
  }

  /** Logout: revoke the specific session. */
  async revoke(sessionId: UUID): Promise<void> {
    await sessionRepository.deleteById(sessionId);
  }

  /** Security reset: revoke every session for the given user. */
  async revokeAll(userId: UUID): Promise<void> {
    await sessionRepository.deleteAllForUser(userId);
  }

  /**
   * Parse the session_id value from a raw Cookie header.
   * Returns null when the cookie is absent or malformed.
   */
  parseSessionId(cookieHeader?: string): string | null {
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/(?:^|;\s*)session_id=([^;]+)/);
    return match?.[1] ?? null;
  }
}

export const sessionService = new SessionService();
