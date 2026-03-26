/**
 * Environment Configuration Module
 * 
 * Loads and validates all environment variables.
 * Fails fast if required variables are missing.
 */

import dotenv from 'dotenv';

dotenv.config();

// Required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'REDIS_URL',
  'SESSION_SECRET',
  'NODE_ENV',
  'PORT',
  'API_BASE_URL',
  'CLIENT_BASE_URL',
];

// Validate required vars
const missing = requiredEnvVars.filter((v) => !process.env[v]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const env = {
  NODE_ENV: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATABASE_URL: process.env.DATABASE_URL!,
  DATABASE_SSL: process.env.DATABASE_SSL === 'true',
  REDIS_URL: process.env.REDIS_URL!,
  API_BASE_URL: process.env.API_BASE_URL!,
  CLIENT_BASE_URL: process.env.CLIENT_BASE_URL!,
  SESSION_SECRET: process.env.SESSION_SECRET!,
  SESSION_MAX_AGE: parseInt(process.env.SESSION_MAX_AGE || '86400000', 10),
  LOG_LEVEL: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',

  // OAuth Providers
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL,

  APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
  APPLE_CLIENT_SECRET: process.env.APPLE_CLIENT_SECRET,
  APPLE_CALLBACK_URL: process.env.APPLE_CALLBACK_URL,

  MICROSOFT_CLIENT_ID: process.env.MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET: process.env.MICROSOFT_CLIENT_SECRET,
  MICROSOFT_CALLBACK_URL: process.env.MICROSOFT_CALLBACK_URL,

  // Notifications
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
};
