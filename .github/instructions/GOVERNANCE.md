# TimePilot Platform Governance

## Purpose
Define who approves work, how blocked items are escalated, and how phase progress is managed.

## Approval Authority
- Single approver model is enforced.
- Required approver: Tech Lead.
- No new TODO item moves to implementation until Tech Lead approval is recorded.

## Approval Rules
- Any new feature request must first be added to `/docs/todo/TODO.Phase#.md` with `NOT-STARTED` state.
- Approval must be recorded as a checklist note directly under the item.
- Suggested approval note format:
  - `Approval: Tech Lead | Date: YYYY-MM-DD | Priority: High|Medium|Low`

## Blocked Item Escalation
- Any item set to `BLOCKED` must include:
  - blocker reason
  - owner
  - unblock plan
  - next review date
- Escalation window: 3 business days in `BLOCKED` state.
- Escalation target: Tech Lead.

## Deferred Item Rules
- Any item set to `DEFERRED` must include:
  - deferral reason
  - target phase
  - review date

## Current Phase Metadata
Canonical progress metadata is maintained in `.github/instructions/copilot.instructions.md` under `Current Delivery Status`.

Required fields:
- Current phase
- Last review date
- Approved by
- Active blockers
- Next priority items

## Weekly Cadence
- Weekly review owner: Tech Lead.
- Review outputs:
  - phase status update
  - blocker resolution plan
  - approved next-priority items
