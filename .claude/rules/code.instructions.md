---
description: Coding guidelines and engineering standards for the TimePilot Platform
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# TimePilot Platform Code Instructions

## Mandatory Pre-Implementation Checks
- Confirm item exists in `/docs/todo/TODO.Phase#.md` and is approved.
- Run applicable verification checklist from `/.github/instructions/verification.md`.
- Confirm target phase gate criteria from `/.github/instructions/phase-gates.md`.

## Mandatory Post-Change Validation
- After each major change, run relevant tests and capture logs in `/logs/copilot/`.
- Review log output and summarize failures before continuing implementation.
- Only run `/cp` after tests pass and when explicitly requested.

## Commit Message Convention
Use **future tense** to describe what the commit adds or changes. Follow this format:

```
git commit -m "feature([section]): Adds [feature description]"
```

**CRITICAL:** Always use a single-line `git commit -m "..."` command. Never use multi-line commit messages in the terminal — PowerShell mishandles multi-line strings and the commit will hang or fail. Keep the subject line concise (under 120 chars). If more detail is needed, add it in the PR description, not the commit message.

**Examples:**
- `git commit -m "feature(auth): Adds OAuth 2.0 integration for Google Sign-In"`
- `git commit -m "feature(booking): Adds calendar UI with year, date, time selection"`
- `git commit -m "fix(notifications): Fixes email delivery retry logic with exponential backoff"`
- `git commit -m "refactor(db): Refactors tenant isolation queries for improved performance"`

**Commit Type Keywords:**
- `feature([section]):` - New functionality
- `fix([section]):` - Bug fix
- `refactor([section]):` - Code restructuring without behavior change
- `perf([section]):` - Performance improvement
- `test([section]):` - Test additions or improvements
- `docs([section]):` - Documentation updates

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

## Definition of Done
- Feature implemented with tests for critical paths.
- Security and authorization checks in place.
- UTC/timezone behavior validated.
- Docs updated for any new module/service/public API.
- No duplicate logic introduced.
- Applicable verification checklist items are satisfied.