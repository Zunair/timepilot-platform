# TimePilot Platform Phase Gates

## Purpose
Define objective completion criteria required before moving to the next phase.

## Gate Model
- Hybrid gate model is enforced.
- Hard gates (must pass): security, compliance, tenant isolation, critical reliability.
- Scorecard gates (target >= 80%): UX, documentation depth, operational polish.

## Phase 1 Gate (MVP)

### Hard Gates
- All approved Phase 1 items are `COMPLETED` or explicitly `DEFERRED` with rationale.
- Tenant isolation checks pass (see `/.github/instructions/verification.md`).
- RBAC checks are enforced on all protected resource operations.
- OAuth login providers (Google/Apple/Microsoft) pass integration tests.
- UTC persistence and timezone rendering checks pass.
- Notification flow (confirm/cancel/reminder) is asynchronous with retry and delivery status.
- No unresolved critical security findings.

### Scorecard Gates (>= 80%)
- Booking UX clarity and mobile responsiveness.
- Settings UX completeness.
- Documentation completeness for new modules/services.
- Observability and operational readiness.

## Phase 2+ Gate Template
Each phase is complete when:
1. Approved TODO scope is complete or explicitly deferred.
2. Security and compliance checks for that phase pass.
3. Critical path tests pass (unit + integration + e2e as applicable).
4. Required documentation updates are complete.
5. No open blocker without owner and escalation plan.
