# Phase 1 (MVP) - TODO
## Phase Status
- State: IN-PROGRESS
- Last Updated: 2026-03-27
- Owner: Tech Lead
- Active Blockers: None
- Approval: Tech Lead
- Verification: /.github/instructions/verification.md
- Gate: /.github/instructions/phase-gates.md
- Architecture: /docs/ARCHITECTURE.md
- Implementation Status: /docs/IMPLEMENTATION_STATUS.md

## Core Architecture
- [x] COMPLETED Implement multi-tenant architecture with strict tenant isolation
  - [x] COMPLETED Design tenant data segregation strategy (ADR-0001)
  - [x] COMPLETED Implement tenant context middleware (src/middleware/tenantContext.ts)
  - [x] COMPLETED Create tenant configuration management (src/config/)
  - [x] COMPLETED Set up database schemas with tenant isolation (src/db/migrate.ts)
  - [x] COMPLETED Add tenant-based query filtering on all repositories (BaseRepository pattern)

- [x] IN-PROGRESS Design and implement multi-user org model with roles
  - [x] COMPLETED Define role hierarchy (Owner, Admin, Member, Viewer) (src/types/index.ts)
  - [ ] IN-PROGRESS Create role permission matrix
  - [x] COMPLETED Implement role-based access control middleware (src/middleware/tenantContext.ts)
  - [x] COMPLETED Build org member management system (src/repositories/OrganizationMemberRepository.ts)

## Authentication & Authorization
- [ ] IN-PROGRESS Implement social login with OAuth/OIDC
  - [x] COMPLETED Google OAuth integration (src/routes/auth.routes.ts, src/tests/auth-providers.test.ts)
  - [x] COMPLETED Apple Sign-In integration (src/routes/auth.routes.ts, src/tests/auth-providers.test.ts)
  - [x] COMPLETED Microsoft OAuth integration (src/routes/auth.routes.ts, src/tests/auth-providers.test.ts)
  - [x] COMPLETED Handle OAuth token refresh and expiry (token lifecycle persistence + /api/auth/providers/:provider/refresh endpoint with integration tests)
  - [x] COMPLETED Create user profile from OAuth claims (handleOAuthLogin user upsert in src/routes/auth.routes.ts)

- [x] COMPLETED Build session management system
  - [x] COMPLETED Implement secure session storage (src/repositories/SessionRepository.ts, sessions DB table)
  - [x] COMPLETED Add session timeout handling (expires_at checked on every request)
  - [x] COMPLETED Create logout and session revocation (SessionService.revoke / revokeAll)

## Scheduling Engine
- [x] COMPLETED Create scheduling engine with flexible availability
  - [x] COMPLETED Support hour-based availability configuration (AvailabilityType.HOUR)
  - [x] COMPLETED Support day-based availability configuration (AvailabilityType.DAY)
  - [x] COMPLETED Support week-based availability configuration (AvailabilityType.WEEK, daysOfWeek filter)
  - [x] COMPLETED Support month-based availability configuration (AvailabilityType.MONTH)
  - [x] COMPLETED Build availability conflict detection (SchedulingService + rangesOverlap)
  - [x] COMPLETED Add buffer time between appointments (bufferMinutes on Availability)

- [x] COMPLETED Implement appointment management
  - [x] COMPLETED Create appointment creation and validation (AppointmentService.create + slot guard)
  - [x] COMPLETED Build appointment modification system (AppointmentService.updateDetails + PATCH /appointments/:id)
  - [x] COMPLETED Implement appointment cancellation with recovery (AppointmentService.cancel)
  - [x] COMPLETED Add appointment rescheduling (AppointmentService.reschedule + POST /appointments/:id/reschedule)

## Client Booking Interface
- [x] COMPLETED Build client-facing booking experience
  - [x] COMPLETED Create calendar UI with date navigation (month view, prev/next nav, past-date disabling)
  - [x] COMPLETED Implement month view navigation (prev/next buttons, disabled when at current month)
  - [x] COMPLETED Build time-slot selection component (slot pill grid loaded per date via availability API)
  - [x] COMPLETED Add appointment summary display (slot summary card shown before form)
  - [x] COMPLETED Implement client form (name*, email*, phone, notes with client-side validation)

- [x] COMPLETED Build booking confirmation flow
  - [x] COMPLETED Display booking summary to client (confirmation screen with date/time/timezone/name)
  - [x] COMPLETED Create confirmation button and success state (confirmed screen with copyable ref code)
  - [x] COMPLETED Generate booking reference/confirmation number (TP-YYYYMMDD-XXXXXXXX via src/utils/confirmation.ts)

## Settings & Configuration
- [ ] NOT-STARTED Build admin settings panel
  - [ ] NOT-STARTED Create schedule rule configuration
  - [ ] NOT-STARTED Implement timezone selection and storage
  - [ ] NOT-STARTED Build branding/theme customization
    - [ ] NOT-STARTED Color scheme customization
    - [ ] NOT-STARTED Custom logo upload and display
    - [ ] NOT-STARTED Font and typography settings
  - [ ] NOT-STARTED Implement per-user settings
  - [ ] NOT-STARTED Create availability templates

## Notifications System
- [x] COMPLETED Implement email notifications
  - [x] COMPLETED Build email template system (HTML builder in src/workers/NotificationWorker.ts)
  - [x] COMPLETED Send confirmation emails on appointment creation (BOOKING_CONFIRMATION type)
  - [x] COMPLETED Send cancellation emails (BOOKING_CANCELLATION type)
  - [x] COMPLETED Send reminder emails before appointment (BOOKING_REMINDER type)
  - [x] COMPLETED Handle bounces and delivery failures (status tracking + retry logic)

- [x] COMPLETED Implement SMS notifications via Twilio
  - [x] COMPLETED Integrate Twilio SDK (src/workers/NotificationWorker.ts, dynamic import)
  - [x] COMPLETED Send confirmation SMS
  - [x] COMPLETED Send cancellation SMS
  - [x] COMPLETED Send reminder SMS
  - [x] COMPLETED Handle SMS delivery status tracking (NotificationStatus enum, attempts, sentAt)

- [x] COMPLETED Build async queue/worker model for notifications
  - [x] COMPLETED Set up DB-polling worker (30s interval, production-ready without Redis dependency)
  - [x] COMPLETED Create notification worker processes (src/workers/NotificationWorker.ts)
  - [x] COMPLETED Implement retry logic with exponential backoff (nextRetryAt = min(2^n × 60s, 16min))
  - [ ] NOT-STARTED Add dead-letter queue for failed notifications (max 5 attempts, then abandoned)

- [ ] IN-PROGRESS Add provider mailbox sending (Google first)
  - [x] COMPLETED Request Gmail send scope during Google OAuth with explicit user-facing purpose notice
  - [x] COMPLETED Add Google mailbox send path in notification worker with SMTP fallback
  - [ ] NOT-STARTED Add end-to-end worker tests for Google mailbox delivery and fallback behavior

## Backend Persistence
- [x] COMPLETED Set up database schema (src/db/migrate.ts)
  - [x] COMPLETED Create all entities with proper relationships
  - [x] COMPLETED Store all backend timestamps in UTC only
  - [x] COMPLETED Add timezone context fields for user intent auditing
  - [x] COMPLETED Create database migration system (forward-only, auditable)

- [x] COMPLETED Build ORM/data access layer (src/repositories/)
  - [x] COMPLETED Create repository pattern implementations (BaseRepository + specific repos)
  - [x] COMPLETED Implement query builders for common operations (findById, findAll, etc)
  - [x] COMPLETED Add database connection pooling (src/config/db.ts)

## Frontend Timezone Handling
- [ ] NOT-STARTED Implement timezone conversion at presentation layer
  - [ ] NOT-STARTED Build UTC to user timezone conversion utilities
  - [ ] NOT-STARTED Render all user-facing times in user's timezone
  - [ ] NOT-STARTED Render all client-facing times in client timezone
  - [ ] NOT-STARTED Store timezone preference in user settings
  - [ ] NOT-STARTED Store timezone preference in client sessions

## Testing & Quality
- [x] COMPLETED Write comprehensive unit tests
  - [x] COMPLETED Test scheduling engine logic (src/tests/scheduling.test.ts, 12 tests)
  - [x] COMPLETED Test timezone conversion edge cases (src/tests/timezone.test.ts, 21 tests)
  - [x] COMPLETED Test RBAC enforcement (src/tests/rbac.test.ts, 10 tests)
  - [ ] NOT-STARTED Test notification queue processing (worker integration test pending)

- [ ] IN-PROGRESS Write integration tests
  - [ ] NOT-STARTED Test full booking flow end-to-end
  - [x] COMPLETED Test multi-tenant isolation (src/tests/tenant-isolation.test.ts, 9 tests)
  - [x] COMPLETED Test OAuth integration (provider helper tests + callback route integration tests in src/tests/auth-providers.test.ts and src/tests/auth-callbacks.integration.test.ts)
  - [ ] NOT-STARTED Test timezone handling across system

- [x] COMPLETED Test DST boundary behavior
  - [x] COMPLETED Create edge case tests for DST transitions (timezone.test.ts)
  - [x] COMPLETED Test scheduling across DST changes (getDayOfWeekInTimezone DST tests)
  - [ ] NOT-STARTED Test reminders during DST transitions

## Documentation
- [x] COMPLETED Architecture documentation (docs/ARCHITECTURE.md)
- [x] COMPLETED Implementation status documentation (docs/IMPLEMENTATION_STATUS.md)
- [ ] NOT-STARTED Create API documentation
- [ ] NOT-STARTED Document booking flow for clients
- [ ] NOT-STARTED Create admin setup guide
- [ ] NOT-STARTED Document timezone handling approach (in progress)

