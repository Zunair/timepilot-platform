/**
 * Main Application Server
 * 
 * Initializes Express application with middleware, routes, and error handling.
 * Manages database migrations and connection pooling.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { errorHandler } from './middleware/errorHandler.js';
import { tenantContextMiddleware, requireRole } from './middleware/tenantContext.js';
import { RoleType } from './types/index.js';

const app = express();

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// HTTP security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: env.CLIENT_BASE_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ============================================================================
// REQUEST PARSING
// ============================================================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// HEALTH CHECK
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================================
// PLACEHOLDER ROUTES (to be implemented)
// ============================================================================

// Authentication routes (OAuth, session management)
app.post('/api/auth/login', (req, res) => {
  res.json({ message: 'Auth endpoint - to be implemented' });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ message: 'Logout endpoint - to be implemented' });
});

// Organization routes
app.get('/api/organizations/:organizationId', tenantContextMiddleware, (req, res) => {
  res.json({ message: 'Get organization endpoint - to be implemented' });
});

// Availability routes
app.post('/api/organizations/:organizationId/availabilities',
  tenantContextMiddleware,
  requireRole(RoleType.OWNER, RoleType.ADMIN),
  (req, res) => {
    res.json({ message: 'Create availability endpoint - to be implemented' });
  }
);

// Appointment routes
app.post('/api/organizations/:organizationId/appointments', (req, res) => {
  res.json({ message: 'Create appointment (public booking) - to be implemented' });
});

app.get('/api/organizations/:organizationId/appointments',
  tenantContextMiddleware,
  (req, res) => {
    res.json({ message: 'List appointments - to be implemented' });
  }
);

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Endpoint ${req.method} ${req.path} not found`,
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function startServer(): Promise<void> {
  try {
    // Run database migrations
    await runMigrations();

    // Start HTTP server
    app.listen(env.PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║  TimePilot Platform - Multi-Tenant Calendar Booking MVP      ║
╚══════════════════════════════════════════════════════════════╝

Server started successfully!
  
  Environment: ${env.NODE_ENV}
  Port: ${env.PORT}
  API Base URL: ${env.API_BASE_URL}
  Client Base URL: ${env.CLIENT_BASE_URL}
  Database: ${env.DATABASE_URL.split('@')[1]}
  
Ready to accept connections...
      `);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();

export default app;
