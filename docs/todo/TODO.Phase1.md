# Phase 1 (MVP) - TODO
## Phase Status
- State: IN-PROGRESS
- Last Updated: 2026-03-26
- Owner: Tech Lead
- Active Blockers: None
- Approval: Tech Lead
- Verification: /.github/instructions/verification.md
- Gate: /.github/instructions/phase-gates.md

## Core Architecture
- [ ] NOT-STARTED Implement multi-tenant architecture with strict tenant isolation
  - [ ] NOT-STARTED Design tenant data segregation strategy
  - [ ] NOT-STARTED Implement tenant context middleware
  - [ ] NOT-STARTED Create tenant configuration management
  - [ ] NOT-STARTED Set up database schemas with tenant isolation
  - [ ] NOT-STARTED Add tenant-based query filtering on all repositories

- [ ] NOT-STARTED Design and implement multi-user org model with roles
  - [ ] NOT-STARTED Define role hierarchy (Owner, Admin, Member, Viewer)
  - [ ] NOT-STARTED Create role permission matrix
  - [ ] NOT-STARTED Implement role-based access control middleware
  - [ ] NOT-STARTED Build org member management system

## Authentication & Authorization
- [ ] NOT-STARTED Implement social login with OAuth/OIDC
  - [ ] NOT-STARTED Google OAuth integration
  - [ ] NOT-STARTED Apple Sign-In integration
  - [ ] NOT-STARTED Microsoft OAuth integration
  - [ ] NOT-STARTED Handle OAuth token refresh and expiry
  - [ ] NOT-STARTED Create user profile from OAuth claims

- [ ] NOT-STARTED Build session management system
  - [ ] NOT-STARTED Implement secure session storage
  - [ ] NOT-STARTED Add session timeout handling
  - [ ] NOT-STARTED Create logout and session revocation

## Scheduling Engine
- [ ] NOT-STARTED Create scheduling engine with flexible availability
  - [ ] NOT-STARTED Support hour-based availability configuration
  - [ ] NOT-STARTED Support day-based availability configuration
  - [ ] NOT-STARTED Support week-based availability configuration
  - [ ] NOT-STARTED Support month-based availability configuration
  - [ ] NOT-STARTED Build availability conflict detection
  - [ ] NOT-STARTED Add buffer time between appointments

- [ ] NOT-STARTED Implement appointment management
  - [ ] NOT-STARTED Create appointment creation and validation
  - [ ] NOT-STARTED Build appointment modification system
  - [ ] NOT-STARTED Implement appointment cancellation with recovery
  - [ ] NOT-STARTED Add appointment rescheduling

## Client Booking Interface
- [ ] NOT-STARTED Build client-facing booking experience
  - [ ] NOT-STARTED Create calendar UI with date navigation
  - [ ] NOT-STARTED Implement month view navigation
  - [ ] NOT-STARTED Build time-slot selection component
  - [ ] NOT-STARTED Add appointment summary display
  - [ ] NOT-STARTED Implement client form (name, email, phone)

- [ ] NOT-STARTED Build booking confirmation flow
  - [ ] NOT-STARTED Display booking summary to client
  - [ ] NOT-STARTED Create confirmation button and success state
  - [ ] NOT-STARTED Generate booking reference/confirmation number

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
- [ ] NOT-STARTED Implement email notifications
  - [ ] NOT-STARTED Build email template system
  - [ ] NOT-STARTED Send confirmation emails on appointment creation
  - [ ] NOT-STARTED Send cancellation emails
  - [ ] NOT-STARTED Send reminder emails before appointment
  - [ ] NOT-STARTED Handle bounces and delivery failures

- [ ] NOT-STARTED Implement SMS notifications via Twilio
  - [ ] NOT-STARTED Integrate Twilio SDK
  - [ ] NOT-STARTED Send confirmation SMS
  - [ ] NOT-STARTED Send cancellation SMS
  - [ ] NOT-STARTED Send reminder SMS
  - [ ] NOT-STARTED Handle SMS delivery status tracking

- [ ] NOT-STARTED Build async queue/worker model for notifications
  - [ ] NOT-STARTED Set up message queue (Redis/RabbitMQ)
  - [ ] NOT-STARTED Create notification worker processes
  - [ ] NOT-STARTED Implement retry logic with exponential backoff
  - [ ] NOT-STARTED Add dead-letter queue for failed notifications

## Backend Persistence
- [ ] NOT-STARTED Set up database schema
  - [ ] NOT-STARTED Create all entities with proper relationships
  - [ ] NOT-STARTED Store all backend timestamps in UTC only
  - [ ] NOT-STARTED Add timezone context fields for user intent auditing
  - [ ] NOT-STARTED Create database migration system

- [ ] NOT-STARTED Build ORM/data access layer
  - [ ] NOT-STARTED Create repository pattern implementations
  - [ ] NOT-STARTED Implement query builders for common operations
  - [ ] NOT-STARTED Add database connection pooling

## Frontend Timezone Handling
- [ ] NOT-STARTED Implement timezone conversion at presentation layer
  - [ ] NOT-STARTED Build UTC to user timezone conversion utilities
  - [ ] NOT-STARTED Render all user-facing times in user's timezone
  - [ ] NOT-STARTED Render all client-facing times in client timezone
  - [ ] NOT-STARTED Store timezone preference in user settings
  - [ ] NOT-STARTED Store timezone preference in client sessions

## Testing & Quality
- [ ] IN-PROGRESS Write comprehensive unit tests
  - [ ] NOT-STARTED Test scheduling engine logic
  - [ ] NOT-STARTED Test timezone conversion edge cases
  - [ ] NOT-STARTED Test RBAC enforcement
  - [ ] NOT-STARTED Test notification queue processing

- [ ] NOT-STARTED Write integration tests
  - [ ] NOT-STARTED Test full booking flow end-to-end
  - [ ] NOT-STARTED Test multi-tenant isolation
  - [ ] NOT-STARTED Test OAuth integration
  - [ ] NOT-STARTED Test timezone handling across system

- [ ] NOT-STARTED Test DST boundary behavior
  - [ ] NOT-STARTED Create edge case tests for DST transitions
  - [ ] NOT-STARTED Test scheduling across DST changes
  - [ ] NOT-STARTED Test reminders during DST transitions

## Documentation
- [ ] NOT-STARTED Create API documentation
- [ ] NOT-STARTED Document booking flow for clients
- [ ] NOT-STARTED Create admin setup guide
- [ ] NOT-STARTED Document timezone handling approach

