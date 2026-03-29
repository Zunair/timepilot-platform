  - [x] COMPLETED Add opaque booking link generator with QR codes
    - [x] COMPLETED Create booking_links table migration (migration005 in src/db/migrate.ts)
    - [x] COMPLETED Build booking links CRUD API (src/routes/booking-links.routes.ts)
    - [x] COMPLETED Build public token-resolve + QR code API (src/routes/public-booking.routes.ts, /api/b/:token)
    - [x] COMPLETED Integrate booking links section into admin settings panel (src/client.ts)
    - [x] COMPLETED Support ?bk= token in SPA boot() to pre-load org+user context (src/client.ts)
# Phase 1 (MVP) - TODO
## Phase Status
- State: IN-PROGRESS
- Last Updated: 2026-03-28
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

- [x] COMPLETED Design and implement multi-user org model with roles
  - [x] COMPLETED Define role hierarchy (Owner, Admin, Member, Viewer) (src/types/index.ts)
  - [x] COMPLETED Create role permission matrix (src/utils/permissions.ts with Permission enum, role-to-permission mapping)
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
- [x] COMPLETED Build admin settings panel
  - [x] COMPLETED Create lightweight admin landing page (simple org list + user id + onboarding choices in src/client.ts)
  - [x] COMPLETED Create schedule rule configuration (shared availability endpoints in src/routes/availability.routes.ts)
  - [x] COMPLETED Implement timezone selection and storage (PATCH /api/users/me supports timezone field)
  - [x] COMPLETED Build branding/theme customization (PATCH /api/organizations/:id/admin/settings)
    - [x] COMPLETED Color scheme customization (primaryColor, secondaryColor fields)
    - [x] COMPLETED Custom logo upload and display (logoUrl field)
    - [x] COMPLETED Font family settings (fontFamily field)
  - [x] COMPLETED Implement per-user settings (GET/PATCH /api/users/me for firstName, lastName, timezone, profileImageUrl)
  - [x] COMPLETED Create role permission matrix (src/utils/permissions.ts with Permission enum and hasPermission checks)
  - [x] COMPLETED Create admin dashboard endpoint (GET /api/organizations/:id/admin/dashboard with stats)
  - [x] COMPLETED Build team member management UI (list, invite, remove, change role APIs)

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
  - [x] COMPLETED Defer Gmail send scope until post-login banner opt-in flow
  - [x] COMPLETED Add Google mailbox send path in notification worker with SMTP fallback
  - [x] COMPLETED Harden malformed OAuth mailbox data handling and Twilio startup validation
  - [ ] NOT-STARTED Add end-to-end worker tests for Google mailbox delivery and fallback behavior

## Post-Login Onboarding
- [ ] IN-PROGRESS Add admin landing and zero-org onboarding flow
  - [x] COMPLETED Route identity-first logins to admin landing instead of booking page
  - [x] COMPLETED Show org list and user id for logged-in users on /admin
  - [x] COMPLETED Let users without orgs choose create-organization vs appointment intent
  - [x] COMPLETED Create organization with backend-generated slug and default 14-day weekday availability

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
- [x] COMPLETED Implement timezone conversion at presentation layer
  - [x] COMPLETED Build UTC to user timezone conversion utilities (src/utils/timezone.ts with localDateTimeInTimezoneToUTC)
  - [x] COMPLETED Render client-facing times in client timezone (booking UI uses S.tz from Intl API)
  - [x] COMPLETED Store timezone preference in user settings (PATCH /api/users/me with timezone field)
  - [x] COMPLETED Store timezone preference in organization creation (POST /api/auth/organizations/create accepts timezone param)

## Testing & Quality
- [x] COMPLETED Write comprehensive unit tests
  - [x] COMPLETED Test scheduling engine logic (src/tests/scheduling.test.ts, 12 tests)
  - [x] COMPLETED Test timezone conversion edge cases (src/tests/timezone.test.ts, 21 tests)
  - [x] COMPLETED Test RBAC enforcement (src/tests/rbac.test.ts, 10 tests)
  - [x] COMPLETED Test admin and permissions system (src/tests/admin.test.ts, 11 tests)
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
- [ ] IN-PROGRESS Add Ubuntu admin setup and service operations runbook
  - [x] COMPLETED Add first-install automation script for Ubuntu (scripts/ops/install-ubuntu.sh)
  - [x] COMPLETED Add templated systemd unit for multi-instance services (scripts/ops/timepilot@.service.template)
  - [x] COMPLETED Add installer diagnostics logging and failure triage output (scripts/ops/install-ubuntu.sh)
  - [x] COMPLETED Generate instance env files from per-instance .env.example templates (scripts/ops/install-ubuntu.sh)
  - [x] COMPLETED Add SSH-aware git runner selection for sudo installs (scripts/ops/install-ubuntu.sh --git-user)
  - [x] COMPLETED Run migrations with instance env loading and guarded required-value checks (scripts/ops/install-ubuntu.sh)
  - [x] COMPLETED Add bounded startup health-check retries to avoid service boot race failures (scripts/ops/install-ubuntu.sh)
  - [x] COMPLETED Add client UI systemd automation and health checks for dev/prod instances (install script + service template)
  - [x] COMPLETED Document dev/prod service operations and env separation policy (docs/ADMIN_SETUP_UBUNTU.md)
  - [x] COMPLETED Add deployment bootstrap README with GitHub SSH key and clone instructions (docs/DEPLOYMENT.md)
  - [ ] NOT-STARTED Validate installer end-to-end on clean Ubuntu host and capture logs
- [ ] NOT-STARTED Create API documentation
- [ ] NOT-STARTED Document booking flow for clients
- [ ] NOT-STARTED Create admin setup guide
- [ ] NOT-STARTED Document timezone handling approach (in progress)

