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
import { authRouter } from './routes/auth.routes.js';
import { availabilityRouter } from './routes/availability.routes.js';
import { appointmentsRouter, confirmationRouter } from './routes/appointments.routes.js';
import { organizationsRouter } from './routes/organizations.routes.js';
import { userRouter } from './routes/users.routes.js';
import { startNotificationWorker } from './workers/NotificationWorker.js';

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
// API ROUTES
// ============================================================================

app.use('/api/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/appointments/confirm', confirmationRouter);
app.use('/api/organizations', organizationsRouter);
app.use('/api/organizations/:organizationId/availability', availabilityRouter);
app.use('/api/organizations/:organizationId/appointments', appointmentsRouter);

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

    // Start notification worker (optional — logs warning if SMTP not configured)
    startNotificationWorker();

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
