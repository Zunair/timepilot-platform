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

## Current Status (Phase 1 - MVP)

**Foundational Architecture: ✅ COMPLETED** (2026-03-26)

- Multi-tenant architecture with strict server-side tenant isolation
- PostgreSQL schema with 8 core tables and proper relationships
- Repository pattern with BaseRepository for common operations
- Tenant context middleware and role-based access control
- Express.js server with middleware stack
- Environment configuration management
- Database migration system (forward-only, auditable)
- Comprehensive type definitions (25+ domain types)

See [Architecture Documentation](docs/ARCHITECTURE.md) and [Implementation Status](docs/IMPLEMENTATION_STATUS.md) for details.

**Next Priority Items:**
1. OAuth 2.0 integration (Google, Apple, Microsoft)
2. Session management and authentication flows
3. Scheduling engine (availability & appointment logic)
4. Client booking UI (React components)
5. Async notification system (email/SMS)

## Getting Started

### Prerequisites

Before running the app locally, ensure you have installed:

- **Node.js 18+** ([Download](https://nodejs.org/))
- **PostgreSQL 14+** ([Download](https://www.postgresql.org/download/))
- **Redis 7+** ([Download](https://redis.io/download) or use [Docker](https://hub.docker.com/_/redis))
- **npm** (comes with Node.js)

**Verify installations:**
```powershell
node --version    # Should be v18.0.0 or higher
npm --version     # Should be v9.0.0 or higher
psql --version    # Should be 14 or higher
redis-cli --version  # Should be 7 or higher
```

### Quick Start (Local Development)

#### 1. Clone the Repository

```powershell
git clone https://github.com/timepilot/platform.git
cd timepilot-platform
```

#### 2. Install Dependencies

```powershell
npm install
```

#### 3. Set Up Environment Variables

```powershell
Copy-Item .env.example .env
```

Edit `.env` with your local environment configuration:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/timepilot
DATABASE_SSL=false

# Server Configuration
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:3000
CLIENT_BASE_URL=http://localhost:3001

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Session Configuration
SESSION_SECRET=your_local_dev_secret_key_change_in_production

# OAuth Providers (optional for local development)
# GOOGLE_CLIENT_ID=your_google_client_id
# GOOGLE_CLIENT_SECRET=your_google_client_secret
# ... (other OAuth credentials)
```

#### 4. Set Up PostgreSQL Database

```powershell
# Create the database
psql -U user -d postgres -c "CREATE DATABASE timepilot;"

# Verify the connection
psql -U user -d timepilot -c "SELECT NOW();"
```

If you're using a different PostgreSQL user or password, update the `DATABASE_URL` in your `.env` file accordingly.

#### 5. Set Up Redis

```powershell
# Option A: local Redis installation
redis-server

# Verify Redis is running
redis-cli ping  # Should return PONG
```

```powershell
# Option B: Docker Desktop
docker run -d -p 6379:6379 redis:7-alpine

# Verify Redis is running
redis-cli ping  # Should return PONG
```

#### 6. Run Database Migrations

```powershell
# This creates all necessary tables and schema
npm run migrate
```

You should see output like:
```
Running database migrations...
Applying migration: 001_initial_schema
Applying migration: 002_add_notifications
Database migrations completed.
```

If you see a PostgreSQL error about `gen_random_uuid()`, enable the extension once:

```powershell
psql -U user -d timepilot -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
```

#### 7. Start Development Servers

```powershell
# Backend API
npm run dev
```

```powershell
# Frontend placeholder client
npm run dev:client
```

You should see:
```
╔══════════════════════════════════════════════════════════════╗
║  TimePilot Platform - Multi-Tenant Calendar Booking MVP      ║
╚══════════════════════════════════════════════════════════════╝

Server started successfully!
  
  Environment: development
  Port: 3000
  API Base URL: http://localhost:3000
  Client Base URL: http://localhost:3001
  Database: localhost (timepilot)
  
Ready to accept connections...
```

✅ **Server is now running at `http://localhost:3000`**

And the client placeholder will be available at `http://localhost:3001`.

Important:
- `http://localhost:3000` is the backend API server and should respond now.
- `http://localhost:3001` now serves a minimal placeholder client for local development.
- This is not the full booking UI yet; it exists so the configured client URL responds during Phase 1 development.

### Testing the API

Test the health check endpoint:

```powershell
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2026-03-26T12:00:00.000Z"}
```

You can also verify the server from PowerShell with:

```powershell
Invoke-WebRequest http://localhost:3000/health | Select-Object -ExpandProperty Content
```

### Development Commands

Once the server is running, you can use these commands in another terminal:

```powershell
# Watch mode (hot reload on file changes)
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint

# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Start production build
npm start

# Run database migrations
npm run migrate
```

### Verification Before `/cp`

Before any `/cp` action, run verification locally and review the results:

```powershell
npm run type-check
npm run test
pwsh -NoProfile -File scripts/dev/run-quality-gate.ps1 -Label "local-check" -Type test -Command "pwsh -NoProfile -File scripts/dev/test-instructions.ps1"
pwsh -NoProfile -File scripts/dev/read-latest-log.ps1 -Tail 120
```

Do not `/cp` if tests or quality checks fail. Update the relevant TODO item state and fix the failures first.

### Troubleshooting Local Setup

#### Problem: "Cannot find module 'pg'"
```powershell
# Solution: Reinstall dependencies
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

#### Problem: "PostgreSQL connection refused"
```powershell
# Verify PostgreSQL is running
psql -U postgres -d timepilot -c "SELECT NOW();"

# If not running, start it from your installed PostgreSQL service or management tool.
```

#### Problem: "Redis connection refused"
```powershell
# Verify Redis is running
redis-cli ping

# If not:
# Start Redis using your local installation or Docker command above
redis-server
```

#### Problem: "Database timepilot does not exist"
```powershell
# Create the database
psql -U postgres -c "CREATE DATABASE timepilot;"

# Then run migrations
npm run migrate
```

#### Problem: "npm ERR! code ETARGETnpm error notarget"
```powershell
# Clear npm cache and reinstall
npm cache clean --force
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

#### Problem: "Cannot find module 'src\\db\\db.js'"
```powershell
# Cause: an outdated import path in the migration file
# Fix: pull the latest changes or update the import to ../config/db.js
npm run migrate
```

### Next Steps

Once the development server is running:

1. **Explore the Code**
   - Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system overview
   - Review [DEVELOPMENT.md](DEVELOPMENT.md) for development patterns

2. **View Database Schema**
   ```powershell
   psql -U postgres -d timepilot
   \dt  # List all tables
   \d organizations  # View table structure
   ```

3. **Check API Structure**
   - Available endpoints are defined in `src/server.ts`
   - Current implementation includes placeholder routes ready for feature development

4. **Start Development**
   - Pick a TODO item from `/docs/todo/TODO.Phase1.md`
   - Follow patterns in existing repositories
   - Run tests before committing

### Production Deployment

For production deployment, see deployment documentation (coming soon).

Server runs on `http://localhost:3000`

### Tech Stack
- **Backend:** Node.js + Express.js + TypeScript
- **Database:** PostgreSQL with forward-only migrations
- **Cache/Queue:** Redis + Bull
- **Frontend:** React + TypeScript (coming next)
- **Security:** OAuth 2.0, RBAC, tenant isolation

### Project Structure

```
src/
├── config/          # Database and environment configuration
├── middleware/      # Express middleware (tenant context, error handling)
├── repositories/    # Data access layer with tenant isolation
├── types/          # TypeScript domain types
├── db/             # Database migrations
└── server.ts       # Express app initialization

docs/
├── ARCHITECTURE.md           # System design documentation
├── IMPLEMENTATION_STATUS.md  # Progress tracking
├── Phase.RoadMap.md         # 12-phase delivery roadmap
└── decision-log/            # Architecture decisions (ADRs)
```

### Architecture Highlights

**Multi-Tenant Isolation:**
- All resources scoped by organization_id
- Server-side tenant context validation (never trusting client)
- Repository pattern enforces tenant checks
- Cross-tenant access blocked at data layer

**Database Design:**
- organizations (tenants)
- users (global user table)
- organization_members (RBAC: owner, admin, member, viewer)
- availabilities (scheduling with multiple granularities)
- appointments (client bookings)
- notifications (async delivery tracking)
- oauth_accounts (external auth providers)
- sessions (authenticated sessions)

**Security:**
- Tenant context middleware
- Role-based access control (requireRole middleware)
- Environment-based configuration (no hardcoded secrets)
- Input validation framework (ready to implement)
- Rate limiting hooks (ready to implement)

**Timezone Handling:**
- All timestamps stored in UTC (ISO 8601)
- Timezone context persisted separately for auditing
- Frontend conversion hooks (to be implemented)
- DST edge case tests (in TODO)

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for complete architecture guide.

### Development Commands

```powershell
npm run dev           # Start development server
npm run dev:client    # Start client placeholder server
npm run build         # Build for production
npm run start         # Start production server
npm run migrate       # Run database migrations
npm run test          # Run tests
npm run lint          # Run linting
npm run type-check    # Run TypeScript type checking
```

### Development Workflow

1. Check `/docs/todo/TODO.Phase1.md` for current tasks
2. Review [Code Guidelines](/.claude/rules/code.instructions.md)
3. Implement feature with tests
4. Run `npm run test` and `npm run type-check`
5. Commit with conventional message
6. Update TODO status

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed development guide.

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
