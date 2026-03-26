# ADR-0002: Asynchronous Notification Delivery

## Status
- Accepted

## Date
- 2026-03-26

## Context
Appointment notifications must remain reliable and not block booking transactions.

## Decision
Use queue/worker-based asynchronous notification delivery with idempotency keys, retry with exponential backoff, and delivery status tracking.

## Rationale
Async delivery improves resilience and user experience while supporting recoverability for transient provider failures.

## Alternatives Considered
1. Synchronous notification send in request cycle
2. Best-effort async without retries
3. Fire-and-forget without delivery status

## Consequences
- Positive: reliability, observability, and safer scaling.
- Negative: additional operational components (queue/worker).
- Operational: requires worker health monitoring.

## Follow-Up Actions
- Validate queue retry policy in integration tests.
- Add delivery-status observability dashboards.
