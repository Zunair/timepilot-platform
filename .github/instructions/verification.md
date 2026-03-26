# TimePilot Platform Verification Checklists

## Purpose
Provide mandatory verification checklists for implementation and review.

## Multi-Tenant Isolation Checklist
- Every resource query is scoped by tenant/org identifier.
- Every create/update/delete operation validates tenant ownership.
- Cross-tenant data reads are denied by default.
- Tenant context is resolved server-side and not trusted from client input alone.
- Tests include at least one negative cross-tenant access case.

## Security Checklist
- Authorization checks exist for all protected endpoints/actions.
- Role checks follow least-privilege principles.
- No hardcoded secrets or provider credentials.
- Sensitive events are written to audit logs.
- Input is validated and sanitized.
- Auth, booking, and notification endpoints are rate-limited.

## Timezone & Date Checklist
- Event timestamps persist in UTC.
- User/client timezone context is persisted where needed.
- Time conversion to local timezone occurs only at presentation boundaries.
- DST edge-case tests exist for scheduling/reminders.

## Notification Reliability Checklist
- Notification dispatch is asynchronous.
- Idempotency keys prevent duplicate sends.
- Retries use exponential backoff.
- Delivery status is recorded and queryable.

## Testing Baseline
- Unit tests cover core domain logic.
- Integration tests cover cross-module workflows.
- E2E tests cover critical booking lifecycle paths.
- Security-sensitive workflows include negative-path tests.
- Tests and verification scripts are stored in the repository so they can be rerun in every iteration.
- Each changed behavior has a persistent automated test or a documented rerunnable verification command before `/cp`.

## Definition of Done Check
An item is not `COMPLETED` until all applicable checklist sections above are satisfied.
An item is not ready for `/cp` unless the stored tests or verification commands for that iteration have been rerun successfully.
