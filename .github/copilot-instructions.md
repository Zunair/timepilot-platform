# TimePilot Platform Copilot Instructions

## Product Mission
Build a beautiful, futuristic, intuitive, enterprise-grade multi-tenant calendar platform where clients can schedule appointments with users.

## Execution Policy
- Work in phased delivery and do not skip foundational controls.
- Treat this roadmap as anti-drift guidance for all coding tasks.
- If a request conflicts with security/compliance guardrails, preserve guardrails and provide the safest alternative.

## Phase Roadmap
### Phase 1 (MVP)
- Multi-tenant architecture with strict tenant isolation.
- Multi-user org model with roles: Owner, Admin, Member, Viewer.
- Social login for user account access: Google, Apple, Microsoft (OAuth/OIDC).
- Scheduling engine with availability by hour, day, week, month.
- Client booking interface with date/month navigation and time-slot selection.
- Settings panel for schedule rules, timezone, branding/theme, and per-user logo.
- Notifications to all parties:
  - Confirmation via email and SMS (Twilio)
  - Cancellation via email and SMS (Twilio)
  - Reminder via email and SMS (Twilio)
- Backend timestamps stored in UTC only.
- UI renders times using user or client timezone from settings.

### Phase 2
- Contract management
- Contract editor
- Invoicing foundations
- Signature capture from phone for clients
- User signature setting for signing at any stage

### Phase 3
- OpenAI integration for contract writing/proofreading
- Human-in-the-loop approval for AI suggestions

### Phase 4
- Payments:
  - ACH (bank/routing)
  - PayPal
  - Stripe
  - Credit card
- Per-tenant payment settings and secure processing patterns

## Engineering Standards
- Use OOP-style service boundaries and clear domain modules.
- Use typed variables and explicit types whenever practical.
- Use descriptive variable, function, and class names.
- Never use single-letter variable names except conventional short loop indices in tightly scoped loops.
- Add descriptive comments for non-obvious logic only.

## Function and Method Traceability
- Before adding a new function or method, search for existing similar behavior to avoid duplication.
- Keep one canonical implementation per behavior and call shared utilities/services.
- Update module documentation when introducing new public methods.

## Security Non-Negotiables
- Enforce authorization on every resource by tenant and role.
- Apply least-privilege RBAC checks server-side.
- Keep immutable audit events for sensitive actions.
- Encrypt secrets and provider credentials; never hardcode keys.
- Add rate limits and abuse protections on auth, booking, and notification endpoints.
- Validate/sanitize all external input.

## Timezone and Date Policy
- Persist all event times in UTC in backend/storage.
- Persist timezone context where needed for user intent/auditing.
- Convert from UTC to viewer timezone only at presentation boundaries.
- Include DST boundary tests for scheduling and reminders.

## Notification Reliability
- Send notifications asynchronously via queue/worker model.
- Use idempotency keys and retries with exponential backoff.
- Record delivery status for observability and support.

## UI and UX Direction
- Use intentional, modern visual design with strong typography and clear hierarchy.
- Prioritize intuitive booking and settings flows on desktop and mobile.
- Keep accessibility and responsiveness as release requirements.

## Repository Workflow
- Commit in small, traceable changes with descriptive messages.
- `/cp` means commit and push.
- Do not rewrite shared history without explicit approval.

## Definition of Done
- Feature implemented with tests for critical paths.
- Security and authorization checks in place.
- UTC/timezone behavior validated.
- Docs updated for any new module/service/public API.
- No duplicate logic introduced.