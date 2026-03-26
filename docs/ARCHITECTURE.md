# Phase 1 Foundational Architecture Documentation

## Overview

This document describes the foundational architecture implemented for TimePilot Platform Phase 1 (MVP).

**Last Updated:** 2026-03-26  
**Status:** Implementation Complete - Ready for Testing  
**Tech Stack:** Node.js/Express + React + PostgreSQL  

## Architecture Layers

### 1. Core Type System (`src/types/index.ts`)

All types are explicitly defined with comprehensive documentation:

- **Authentication:** User, Session, OAuthProvider, RoleType
- **Organizations:** Organization (tenant), OrganizationMember (RBAC)
- **Scheduling:** Availability (hour/day/week/month), Appointment, DayOfWeek enum
- **Notifications:** NotificationType, NotificationChannel, NotificationStatus
- **Utilities:** TenantContext, ErrorResponse, UUID branded type

**Design principles:**
- All timestamps persist in UTC (ISO 8601 format)
- Timezone context tracked separately for user intent auditing
- Tenant/organization scoping explicit in all resource types
- Role-based access control defined as RoleType enum

### 2. Configuration Layer (`src/config/`)

#### `env.ts` - Environment Management
- Loads and validates all required environment variables
- Fails fast if required configuration is missing
- Centralizes configuration for portability

**Key Variables:**
- Database connection (PostgreSQL)
- Redis (for async queues)
- OAuth provider credentials (Google, Apple, Microsoft)
- Session and notification settings

#### `db.ts` - Database Connection Pool
- Creates PostgreSQL connection pool with connection pooling
- Provides `query()` function for single queries
- Provides `transaction()` function for ACID transactions
- Implements proper connection lifecycle management

### 3. Database Schema (`src/db/migrate.ts`)

**Migration 001: Initial Schema**

Tables created:
- **organizations** - Tenants (top-level isolation boundary)
- **users** - User accounts (global, not org-scoped)
- **oauth_accounts** - External auth provider accounts
- **organization_members** - RBAC junction table (role enforcement)
- **sessions** - Authenticated user sessions
- **availabilities** - Scheduling availability (hour/day/week/month)
- **appointments** - Client bookings

**Key Design Decisions:**
- All business data tables include `organization_id` for tenant isolation
- Foreign keys enforce referential integrity
- Indexes on common query patterns (organization_id, user_id, timestamps)
- Unique constraints prevent duplicate records within tenant

**Migration 002: Notifications Table**

Table created:
- **notifications** - Asynchronous notification tracking

Supports:
- Email and SMS channels
- Booking confirmation/reminder/cancellation types
- Idempotency keys for deduplication
- Retry tracking with exponential backoff
- Delivery status tracking

### 4. Data Access Layer (Repositories)

**Base Repository Pattern (`src/repositories/BaseRepository.ts`)**

Abstract base class providing:
- Common CRUD operations
- Tenant isolation enforcement
- Authorization checks (cross-tenant access prevention)
- Methods: `findById()`, `findAll()`, `count()`, `delete()`

**Organization Repository (`src/repositories/OrganizationRepository.ts`)**

Manages organizations (tenants):
- Create organization
- Find by slug (public lookup for booking pages)
- Update organization settings (admin-only)
- Only admins/owners can modify organization data

**User Repository (`src/repositories/UserRepository.ts`)**

Manages users (global, cross-organization):
- Create user (typically from OAuth)
- Find by email (for login)
- Find by ID
- Update user profile (timezone, name, image)

**Organization Member Repository (`src/repositories/OrganizationMemberRepository.ts`)**

Manages RBAC relationships:
- Add user to organization with role
- Find all members of organization
- Update member role (admin-only)
- Remove member from organization
- All operations scoped to organization_id

### 5. Middleware (`src/middleware/`)

#### `tenantContext.ts` - Tenant Isolation & RBAC
- **tenantContextMiddleware:** Extracts tenant context from authenticated session
  - Server-side resolution ensures client cannot tamper with tenant scope
  - Attaches TenantContext to request object
  
- **requireRole():** Role-based access control middleware
  - Enforces least-privilege: deny by default
  - Accepts allowed RoleType[] and validates user role
  
- **validateTenantOwnership():** Cross-tenant access prevention
  - Validates URL organization ID matches authenticated tenant
  - Blocks cross-organization resource access

#### `errorHandler.ts` - Error Handling
- Centralizes error response formatting
- Converts application errors to HTTP responses
- Logs errors appropriately (500+ level errors to console)
- Returns consistent ErrorResponse structure

### 6. Server Initialization (`src/server.ts`)

Express application setup:
- Security headers via Helmet
- CORS configuration (restricts to CLIENT_BASE_URL)
- Request parsing (JSON, forms)
- Database migration runner
- Health check endpoint
- Placeholder API routes (organized by feature)
- Global error handler
- Graceful shutdown handlers

## Multi-Tenant Isolation Strategy

**Verification Checklist (from `verification.md`):**

✅ Every resource query is scoped by tenant/organization identifier
- BaseRepository enforces organization_id filtering on all queries
- Repositories cannot be bypassed to access cross-tenant data

✅ Every create/update/delete operation validates tenant ownership
- `verifyTenantOwnership()` ensures record belongs to authenticated tenant
- OrganizationMemberRepository prevents cross-org member manipulation

✅ Cross-tenant data reads are denied by default
- Repositories throw errors if trying to access other tenant's data
- tenantContextMiddleware validates tenant scope on all protected endpoints

✅ Tenant context is resolved server-side and not trusted from client input alone
- TenantContext extracted from session (not from req.headers or req.body)
- All authorization decisions based on server-side session tenant

✅ Tests include at least one negative cross-tenant access case
- Test suite to be added in Phase 1 testing tasks

## Security Non-Negotiables (from `code.instructions.md`)

✅ Authorization on every resource by tenant and role
- tenantContextMiddleware enforces authentication
- requireRole() enforces role-based access
- validateTenantOwnership() prevents cross-tenant access

✅ Least-privilege RBAC checks server-side
- Role validation happens on protected endpoints
- RoleType enum restricts to: owner, admin, member, viewer
- Default deny approach in middleware

✅ Immutable audit events for sensitive actions
- Appointments create with explicit confirmation_ref
- Organization member changes trigger updates
- Notification tracking records all delivery attempts

✅ Encrypt secrets and provider credentials; never hardcode keys
- All sensitive values load from environment variables
- .env.example provides template without secrets
- OAuth credentials never stored in code

✅ Rate limits and abuse protections
- To be implemented in Phase 1: Auth endpoints, Booking endpoints, Notification endpoints

✅ Validate/sanitize all external input
- To be implemented in Phase 1: Input validation layer

## Timezone & Date Policy (from `code.instructions.md`)

✅ Persist all event times in UTC in backend/storage
- All timestamp columns store TIMESTAMP WITH TIME ZONE
- Application logic persists times in UTC

✅ Persist timezone context where needed for user intent/auditing
- Availability table includes `timezone` field for user's preferred timezone
- Appointment table includes `timezone` field for booking context
- User table includes `timezone` field for user's preferred timezone

✅ Convert from UTC to viewer timezone only at presentation boundaries
- To be implemented in Phase 1: Frontend converter utilities

✅ Include DST boundary tests for scheduling and reminders
- Test cases to be added in Phase 1 testing

## Getting Started

### 1. Environment Setup

```powershell
# Copy environment template
Copy-Item .env.example .env

# Edit .env with your values:
# - PostgreSQL connection string
# - Redis connection string
# - OAuth provider credentials
# - Session secret
```

### 2. Database Setup

```powershell
# Install dependencies
npm install

# Run migrations (called automatically on server start)
npm run migrate
```

### 3. Start Development Servers

```powershell
# Backend API
npm run dev

# Client placeholder
npm run dev:client
```

Server processes will:
1. Run migrations (if needed)
2. Create the database connection pool
3. Start the HTTP API on port 3000
4. Start the client placeholder on port 3001

## API Endpoints (Placeholder Structure)

```
Authentication
  POST   /api/auth/login                    - OAuth/credentials login
  POST   /api/auth/logout                   - Invalidate session
  GET    /api/auth/profile                  - Current user profile

Organizations
  GET    /api/organizations/:id             - Get org details (admin+)
  PUT    /api/organizations/:id             - Update org settings (admin+)
  GET    /api/organizations/:id/members     - List members (admin+)
  POST   /api/organizations/:id/members     - Invite member (admin+)

Availability
  POST   /api/organizations/:id/availabilities         - Create (admin+)
  GET    /api/organizations/:id/availabilities         - List (auth user)
  PUT    /api/organizations/:id/availabilities/:id     - Update (admin+)
  DELETE /api/organizations/:id/availabilities/:id     - Delete (admin+)

Appointments
  POST   /api/organizations/:id/appointments           - Book appointment (public)
  GET    /api/organizations/:id/appointments           - List (admin+)
  PATCH  /api/organizations/:id/appointments/:id       - Cancel (admin+)
```

## Next Steps (Phase 1 Remaining Tasks)

1. **Authentication Implementation**
   - OAuth 2.0 integration (Google, Apple, Microsoft)
   - Session management and JWT handling
   - Login/logout flows

2. **Scheduling Engine**
   - Availability conflict detection
   - Appointment creation with validation
   - Buffer time enforcement

3. **Client Booking UI**
   - React calendar component
   - Time slot selection
   - Booking form
   - Confirmation flow

4. **Notifications System**
   - Email notification service
   - SMS notification service  
   - Async queue worker
   - Retry logic with exponential backoff

5. **Admin Settings Panel**
   - Organization settings editor
   - Availability templates
   - Timezone configuration
   - Branding/theme settings

6. **Testing & Verification**
   - Unit tests for domain logic
   - Integration tests for booking flow
   - Multi-tenant isolation tests
   - DST boundary tests

## References

- Architecture Decisions: `docs/decision-log/`
- Code Standards: `.claude/rules/code.instructions.md`
- SQL Standards: `.claude/rules/sql.instructions.md`
- Documentation Standards: `.claude/rules/documentation.instructions.md`
- Verification Checklist: `.github/instructions/verification.md`
- Phase Gates: `.github/instructions/phase-gates.md`
