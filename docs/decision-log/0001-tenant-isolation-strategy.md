# ADR-0001: Tenant Isolation Strategy

## Status
- Accepted

## Date
- 2026-03-26

## Context
TimePilot requires strict multi-tenant isolation to support enterprise security and compliance expectations.

## Decision
Use server-side tenant scoping on all resource operations with explicit tenant ownership validation and negative-path tests.

## Rationale
Server-side enforcement reduces risk from client-side tampering and creates predictable, auditable access behavior.

## Alternatives Considered
1. Client-provided tenant scoping only
2. Soft partitioning without ownership validation
3. Dedicated database per tenant at MVP stage

## Consequences
- Positive: stronger isolation and security posture.
- Negative: more implementation overhead on repositories/services.
- Operational: requires checklist validation in reviews.

## Follow-Up Actions
- Add tenant isolation checks to verification workflow.
- Add cross-tenant negative tests to critical modules.
