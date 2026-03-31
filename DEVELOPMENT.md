# Development Guide

## Project Structure

```
timepilot-platform/
├── src/
│   ├── server.ts            # Express app initialisation and route mounting
│   ├── client.ts            # Booking SPA (vanilla JS, served on :3001)
│   ├── config/              # Configuration modules
│   │   ├── env.ts           # Environment variable loading
│   │   └── db.ts            # Database connection pool
│   ├── db/                  # Database
│   │   ├── migrate.ts       # Migration runner
│   │   └── rollback.ts      # Rollback helper
│   ├── middleware/           # Express middleware
│   │   ├── tenantContext.ts  # Tenant isolation and RBAC
│   │   └── errorHandler.ts  # Error handling and responses
│   ├── repositories/        # Data access layer (tenant-scoped)
│   │   ├── BaseRepository.ts
│   │   ├── OrganizationRepository.ts
│   │   ├── UserRepository.ts
│   │   ├── OrganizationMemberRepository.ts
│   │   ├── AvailabilityRepository.ts
│   │   ├── AppointmentRepository.ts
│   │   ├── NotificationRepository.ts
│   │   ├── OAuthAccountRepository.ts
│   │   ├── SessionRepository.ts
│   │   └── TimeBlockRepository.ts
│   ├── services/            # Business logic
│   │   ├── SchedulingService.ts
│   │   ├── AppointmentService.ts
│   │   ├── NotificationService.ts
│   │   ├── SessionService.ts
│   │   └── GoogleMailboxService.ts
│   ├── routes/              # API route handlers
│   │   ├── auth.routes.ts
│   │   ├── organizations.routes.ts
│   │   ├── users.routes.ts
│   │   ├── availability.routes.ts
│   │   ├── appointments.routes.ts
│   │   ├── booking-links.routes.ts
│   │   └── public-booking.routes.ts
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   ├── utils/               # Shared helpers (permissions, etc.)
│   ├── workers/             # Bull queue workers (email, SMS)
│   └── tests/               # Vitest test suites
├── docs/                    # Documentation
│   ├── ARCHITECTURE.md      # Architecture documentation
│   ├── Phase.RoadMap.md     # 12-phase roadmap
│   ├── decision-log/        # Architecture decisions (ADRs)
│   └── todo/                # Phase-level TODO tracking
├── scripts/                 # Dev and ops scripts
│   ├── dev/                 # Quality gates, seeding, log reading
│   └── ops/                 # Ubuntu service templates
├── .github/                 # GitHub configuration
│   └── instructions/        # Project governance and guidelines
├── .claude/                 # AI assistant customizations
│   └── rules/               # Code, SQL, documentation rules
├── logs/                    # Execution logs
│   └── copilot/             # AI assistant logs
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript configuration
├── .env.example             # Environment variables template
└── .gitignore               # Git ignore rules
```

## Development Workflow

### 1. Setting Up Your Environment

```powershell
# Create .env file with local development values
Copy-Item .env.example .env

# Install dependencies
npm install

# Run migrations (creates tables)
npm run migrate

# Start backend dev server
npm run dev

# Start client placeholder server
npm run dev:client
```

The backend should now be running at `http://localhost:3000` and the client placeholder at `http://localhost:3001`.

### 2. Database Migrations

Database changes are managed through the migration system in `src/db/migrate.ts`:

#### Creating a New Migration

1. Add a new migration function to `migrate.ts`:
```typescript
const migration003 = `
  -- Migration description
  CREATE TABLE new_table (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
  );
`;
```

2. Add to migrations array:
```typescript
{ name: '003_migration_name', sql: migration003 }
```

3. Run `npm run migrate` to apply

**Important:** Migrations are forward-only and cannot be undone. Plan carefully and test locally first.

### 3. Adding a New Repository

1. Create a new file in `src/repositories/`:
```typescript
import { BaseRepository } from './BaseRepository.js';
import { YourEntity, UUID, TenantContext } from '../types/index.js';

export class YourRepository extends BaseRepository<YourEntity> {
  protected tableName = 'your_table';
  protected columns = ['id', 'organization_id', 'created_at'];
  
  // Implement specific methods
}
```

2. All repositories must:
   - Extend BaseRepository for common operations
   - Validate tenant ownership on all operations
   - Filter by `organization_id` on queries
   - Throw on cross-tenant access attempts

### 4. Adding API Endpoints

Endpoints are structured in `src/server.ts` and organized by feature:

```typescript
app.post(
  '/api/organizations/:organizationId/feature',
  tenantContextMiddleware,      // Extract tenant context
  requireRole('owner', 'admin'), // Enforce RBAC
  (req, res) => {
    // Handler
  }
);
```

**Endpoint requirements:**
- All protected endpoints must have `tenantContextMiddleware`
- Admin endpoints must have `requireRole('owner', 'admin')`
- All responses should handle errors via errorHandler middleware
- All operations must validate tenant ownership

### 5. Writing Tests

Create tests in `tests/` directory:

```typescript
// tests/repositories/UserRepository.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { userRepository } from '../../src/repositories/UserRepository';

describe('UserRepository', () => {
  it('should create a user', async () => {
    const user = await userRepository.create({
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User'
    });
    
    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
  });
  
  it('should prevent duplicate emails', async () => {
    await expect(
      userRepository.create({ /* same email */ })
    ).rejects.toThrow();
  });
});
```

**Test checklist:**
- ✅ Happy path tests
- ✅ Error/validation tests
- ✅ Cross-tenant access prevention tests
- ✅ Authorization tests

### 6. Code Style and Standards

Follow the guidelines in [Code Instructions](/.claude/rules/code.instructions.md):

```typescript
// ✅ Good
class UserService {
  async getUserWithOrganizationContext(
    userId: UUID,
    organizationId: UUID
  ): Promise<User> {
    // Implementation
  }
}

// ❌ Avoid
class UserService {
  async getUser(u, o) {
    // Single-letter variable names
  }
}
```

Key principles:
- Use explicit types (avoid `any`)
- Use descriptive names
- Use OOP patterns
- Add comments for non-obvious logic
- One canonical implementation per behavior

### 7. Committing Changes

Use conventional commit format:

```powershell
# Example commits
git commit -m "feature(auth): Adds Google OAuth integration"
git commit -m "fix(booking): Fixes timezone conversion in appointment creation"
git commit -m "test(multi-tenant): Adds cross-tenant access prevention tests"
git commit -m "docs(architecture): Updates API documentation"
```

Commit types:
- `feature` - New functionality
- `fix` - Bug fix
- `refactor` - Code restructuring
- `perf` - Performance improvement
- `test` - Test additions
- `docs` - Documentation updates

### 8. Running Quality Checks

Before committing:

```powershell
# Type check
npm run type-check

# Lint
npm run lint

# Run tests
npm run test

# Build
npm run build

# Run repo quality gate
pwsh -NoProfile -File scripts/dev/run-quality-gate.ps1 -Label "local-check" -Type test -Command "pwsh -NoProfile -File scripts/dev/test-instructions.ps1"
```

All checks must pass before pushing.

## Common Tasks

### Adding a New Feature

1. Add TODO item to `/docs/todo/TODO.Phase#.md` if not already there
2. Create entity types in `src/types/index.ts`
3. Create database migration in `src/db/migrate.ts`
4. Create repository in `src/repositories/`
5. Create service in `src/services/` (business logic)
6. Create API routes in `src/routes/` or add to `src/server.ts`
7. Write tests in `tests/`
8. Update documentation
9. Update TODO item status to COMPLETED
10. Commit with conventional message

### Debugging

```powershell
# View database migrations applied
psql -U postgres -d timepilot -c "SELECT * FROM migrations;"

# Check logs
pwsh -NoProfile -File scripts/dev/read-latest-log.ps1 -Tail 120

# debug mode
$env:DEBUG='*'
npm run dev
```

### Performance Optimization

1. Create indexes for frequently queried columns
2. Use connection pooling (already configured)
3. Cache static data (e.g., org settings)
4. Batch operations where possible
5. Profile slow queries

## Architecture Decisions

Major decisions are documented in `docs/decision-log/`:

- [ADR-0001: Tenant Isolation Strategy](docs/decision-log/0001-tenant-isolation-strategy.md)
- [ADR-0002: Asynchronous Notification Delivery](docs/decision-log/0002-async-notification-delivery.md)

Before making significant architectural changes, consider documenting with an ADR.

## Troubleshooting

### Database Connection Issues
```powershell
# Check PostgreSQL is running
psql -U postgres -d timepilot -c "SELECT NOW();"

# Reset database (dev only!)
# DROP DATABASE timepilot;
# CREATE DATABASE timepilot;
# npm run migrate
```

### Migration Failures
```powershell
# Check applied migrations
psql -U postgres -d timepilot -c "SELECT * FROM migrations;"

# Reset migrations table (dev only!)
# DROP TABLE migrations;
# npm run migrate
```

### Port Already in Use
```powershell
# Find and stop the process using port 3000 on Windows
netstat -ano | findstr :3000
taskkill /PID [PID] /F
```

## Resources

- [Code Guidelines](/.claude/rules/code.instructions.md)
- [SQL Guidelines](/.claude/rules/sql.instructions.md)
- [Documentation Standards](/.claude/rules/documentation.instructions.md)
- [Architecture Guide](docs/ARCHITECTURE.md)
- [Verification Checklist](/.github/instructions/verification.md)

## Getting Help

1. Check the documentation in `/docs`
2. Review existing code patterns
3. Check TODO items and issue tracker
4. Review decision log for context
