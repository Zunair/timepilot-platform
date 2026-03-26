---
description: Standards for scripts, automation, and operational tooling
paths:
  - "scripts/**"
  - "**/*.sh"
  - "**/*.ps1"
---

# TimePilot Platform Script Instructions

## Safety
- Scripts must be idempotent where practical.
- Destructive actions require explicit confirmation flags.
- Avoid embedding secrets in script source.

## Reliability
- Fail fast on errors and return non-zero exit codes.
- Log key steps with concise actionable messages.
- Validate required inputs and environment variables before execution.

## Operability
- Provide usage examples for non-trivial scripts.
- Keep script behavior deterministic and reviewable.

## Quality Gate Support
- Use script-based test/log capture for repeatable validation.
- Prefer writing test/build output to `/logs/copilot/` for post-change review.
