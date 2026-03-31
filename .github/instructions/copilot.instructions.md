# TimePilot Platform Copilot Instructions

## Product Mission
Build a beautiful, futuristic, intuitive, enterprise-grade multi-tenant calendar platform where clients can schedule appointments with users.

## Execution Policy
- Work in phased delivery and do not skip foundational controls.
- Treat this roadmap as anti-drift guidance for all coding tasks.
- If a request conflicts with security/compliance guardrails, preserve guardrails and provide the safest alternative.

## Current Delivery Status
- Current phase: Phase 1 (MVP)
- Last review date: 2026-03-30
- Approved by: Tech Lead
- Active blockers: None
- Current milestone: Phase 1 MVP — 91% complete (156/172 items)
- Completed milestones:
   - Foundational Architecture ✅
   - OAuth 2.0 integration (Google, Apple, Microsoft) ✅
   - Session management and authentication flows ✅
   - Scheduling engine (availability & appointment logic) ✅
   - Client booking UI (vanilla JS SPA) ✅
   - Async notification system (email/SMS via Bull queue) ✅
   - Admin dashboard, team management, RBAC ✅
   - Time-block (unavailability) management ✅
   - Booking links with QR codes ✅
   - Ubuntu deployment automation ✅
- Remaining priority items:
   - Dead-letter queue for failed notifications
   - End-to-end worker and booking flow tests
   - Google mailbox sending finalization
   - API and client-facing documentation

## TODO Management & Phase Tracking
**All work MUST follow this workflow to prevent drift and ensure accountability:**

1. **Before Starting Any Task:** Check `/docs/todo/TODO.Phase#.md` for the current phase and review all items' status
2. **New Feature Requests:** If a user/task suggests a new feature:
   - ADD the item to the appropriate TODO.Phase# file with state `NOT-STARTED`
   - DO NOT implement it until Tech Lead approval is recorded
3. **During Development:**
   - Update the relevant TODO item state: `IN-PROGRESS` when starting
   - Mark as `COMPLETED` only after verification checklist and docs updates
4. **End of Session:** Always update `Current Delivery Status` in this file
5. **Weekly Check-in:** Review the entire current phase TODO list with user to ensure alignment

**Acceptable States:** `NOT-STARTED`, `IN-PROGRESS`, `COMPLETED`, `BLOCKED`, `DEFERRED`

**Blocked Rules:** Any `BLOCKED` item must include blocker reason, owner, unblock plan, and next review date.

> **Critical Rule:** No work gets skipped. If a TODO cannot be done now, it stays on the list. Update the status and create a note explaining why.

## Phase Reference
See [/docs/Phase.RoadMap.md](/docs/Phase.RoadMap.md) for the complete 12-phase roadmap and feature breakdown.

Phase gates and completion criteria are defined in [/.github/instructions/phase-gates.md](/.github/instructions/phase-gates.md).
Verification checklists are defined in [/.github/instructions/verification.md](/.github/instructions/verification.md).
Approval and escalation policy is defined in [/.github/instructions/GOVERNANCE.md](/.github/instructions/GOVERNANCE.md).
Quality and test/log workflow is defined in [/.github/instructions/quality-and-logs.md](/.github/instructions/quality-and-logs.md).

Detailed task tracking for each phase is maintained in:
- `/docs/todo/TODO.Phase1.md` through `/docs/todo/TODO.Phase12.md`

## UI and UX Direction
- Use intentional, modern visual design with strong typography and clear hierarchy.
- Prioritize intuitive booking and settings flows on desktop and mobile.
- Keep accessibility and responsiveness as release requirements.

## Repository Workflow
- Commit in small, traceable changes with descriptive messages.
- `/cp` means commit and push.
- Do not rewrite shared history without explicit approval.
- Persist tests in the repository as part of the change; do not rely on ad hoc manual-only verification.
- Each implementation iteration must leave behind rerunnable tests or an updated automated verification path covering the changed behavior.
- Before `/cp`, rerun the stored verification commands for the current iteration and capture logs under `/logs/copilot/`.
- If behavior changes but no persistent test or rerunnable verification was added or updated, the item is not ready for `/cp`.
- If tests fail, do not run `/cp`; update TODO state and blocker details first.

## Local Environment Command Policy
- Default to Windows 11 as the primary local development environment.
- Prefer PowerShell-compatible commands in all generated instructions, scripts, and examples.
- Use PowerShell as the only documented shell for repository-local setup, verification, and developer workflow guidance.
- Do not default to bash-only commands such as `cp`, `rm -rf`, `export`, `grep`, or `ls` when documenting local setup for this repository.
- Prefer `Copy-Item` over `cp`, `Remove-Item -Recurse -Force` over `rm -rf`, `$env:NAME = 'value'` over `export NAME=value`, and `Get-ChildItem` over `ls` in repository documentation and guidance.
- Use Windows-compatible path examples where practical.
- If a tool or runtime command differs between shells, document the PowerShell form as the source of truth for this codebase.

> **Note:** Coding standards and engineering best practices are maintained in [/.claude/rules/code.instructions.md](/.claude/rules/code.instructions.md), which is automatically loaded when writing/modifying code.
> Additional rule sets: [/.claude/rules/documentation.instructions.md](/.claude/rules/documentation.instructions.md), [/.claude/rules/sql.instructions.md](/.claude/rules/sql.instructions.md), [/.claude/rules/scripts.instructions.md](/.claude/rules/scripts.instructions.md), [/.claude/rules/mobile.instructions.md](/.claude/rules/mobile.instructions.md).
> Architecture decisions should be tracked in `/docs/decision-log/` using [/.github/instructions/adr-template.md](/.github/instructions/adr-template.md).