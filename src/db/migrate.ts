/**
 * Database Initialization and Migration Runner
 * 
 * Applies all pending migrations in order.
 * Migrations are forward-only to maintain auditability.
 * 
 * SQL Instructions Compliance:
 * - Migrations are forward-only (no destructive operations)
 * - Tenant identifiers are included in all business data tables
 * - Constraints prevent cross-tenant data access
 */

import { query as db, closePool } from '../config/db.js';
import { fileURLToPath } from 'node:url';

/**
 * Ensure migrations table exists
 */
async function ensureMigrationsTable(): Promise<void> {
  await db(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Apply all pending migrations
 */
export async function runMigrations(): Promise<void> {
  console.log('Running database migrations...');
  await ensureMigrationsTable();

  // Define all migrations in order
  const migrations = [
    { name: '001_initial_schema', sql: migration001 },
    { name: '002_add_notifications', sql: migration002 },
    { name: '003_oauth_token_lifecycle', sql: migration003 },
    { name: '004_nullable_session_org', sql: migration004 },
  ];

  for (const migration of migrations) {
    const result = await db(
      'SELECT name FROM migrations WHERE name = $1',
      [migration.name]
    );

    if (result.rowCount === 0) {
      console.log(`Applying migration: ${migration.name}`);
      await db(migration.sql);
      await db(
        'INSERT INTO migrations (name) VALUES ($1)',
        [migration.name]
      );
    }
  }

  console.log('Database migrations completed.');
}

async function main(): Promise<void> {
  try {
    await runMigrations();
  } finally {
    await closePool();
  }
}

// Only execute when this file is run directly (e.g. `node dist/db/migrate.js`).
// When imported by server.ts, runMigrations() is called explicitly without
// closing the shared pool.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

/**
 * Migration 001: Initial Schema
 * 
 * Creates core tables:
 * - organizations (tenants)
 * - users
 * - organization_members (RBAC)
 * - availabilities
 * - appointments
 */
const migration001 = `
  -- Organizations (Tenants)
  CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    logo_url VARCHAR(2048),
    primary_color VARCHAR(7),
    secondary_color VARCHAR(7),
    font_family VARCHAR(255),
    logo_uploaded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX idx_organizations_slug ON organizations (slug);

  -- Users
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    profile_image_url VARCHAR(2048),
    timezone VARCHAR(255) DEFAULT 'UTC' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX idx_users_email ON users (email);

  -- OAuth Accounts (external auth providers)
  CREATE TABLE IF NOT EXISTS oauth_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    provider_user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (provider, provider_user_id)
  );

  CREATE INDEX idx_oauth_accounts_user_id ON oauth_accounts (user_id);

  -- Organization Members (RBAC: Owner, Admin, Member, Viewer)
  CREATE TABLE IF NOT EXISTS organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE (organization_id, user_id)
  );

  CREATE INDEX idx_org_members_org_id ON organization_members (organization_id);
  CREATE INDEX idx_org_members_user_id ON organization_members (user_id);

  -- Sessions
  CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX idx_sessions_user_id ON sessions (user_id);
  CREATE INDEX idx_sessions_org_id ON sessions (organization_id);
  CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

  -- Availabilities (Hour, Day, Week, Month granularity)
  CREATE TABLE IF NOT EXISTS availabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('hour', 'day', 'week', 'month')),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    days_of_week INTEGER[] DEFAULT ARRAY[1,2,3,4,5],
    buffer_minutes INTEGER DEFAULT 0,
    timezone VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX idx_availabilities_org_id ON availabilities (organization_id);
  CREATE INDEX idx_availabilities_user_id ON availabilities (user_id);
  CREATE INDEX idx_availabilities_start_time ON availabilities (start_time);

  -- Appointments (Client bookings)
  CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    client_name VARCHAR(255) NOT NULL,
    client_email VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20),
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    timezone VARCHAR(255) NOT NULL,
    notes TEXT,
    confirmation_ref VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cancelled_at TIMESTAMP WITH TIME ZONE
  );

  CREATE INDEX idx_appointments_org_id ON appointments (organization_id);
  CREATE INDEX idx_appointments_user_id ON appointments (user_id);
  CREATE INDEX idx_appointments_start_time ON appointments (start_time);
  CREATE INDEX idx_appointments_status ON appointments (status);
  CREATE INDEX idx_appointments_confirmation_ref ON appointments (confirmation_ref);
`;

/**
 * Migration 002: Add Notifications Table
 * 
 * Creates notification tables for async notification delivery:
 * - notifications (email, SMS, delivery status)
 * - Includes idempotency key for deduplication
 * - Includes retry tracking and exponential backoff support
 */
const migration002 = `
  -- Notifications (Async queue-based delivery)
  CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    appointment_id UUID NOT NULL REFERENCES appointments (id) ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL CHECK (type IN ('booking_confirmation', 'booking_reminder', 'booking_cancellation')),
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('email', 'sms')),
    recipient VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered', 'bounced')),
    idempotency_key UUID NOT NULL UNIQUE,
    attempts INTEGER DEFAULT 0,
    next_retry_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX idx_notifications_org_id ON notifications (organization_id);
  CREATE INDEX idx_notifications_appointment_id ON notifications (appointment_id);
  CREATE INDEX idx_notifications_status ON notifications (status);
  CREATE INDEX idx_notifications_next_retry_at ON notifications (next_retry_at);
`;

/**
 * Migration 003: OAuth Token Lifecycle Support
 *
 * Adds token and expiry tracking so OAuth refresh/expiry handling
 * can be persisted and reused across sessions.
 */
const migration003 = `
  ALTER TABLE oauth_accounts
    ADD COLUMN IF NOT EXISTS access_token TEXT,
    ADD COLUMN IF NOT EXISTS refresh_token TEXT,
    ADD COLUMN IF NOT EXISTS token_type VARCHAR(100),
    ADD COLUMN IF NOT EXISTS scope TEXT,
    ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_oauth_accounts_user_provider
    ON oauth_accounts (user_id, provider);

  CREATE INDEX IF NOT EXISTS idx_oauth_accounts_expiry
    ON oauth_accounts (access_token_expires_at);
`;

/**
 * Migration 004: Allow org-less sessions during onboarding.
 *
 * Sessions may now exist without an active organization so newly signed-in
 * users can reach admin onboarding and create/select an organization.
 */
const migration004 = `
  ALTER TABLE sessions
    ALTER COLUMN organization_id DROP NOT NULL;
`;
