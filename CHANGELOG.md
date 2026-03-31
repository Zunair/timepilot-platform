# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Remaining
- Dead-letter queue for failed notifications
- End-to-end worker tests for Google mailbox delivery
- Full booking flow E2E tests
- Timezone and DST transition tests
- API documentation, booking flow docs, admin setup guide
- Ubuntu installer end-to-end validation on clean host

## Phase 1 (MVP) — 2026-03

### Added
- Multi-tenant architecture with strict tenant isolation and RBAC (Owner/Admin/Member/Viewer)
- OAuth 2.0 SSO — Google, Apple, Microsoft with token refresh and account linking
- Session management with secure storage, timeout, logout, and revocation
- Scheduling engine — hour/day/week/month availability, conflict detection, buffer times
- Timezone-safe slot generation with DST-aware date-leak fix and bounded recurring windows
- Time-block (unavailability) management with scheduling exclusion
- Client booking SPA — calendar, slot picker, form, confirmation, shareable ref URLs
- Admin dashboard — settings panel, team management, branding/theme, user logos
- Availability & time-block CRUD with Recurring/One-time toggle UX
- Opaque booking links with QR code generation
- Async notification system — email (SMTP + Google mailbox) and SMS (Twilio) via Bull queue
- Notification worker with 30s polling and provider-first mailbox fallback
- Admin onboarding flow — org-less sessions, org creation, deferred Google consent
- Ubuntu multi-instance deployment automation (systemd services, installer script)
- Deployment runbook with SSH bootstrap, health-check retry, client systemd
- Demo data seeding (`npm run seed:demo`)
- 159 tests across 13 suites (Vitest)

### Fixed
- Module-level side effects guarded behind entry-point checks (migrate.ts, client.ts)
- Slots API response envelope unwrapping
- Admin UI TypeScript casts removed from template-literal JS
- Org repository `findById` and `verifyTenantOwnership` overrides
- Booking link generate flow and QR embedding
- Provider config hardening for mailbox and SMS
- Appointment overlap validation before admin save
- Apostrophe escape in time-block description preventing browser SyntaxError
- Same-origin API routing behind proxy for Ubuntu deployment

### Documentation
- Architecture reference (docs/ARCHITECTURE.md) — 9-layer breakdown, isolation, security, timezone policy
- Admin API reference with RBAC permission matrix (docs/ADMIN_API.md)
- Availability settings consolidated guide (docs/AVAILABILITY_SETTINGS.md)
- Ubuntu setup and service operations (docs/ADMIN_SETUP_UBUNTU.md)
- Deployment runbook (docs/DEPLOYMENT.md)
- Decision log: ADR-0001 (tenant isolation), ADR-0002 (async notifications)
- README rewritten for accuracy and onboarding
- Docs consolidated: 16 → 10 files, 1,464 lines of duplication removed
