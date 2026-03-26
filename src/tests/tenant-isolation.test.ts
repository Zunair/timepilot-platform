/**
 * Tenant Isolation Tests
 *
 * Verifies that authorization middleware and service boundaries enforce
 * strict multi-tenant isolation: one organization's data cannot be
 * accessed by a session belonging to a different organization.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { UUID, TenantContext } from '../types/index.js';
import { RoleType } from '../types/index.js';

// Prevent DB connection during import
vi.mock('../services/SessionService.js', () => ({
  sessionService: {
    parseSessionId: vi.fn(),
    validate:       vi.fn(),
  },
}));
vi.mock('../repositories/AvailabilityRepository.js', () => ({
  availabilityRepository: { findActiveInRange: vi.fn() },
}));
vi.mock('../repositories/AppointmentRepository.js', () => ({
  appointmentRepository: { findConflicting: vi.fn() },
}));

import { requireRole, validateTenantOwnership } from '../middleware/tenantContext.js';
import { schedulingService } from '../services/SchedulingService.js';
import { availabilityRepository } from '../repositories/AvailabilityRepository.js';
import { appointmentRepository } from '../repositories/AppointmentRepository.js';

// ============================================================================
// Test helpers
// ============================================================================

const ORG_A = 'org-alpha' as UUID;
const ORG_B = 'org-beta'  as UUID;

function makeTenantFor(orgId: UUID, role = RoleType.ADMIN): TenantContext {
  return { organizationId: orgId, userId: 'user-1' as UUID, role };
}

function makeReq(tenant?: TenantContext, orgIdParam?: string): Partial<Request> {
  return {
    headers: {},
    params:  orgIdParam ? { organizationId: orgIdParam } : {},
    tenant,
  };
}

function makeRes() {
  const captured: { status?: number; body?: unknown } = {};
  const res: any = {
    status(code: number) { captured.status = code; return res; },
    json(data: unknown)  { captured.body   = data;  return res; },
  };
  return { res: res as Response, captured };
}

// ============================================================================
// Cross-tenant URL parameter checks
// ============================================================================

describe('validateTenantOwnership — cross-tenant isolation', () => {
  let next: NextFunction;

  beforeEach(() => { next = vi.fn(); });

  it('allows access when the URL org param matches the session org', () => {
    const req = makeReq(makeTenantFor(ORG_A), ORG_A) as Request;
    const { res } = makeRes();

    validateTenantOwnership(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('denies access (403) when the URL org param belongs to a DIFFERENT org', () => {
    // Session belongs to ORG_A but the URL targets ORG_B resources
    const req = makeReq(makeTenantFor(ORG_A), ORG_B) as Request;
    const { res, captured } = makeRes();

    validateTenantOwnership(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(captured.status).toBe(403);
    expect((captured.body as any).error).toBe('FORBIDDEN');
  });

  it('denies a VIEWER from ORG_B accessing ORG_A resources', () => {
    const req = makeReq(makeTenantFor(ORG_B, RoleType.VIEWER), ORG_A) as Request;
    const { res, captured } = makeRes();

    validateTenantOwnership(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(captured.status).toBe(403);
  });

  it('denies an OWNER from ORG_B accessing ORG_A resources', () => {
    // Even elevated roles cannot bypass cross-tenant isolation
    const req = makeReq(makeTenantFor(ORG_B, RoleType.OWNER), ORG_A) as Request;
    const { res, captured } = makeRes();

    validateTenantOwnership(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(captured.status).toBe(403);
  });

  it('returns 401 when there is no session (unauthenticated cross-tenant attempt)', () => {
    const req = makeReq(undefined, ORG_A) as Request;
    const { res, captured } = makeRes();

    validateTenantOwnership(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(captured.status).toBe(401);
  });
});

// ============================================================================
// Role checks do not substitute for tenant isolation
// ============================================================================

describe('requireRole + validateTenantOwnership composition', () => {
  let next: NextFunction;

  beforeEach(() => { next = vi.fn(); });

  it('passes both checks when role matches and org matches', () => {
    const roleMiddleware   = requireRole(RoleType.ADMIN, RoleType.OWNER);
    const tenantMiddleware = validateTenantOwnership;

    const req = makeReq(makeTenantFor(ORG_A, RoleType.ADMIN), ORG_A) as Request;
    const { res } = makeRes();

    // Apply role check first, then tenant ownership, each with its own next
    const captureNext1 = vi.fn(() => {
      tenantMiddleware(req, res, next);
    });
    roleMiddleware(req, res, captureNext1);

    expect(captureNext1).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it('stops at role check (403) before reaching tenant ownership check', () => {
    const roleMiddleware   = requireRole(RoleType.OWNER);
    const tenantMiddleware = validateTenantOwnership;
    let tenantCheckRan = false;

    const req = makeReq(makeTenantFor(ORG_A, RoleType.VIEWER), ORG_A) as Request;
    const { res } = makeRes();

    const captureNext1 = vi.fn(() => {
      tenantCheckRan = true;
      tenantMiddleware(req, res, next);
    });

    roleMiddleware(req, res, captureNext1);

    expect(captureNext1).not.toHaveBeenCalled();
    expect(tenantCheckRan).toBe(false);
  });
});

// ============================================================================
// Scheduling service passes tenant context to the repository layer
// ============================================================================

describe('SchedulingService tenant context propagation', () => {
  beforeEach(() => {
    vi.mocked(availabilityRepository.findActiveInRange).mockResolvedValue([]);
    vi.mocked(appointmentRepository.findConflicting).mockResolvedValue([]);
  });

  it('forwards tenant context from getAvailableSlots to the availability repository', async () => {
    const tenant = makeTenantFor(ORG_A);

    await schedulingService.getAvailableSlots({
      userId:              'user-1' as UUID,
      date:                '2024-03-04',
      clientTimezone:      'UTC',
      slotDurationMinutes: 60,
      tenant,
    });

    expect(vi.mocked(availabilityRepository.findActiveInRange)).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(String),
      tenant, // tenant context must be passed through
    );
  });

  it('forwards tenant context from isSlotAvailable to the appointment repository', async () => {
    const tenant = makeTenantFor(ORG_A);

    await schedulingService.isSlotAvailable({
      userId:    'user-1' as UUID,
      startTime: '2024-03-04T09:00:00.000Z',
      endTime:   '2024-03-04T10:00:00.000Z',
      tenant,
    });

    expect(vi.mocked(appointmentRepository.findConflicting)).toHaveBeenCalledWith(
      'user-1',
      '2024-03-04T09:00:00.000Z',
      '2024-03-04T10:00:00.000Z',
      tenant, // tenant context must be passed through
      undefined,
    );
  });
});
