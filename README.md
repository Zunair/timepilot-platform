# TimePilot Platform

TimePilot is an enterprise-grade, multi-tenant scheduling platform designed for secure, scalable appointment management across organizations and teams.

## Mission
Build a beautiful, futuristic, intuitive, enterprise-grade multi-tenant calendar platform where clients can schedule appointments with users.

## Full Product Goal
TimePilot is planned as a 12-phase platform that expands from MVP booking foundations to full enterprise operations, integrations, mobile apps, and predictive intelligence.

### Platform Scope by Phase
- Phase 1: Multi-tenant scheduling MVP with OAuth, booking UX, timezone-safe behavior, and async notifications.
- Phase 2: Contract management, signatures, and invoicing foundations.
- Phase 3: AI-assisted contract writing/proofreading with human approval.
- Phase 4: Payment processing (ACH, PayPal, Stripe, credit card).
- Phase 5: Advanced security and compliance (2FA, SSO, GDPR, audit).
- Phase 6: Analytics and reporting dashboards.
- Phase 7: Public API and third-party integrations.
- Phase 8: Team collaboration and CRM features.
- Phase 9: Advanced workflows, automation, and dynamic pricing.
- Phase 10: Enterprise admin and operational controls.
- Phase 11: Native mobile apps.
- Phase 12: AI and predictive capabilities.

For detailed roadmap content, see [docs/Phase.RoadMap.md](docs/Phase.RoadMap.md).

## Core Engineering Principles
- Multi-tenant security first
- UTC in backend, timezone-aware UI rendering
- Typed, maintainable OOP architecture
- Reliable asynchronous notification delivery
- Enterprise auditability and compliance readiness
- Anti-drift execution with phase TODOs, gates, and verification checklists

## Project Governance Model
- Delivery is phase-based and anti-drift.
- All work must map to approved TODO items before implementation.
- Phase completion requires gate checks and verification.
- Major decisions are documented through ADRs.

Key governance docs:
- [/.github/instructions/copilot.instructions.md](.github/instructions/copilot.instructions.md)
- [/.github/instructions/GOVERNANCE.md](.github/instructions/GOVERNANCE.md)
- [/.github/instructions/phase-gates.md](.github/instructions/phase-gates.md)
- [/.github/instructions/verification.md](.github/instructions/verification.md)
- [/.github/instructions/quality-and-logs.md](.github/instructions/quality-and-logs.md)

## Getting Started

### Current Repository State
This repository is currently in a governance-first bootstrap stage.
It includes roadmap, TODO tracking, quality-gate scripts, and instruction standards.
Application runtime services are planned and tracked by phase, but not fully scaffolded yet.

### Requirements
- OS:
	- Windows 11 (primary current setup)
	- Linux/macOS (supported for most markdown/script workflows with equivalent shell commands)
- Git 2.40+
- PowerShell 7+
- VS Code (recommended)

### Initial Setup
1. Clone repository
2. Open workspace in VS Code
3. Review project docs in this order:
	 - [README.md](README.md)
	 - [docs/Phase.RoadMap.md](docs/Phase.RoadMap.md)
	 - [docs/todo/TODO.Phase1.md](docs/todo/TODO.Phase1.md)
	 - [/.github/instructions/copilot.instructions.md](.github/instructions/copilot.instructions.md)

### Start Quality Workflow
Run instruction and TODO validation using:

```powershell
pwsh -NoProfile -File scripts/dev/run-quality-gate.ps1 -Label "local-check" -Type test -Command "pwsh -NoProfile -File scripts/dev/test-instructions.ps1"
```

Read latest log output using:

```powershell
pwsh -NoProfile -File scripts/dev/read-latest-log.ps1 -Tail 120
```

Logs are written to:
- [logs/copilot](logs/copilot)

## Development Workflow
1. Select current phase TODO file under [docs/todo](docs/todo)
2. Move item state to IN-PROGRESS before work starts
3. Implement approved changes
4. Run quality/test checks and review logs
5. Mark item COMPLETED only after verification + docs updates
6. Commit and push only after tests pass

## Contributor Onboarding Checklist
- Read [README.md](README.md), [docs/Phase.RoadMap.md](docs/Phase.RoadMap.md), and [docs/todo/TODO.Phase1.md](docs/todo/TODO.Phase1.md)
- Review governance and execution rules in [/.github/instructions/copilot.instructions.md](.github/instructions/copilot.instructions.md)
- Confirm phase gates in [/.github/instructions/phase-gates.md](.github/instructions/phase-gates.md)
- Confirm verification checklist in [/.github/instructions/verification.md](.github/instructions/verification.md)
- Run local quality gate before starting implementation
- Pick only approved TODO items and set them to IN-PROGRESS
- Keep logs under [logs/copilot](logs/copilot)

## Future Runtime Startup (When App Scaffolding Exists)
The repository is currently governance-first. When runtime services are scaffolded, use this startup model:

### Planned Runtime Requirements
- Node.js LTS (recommended for TypeScript services)
- Package manager: npm or pnpm
- Optional: Docker Desktop for local infrastructure

### Planned Startup Flow
1. Install dependencies in the app workspace
2. Configure environment variables from .env.example
3. Run database migrations
4. Start API service
5. Start web client
6. Run tests and verify logs before pushing

### Planned Example Commands
```powershell
# placeholder commands - enable after app scaffolding exists
npm install
npm run migrate
npm run dev
npm test
```

### Notes
- Do not treat the placeholder commands above as active until runtime packages and scripts are added.
- Keep startup instructions updated in the same change set that introduces runtime scaffolding.

## Decision Records
Architecture decisions are tracked in:
- [docs/decision-log](docs/decision-log)

Use template:
- [/.github/instructions/adr-template.md](.github/instructions/adr-template.md)
