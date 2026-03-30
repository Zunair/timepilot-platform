# TimePilot Platform

Enterprise-grade, multi-tenant scheduling platform for secure, scalable appointment management across organizations and teams.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js + Express.js + TypeScript |
| **Database** | PostgreSQL 14+ (forward-only migrations) |
| **Queue** | Redis 7+ + Bull |
| **Frontend** | Vanilla JS SPA (`src/client.ts`) |
| **Auth** | OAuth 2.0 (Google, Apple, Microsoft) |
| **Security** | RBAC, tenant isolation, session management |
| **Testing** | Vitest (159 tests across 13 suites) |

## Current Status

**Phase 1 (MVP) — In Progress**

Completed: multi-tenant architecture, OAuth SSO (Google/Apple/Microsoft), session management, scheduling engine with timezone-safe slot generation, booking UI with calendar, availability & time-block management, async email/SMS notifications, admin dashboard, team management, and role-based access control.

See [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) for details and [docs/Phase.RoadMap.md](docs/Phase.RoadMap.md) for the full 12-phase roadmap.

## Quick Start

> **Prerequisites:** Node.js 18+, PostgreSQL 14+, Redis 7+, PowerShell 7+
>
> For Ubuntu service deployment, see [docs/ADMIN_SETUP_UBUNTU.md](docs/ADMIN_SETUP_UBUNTU.md).
> For full deployment bootstrap (SSH keys, clone workflow), see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

```powershell
# 1. Clone and install
git clone https://github.com/Zunair/timepilot-platform.git
cd timepilot-platform
npm install

# 2. Configure environment
Copy-Item .env.example .env
# Edit .env — at minimum set DATABASE_URL to match your local PostgreSQL credentials

# 3. Set up PostgreSQL
psql -U postgres -c "CREATE DATABASE timepilot;"
# If your PG user isn't 'postgres', update DATABASE_URL in .env to match

# 4. Start Redis (pick one)
redis-server                                  # Local install
# docker run -d -p 6379:6379 redis:7-alpine   # Docker alternative

# 5. Run migrations
npm run migrate

# 6. (Optional) Seed demo data
npm run seed:demo

# 7. Start servers (two terminals)
npm run dev          # Backend API  → http://localhost:3000
npm run dev:client   # Client SPA   → http://localhost:3001
```

After seeding, visit: `http://localhost:3001/?org=acme&user=<user-uuid>`
(Get the UUID with: `psql -d timepilot -c "SELECT id FROM users WHERE email='demo@acme.com';"`)

### Environment Variables

Create `.env` from `.env.example`. Required variables:

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/timepilot` | Adjust user/password to match your local PG |
| `DATABASE_SSL` | `false` | Set `true` for production |
| `REDIS_URL` | `redis://localhost:6379` | |
| `SESSION_SECRET` | *(random string)* | Change in production |
| `API_BASE_URL` | `http://localhost:3000` | |
| `CLIENT_BASE_URL` | `http://localhost:3001` | |

OAuth providers are optional for local dev. Each requires `*_CLIENT_ID`, `*_CLIENT_SECRET`, and `*_CALLBACK_URL`:
- **Google** — standard OAuth 2.0 credentials
- **Apple** — `APPLE_CLIENT_SECRET` must be an Apple-generated JWT for your Services ID
- **Microsoft** — `MICROSOFT_CLIENT_SECRET` must be the secret *value*, not the secret ID

### Verify Installation

```powershell
# Health check
Invoke-WebRequest http://localhost:3000/health | Select-Object -ExpandProperty Content
# → {"status":"ok","timestamp":"..."}

# Run tests (no server required — exits when done)
npx vitest run

# Type check
npm run type-check
```

## Development Commands

```powershell
npm run dev           # Backend API with hot reload
npm run dev:client    # Client SPA with hot reload
npm run build         # Build for production
npm start             # Start production build
npm run migrate       # Run database migrations
npm run seed:demo     # Seed demo org/user/availability data
npm run test          # Run tests (Vitest)
npm run test:coverage # Run tests with coverage
npm run lint          # Run linting
npm run type-check    # TypeScript type checking
```

## Project Structure

```
src/
├── server.ts          # Express app initialisation and route mounting
├── client.ts          # Booking SPA (vanilla JS, served on :3001)
├── config/            # Database and environment configuration
├── db/                # Forward-only SQL migrations
├── middleware/         # Tenant context, error handling
├── repositories/      # Data-access layer (tenant-scoped)
├── routes/            # Express route handlers
├── services/          # Business logic (scheduling, notifications, auth)
├── types/             # TypeScript domain types
├── utils/             # Shared helpers
├── workers/           # Bull queue workers (email, SMS)
└── tests/             # Vitest test suites

docs/
├── ARCHITECTURE.md           # System design
├── IMPLEMENTATION_STATUS.md  # Progress tracking
├── Phase.RoadMap.md          # 12-phase delivery roadmap
├── decision-log/             # Architecture decisions (ADRs)
└── todo/                     # Phase-level TODO tracking
```

## Architecture Highlights

**Multi-Tenant Isolation**
- All resources scoped by `organization_id`
- Server-side tenant context validation (never trusting client)
- Repository pattern enforces tenant checks; cross-tenant access blocked at data layer

**Database Tables**
`organizations` · `users` · `organization_members` (RBAC) · `availabilities` · `time_blocks` · `appointments` · `notifications` · `oauth_accounts` · `sessions`

**Security**
- Tenant context middleware
- Role-based access control (`requireRole` middleware)
- Environment-based configuration (no hardcoded secrets)
- OAuth 2.0 session management

**Timezone Handling**
- All timestamps stored in UTC (ISO 8601)
- Timezone context persisted for auditing
- Client-side conversion for display

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full architecture guide.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Cannot find module 'pg'` | `Remove-Item -Recurse -Force node_modules, package-lock.json; npm install` |
| PostgreSQL connection refused | Verify service running: `psql -U postgres -d timepilot -c "SELECT NOW();"` |
| Redis connection refused | Start Redis: `redis-server` or Docker: `docker run -d -p 6379:6379 redis:7-alpine` |
| Database does not exist | `psql -U postgres -c "CREATE DATABASE timepilot;"` then `npm run migrate` |
| npm `ETARGET` / `notarget` | `npm cache clean --force; Remove-Item -Recurse -Force node_modules, package-lock.json; npm install` |

## Contributing

### Workflow

1. Pick a TODO item from [docs/todo/TODO.Phase1.md](docs/todo/TODO.Phase1.md) and set it to **IN-PROGRESS**
2. Implement with tests, following [code guidelines](.claude/rules/code.instructions.md)
3. Run `npm run test` and `npm run type-check` — both must pass
4. Commit with a [conventional message](https://www.conventionalcommits.org/)
5. Mark the TODO item **COMPLETED**

### Quality Gate

```powershell
npm run type-check
npm run test
pwsh -NoProfile -File scripts/dev/run-quality-gate.ps1 -Label "local-check" -Type test -Command "pwsh -NoProfile -File scripts/dev/test-instructions.ps1"
pwsh -NoProfile -File scripts/dev/read-latest-log.ps1 -Tail 120
```

Logs are written to [logs/copilot/](logs/copilot).

### Onboarding Reading Order

1. This README
2. [docs/Phase.RoadMap.md](docs/Phase.RoadMap.md)
3. [docs/todo/TODO.Phase1.md](docs/todo/TODO.Phase1.md)
4. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
5. [DEVELOPMENT.md](DEVELOPMENT.md)

## Decision Records

Architecture decisions are tracked in [docs/decision-log/](docs/decision-log).
Template: [.github/instructions/adr-template.md](.github/instructions/adr-template.md)
