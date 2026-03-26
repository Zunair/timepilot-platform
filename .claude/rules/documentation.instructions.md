---
description: Documentation standards for services, modules, and API changes in the TimePilot Platform
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "docs/**/*.md"
---

# TimePilot Platform Documentation Instructions

## Scope
Apply when creating or modifying modules, services, public APIs, workflows, or architecture decisions.

## Minimum Documentation Requirements
- New modules/services must include purpose, responsibilities, and dependencies.
- Public API changes must include request/response examples and error cases.
- Security-sensitive changes must document authorization assumptions.
- Timezone-sensitive changes must document UTC storage and local rendering behavior.

## Update Discipline
- Documentation updates are part of the same change set as code changes.
- Do not mark TODO items as `COMPLETED` unless required docs are updated.

## Preferred Locations
- Product and planning docs: `/docs`
- Instruction and governance docs: `/.github/instructions`
- Coding rules: `/.claude/rules`
