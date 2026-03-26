---
description: SQL and migration standards for tenant-safe, auditable data changes
paths:
  - "**/*.sql"
  - "migrations/**"
---

# TimePilot Platform SQL Instructions

## Tenant Safety
- Tables that store tenant-scoped business data should include tenant/org identifier.
- Data access patterns must preserve tenant isolation.
- Migration changes must not weaken existing tenant constraints.

## Migration Rules
- Migrations must be forward-only and reviewable.
- Include rollback strategy notes where feasible.
- Schema changes for critical entities require validation queries.

## Security & Audit
- Never store secrets in plaintext.
- Sensitive events and state transitions should support auditability.
- Changes affecting auth/payments require explicit review notes.
