# TimePilot Platform — Architecture

**Last Updated:** 2026-03-30

## Overview

TimePilot is a multi-tenant scheduling platform built on Node.js/Express + TypeScript with PostgreSQL and Redis. This document describes the architecture as implemented in Phase 1 (MVP).

## Architecture Layers

### 1. Core Type System (`src/types/index.ts`)

All domain types are explicitly defined with JSDoc:

- **Authentication:** User, Session, OAuthProvider, RoleType
- **Organizations:** Organization (tenant), OrganizationMember (RBAC)
- **Scheduling:** Availability (hour/day/week/month), TimeBlock (unavailability), Appointment, DayOfWeek
- **Notifications:** NotificationType, NotificationChannel, NotificationStatus
- **Utilities:** TenantContext, ErrorResponse, UUID branded type

Design rules:
- All timestamps in UTC (ISO 8601)
- Timezone context tracked separately for auditing
- Tenant/org scoping explicit in all resource types
- RBAC via RoleType enum (owner, admin, member, viewer)

### 2. Configuration (`src/config/`)

| File | Responsibility |
|------|---------------|
| `env.ts` | Loads/validates all env vars; fails fast on missing config |
| `db.ts` | PostgreSQL connection pool, `query()` and `transaction()` helpers |

### 3. Database (`src/db/migrate.ts`)

Forward-only migration system. Current schema:

| Table | Purpose |
|-------|---------|
| `organizations` | Tenants (top-level isolation boundary) |
| `users` | Global user accounts |
| `oauth_accounts` | OAuth provider links (Google/Apple/Microsoft) |
| `organization_members` | RBAC junction (org × user × role) |
| `sessions` | Authenticated sessions |
| `availabilities` | Scheduling windows (hour/day/week/month) |
| `time_blocks` | Unavailability / blocked periods |
| `appointments` | Client bookings with confirmation ref |
| `notifications` | Async delivery tracking (email/SMS) |

Key design decisions:
- All business tables include `organization_id` for tenant isolation
- Foreign keys enforce referential integrity
- Indexes on `organization_id`, `user_id`, and timestamp columns
- Unique constraints prevent duplicates within a tenant

### 4. Data Access (`src/repositories/`)

Abstract `BaseRepository` provides tenant-scoped CRUD:
- `findById(id, tenant)` — validates tenant ownership
- `findAll(tenant, options)` — filtered by org
- `count(tenant)` / `delete(id, tenant)`
- `verifyTenantOwnership(id, tenant)` — cross-tenant access prevention

Concrete repositories: Organization, User, OrganizationMember, Availability, Appointment, Notification, OAuthAccount, Session, TimeBlock.

### 5. Middleware (`src/middleware/`)

| Middleware | Purpose |
|-----------|---------|
| `tenantContextMiddleware` | Extracts tenant context from session (server-side, never from client) |
| `requireRole(...roles)` | RBAC enforcement (deny by default) |
| `validateTenantOwnership` | Blocks cross-org resource access via URL param check |
| `errorHandler` | Centralised error → HTTP response formatting |

### 6. Services (`src/services/`)

| Service | Responsibility |
|---------|---------------|
| `SchedulingService` | Slot generation, conflict detection, buffer enforcement, time-block exclusion |
| `AppointmentService` | Create/modify/reschedule/cancel appointments |
| `NotificationService` | Queue booking confirmations, reminders, cancellations |
| `SessionService` | Create/validate/revoke sessions |
| `GoogleMailboxService` | Google Calendar watch/notification integration |

### 7. Routes (`src/routes/`)

All protected routes use `tenantContextMiddleware` + `requireRole()`.

| File | Prefix | Description |
|------|--------|-------------|
| `auth.routes.ts` | `/api/auth` | OAuth login/callback/logout, provider listing |
| `organizations.routes.ts` | `/api/organizations` | Admin dashboard, settings, team CRUD |
| `users.routes.ts` | `/api/users` | Profile (me), public profile |
| `availability.routes.ts` | `/api/organizations/:id/availability` | CRUD for scheduling windows |
| `appointments.routes.ts` | `/api/organizations/:id/appointments` | Booking management |
| `booking-links.routes.ts` | `/api/organizations/:id/booking-links` | Public booking link metadata |
| `public-booking.routes.ts` | `/api/public/book` | Unauthenticated booking flow |

### 8. Workers (`src/workers/`)

Bull queue workers process notifications asynchronously:
- Email via SMTP (SendGrid or any provider)
- SMS via Twilio
- Exponential backoff retry with delivery-status tracking

See [ADR-0002](decision-log/0002-async-notification-delivery.md) for design rationale.

### 9. Client (`src/client.ts`)

Vanilla JS SPA served on port 3001. Includes:
- Month-view calendar with slot selection
- Booking form and confirmation flow
- Admin dashboard (org settings, team management, availability CRUD, time-block management)
- OAuth login flow integration

## Multi-Tenant Isolation

- Every resource query scoped by `organization_id`
- Every create/update/delete validates tenant ownership
- Cross-tenant reads denied by default
- Tenant context resolved server-side from session (never from request body/headers)
- Negative cross-tenant access tests in test suite

See [ADR-0001](decision-log/0001-tenant-isolation-strategy.md) for design rationale.

## Security

- Tenant context middleware on all protected endpoints
- Role-based access control (owner > admin > member > viewer)
- Environment-based secrets (no hardcoded keys)
- OAuth 2.0 with token refresh and expiry tracking
- Input validation via Joi
- Session revocation on member removal

## Timezone & Date Policy

- All timestamps stored as `TIMESTAMP WITH TIME ZONE` in UTC
- Timezone context stored separately on `availabilities`, `appointments`, and `users`
- Conversion to viewer timezone at presentation boundary (client-side)
- DST boundary tests in scheduling test suite

## References

- [Decision Log](decision-log/)
- [Phase Roadmap](Phase.RoadMap.md)
- [Code Standards](../.claude/rules/code.instructions.md)
- [SQL Standards](../.claude/rules/sql.instructions.md)
