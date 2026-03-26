/**
 * RBAC Middleware Tests
 *
 * Verifies that requireRole and validateTenantOwnership enforce least-privilege
 * access control without requiring a database connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { UUID, TenantContext } from '../types/index.js';
import { RoleType } from '../types/index.js';

// Prevent DB connection: mock SessionService before importing tenantContext
vi.mock('../services/SessionService.js', () => ({
  sessionService: {
    parseSessionId: vi.fn(),
    validate: vi.fn(),
  },
}));

import { requireRole, validateTenantOwnership } from '../middleware/tenantContext.js';

// ============================================================================
// Test helpers
// ============================================================================

function makeTenant(role: RoleType, organizationId = 'org-a' as UUID): TenantContext {
  return { organizationId, userId: 'user-1' as UUID, role };
}

function makeReq(overrides: Partial<Request> = {}): Partial<Request> {
  return { headers: {}, params: {}, ...overrides };
}

function makeRes() {
  const captured: { statusCode?: number; body?: unknown } = {};
  const res: any = {
    status(code: number) { captured.statusCode = code; return res; },
    json(payload: unknown) { captured.body = payload; return res; },
  };
  return { res: res as Partial<Response>, captured };
}

// ============================================================================
// requireRole
// ============================================================================

describe('requireRole', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('calls next when the role is in the allowed list', () => {
    const middleware = requireRole(RoleType.OWNER, RoleType.ADMIN);
    const req = makeReq({ tenant: makeTenant(RoleType.ADMIN) }) as Request;
    const { res } = makeRes();

    middleware(req, res as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect((res as any).status).not.toHaveBeenCalled;
  });

  it('returns 403 when the role is NOT in the allowed list', () => {
    const middleware = requireRole(RoleType.OWNER, RoleType.ADMIN);
    const req = makeReq({ tenant: makeTenant(RoleType.VIEWER) }) as Request;
    const { res, captured } = makeRes();

    middleware(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(captured.statusCode).toBe(403);
    expect((captured.body as any).error).toBe('FORBIDDEN');
  });

  it('returns 401 when there is no tenant context on the request', () => {
    const middleware = requireRole(RoleType.OWNER);
    const req = makeReq() as Request; // no tenant
    const { res, captured } = makeRes();

    middleware(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(captured.statusCode).toBe(401);
    expect((captured.body as any).error).toBe('UNAUTHORIZED');
  });

  it('allows OWNER to pass an OWNER-only gate', () => {
    const middleware = requireRole(RoleType.OWNER);
    const req = makeReq({ tenant: makeTenant(RoleType.OWNER) }) as Request;
    const { res } = makeRes();

    middleware(req, res as Response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('denies MEMBER from an OWNER-only gate', () => {
    const middleware = requireRole(RoleType.OWNER);
    const req = makeReq({ tenant: makeTenant(RoleType.MEMBER) }) as Request;
    const { res, captured } = makeRes();

    middleware(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(captured.statusCode).toBe(403);
  });

  it('allows any role in the allowed set regardless of order', () => {
    const middleware = requireRole(RoleType.MEMBER, RoleType.VIEWER, RoleType.ADMIN);

    for (const role of [RoleType.MEMBER, RoleType.VIEWER, RoleType.ADMIN]) {
      const localNext = vi.fn();
      const req = makeReq({ tenant: makeTenant(role) }) as Request;
      const { res } = makeRes();
      middleware(req, res as Response, localNext);
      expect(localNext).toHaveBeenCalledOnce();
    }
  });
});

// ============================================================================
// validateTenantOwnership
// ============================================================================

describe('validateTenantOwnership', () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
  });

  it('calls next when :organizationId param matches tenant org', () => {
    const req = makeReq({
      tenant: makeTenant(RoleType.ADMIN, 'org-a' as UUID),
      params: { organizationId: 'org-a' },
    }) as Request;
    const { res } = makeRes();

    validateTenantOwnership(req, res as Response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when :organizationId param does NOT match tenant org', () => {
    const req = makeReq({
      tenant: makeTenant(RoleType.ADMIN, 'org-a' as UUID),
      params: { organizationId: 'org-b' }, // different org
    }) as Request;
    const { res, captured } = makeRes();

    validateTenantOwnership(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(captured.statusCode).toBe(403);
    expect((captured.body as any).error).toBe('FORBIDDEN');
  });

  it('returns 401 when there is no tenant context', () => {
    const req = makeReq({ params: { organizationId: 'org-a' } }) as Request;
    const { res, captured } = makeRes();

    validateTenantOwnership(req, res as Response, next);

    expect(next).not.toHaveBeenCalled();
    expect(captured.statusCode).toBe(401);
  });

  it('calls next when :organizationId param is absent (no restriction)', () => {
    const req = makeReq({
      tenant: makeTenant(RoleType.ADMIN, 'org-a' as UUID),
      params: {}, // no organizationId param
    }) as Request;
    const { res } = makeRes();

    validateTenantOwnership(req, res as Response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
