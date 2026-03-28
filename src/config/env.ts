/**
 * Environment Configuration Module
 * 
 * Loads and validates all environment variables.
 * Fails fast if required variables are missing.
 */

import dotenv from 'dotenv';

dotenv.config();

type EnvShape = Record<string, string | undefined>;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readOptionalEnv(rawEnv: EnvShape, key: string): string | undefined {
  const value = rawEnv[key];
  return hasText(value) ? value.trim() : undefined;
}

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
const missing = requiredEnvVars.filter((key) => !readOptionalEnv(process.env, key));
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export function validateTwilioConfig(rawEnv: EnvShape): void {
  const sid = readOptionalEnv(rawEnv, 'TWILIO_ACCOUNT_SID');
  const token = readOptionalEnv(rawEnv, 'TWILIO_AUTH_TOKEN');
  const phoneNumber = readOptionalEnv(rawEnv, 'TWILIO_PHONE_NUMBER');
  const hasAnyTwilioConfig = Boolean(sid || token || phoneNumber);

  if (!hasAnyTwilioConfig) return;

  const missingTwilioVars = [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
  ].filter((key) => !readOptionalEnv(rawEnv, key));

  if (missingTwilioVars.length > 0) {
    throw new Error(
      `Invalid Twilio configuration: ${missingTwilioVars.join(', ')} required when SMS notifications are enabled. Remove all TWILIO_* values to disable SMS notifications.`,
    );
  }

  const placeholderKeys = [
    ['TWILIO_ACCOUNT_SID', 'your_twilio_account_sid'],
    ['TWILIO_AUTH_TOKEN', 'your_twilio_auth_token'],
    ['TWILIO_PHONE_NUMBER', '+1234567890'],
  ].filter(([key, placeholder]) => readOptionalEnv(rawEnv, key) === placeholder)
    .map(([key]) => key);

  if (placeholderKeys.length > 0) {
    throw new Error(
      `Invalid Twilio configuration: replace placeholder values for ${placeholderKeys.join(', ')} or remove all TWILIO_* values to disable SMS notifications.`,
    );
  }

  if (!sid?.startsWith('AC')) {
    throw new Error(
      'Invalid Twilio configuration: TWILIO_ACCOUNT_SID must start with AC. Remove all TWILIO_* values to disable SMS notifications.',
    );
  }
}

if (readOptionalEnv(process.env, 'NODE_ENV') !== 'test') {
  validateTwilioConfig(process.env);
}

export const env = {
  NODE_ENV: (readOptionalEnv(process.env, 'NODE_ENV') || 'development') as 'development' | 'production' | 'test',
  PORT: parseInt(readOptionalEnv(process.env, 'PORT') || '3000', 10),
  DATABASE_URL: readOptionalEnv(process.env, 'DATABASE_URL')!,
  DATABASE_SSL: process.env.DATABASE_SSL === 'true',
  REDIS_URL: readOptionalEnv(process.env, 'REDIS_URL')!,
  API_BASE_URL: readOptionalEnv(process.env, 'API_BASE_URL')!,
  CLIENT_BASE_URL: readOptionalEnv(process.env, 'CLIENT_BASE_URL')!,
  SESSION_SECRET: readOptionalEnv(process.env, 'SESSION_SECRET')!,
  SESSION_MAX_AGE: parseInt(readOptionalEnv(process.env, 'SESSION_MAX_AGE') || '86400000', 10),
  LOG_LEVEL: (readOptionalEnv(process.env, 'LOG_LEVEL') || 'info') as 'debug' | 'info' | 'warn' | 'error',

  // OAuth Providers
  GOOGLE_CLIENT_ID: readOptionalEnv(process.env, 'GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: readOptionalEnv(process.env, 'GOOGLE_CLIENT_SECRET'),
  GOOGLE_CALLBACK_URL: readOptionalEnv(process.env, 'GOOGLE_CALLBACK_URL'),

  APPLE_CLIENT_ID: readOptionalEnv(process.env, 'APPLE_CLIENT_ID'),
  APPLE_CLIENT_SECRET: readOptionalEnv(process.env, 'APPLE_CLIENT_SECRET'),
  APPLE_CALLBACK_URL: readOptionalEnv(process.env, 'APPLE_CALLBACK_URL'),

  MICROSOFT_CLIENT_ID: readOptionalEnv(process.env, 'MICROSOFT_CLIENT_ID'),
  MICROSOFT_CLIENT_SECRET: readOptionalEnv(process.env, 'MICROSOFT_CLIENT_SECRET'),
  MICROSOFT_CALLBACK_URL: readOptionalEnv(process.env, 'MICROSOFT_CALLBACK_URL'),

  // Notifications — Email (SendGrid SMTP relay or any SMTP provider)
  SENDGRID_API_KEY:  readOptionalEnv(process.env, 'SENDGRID_API_KEY'),
  SMTP_HOST:         readOptionalEnv(process.env, 'SMTP_HOST'),
  SMTP_PORT:         parseInt(readOptionalEnv(process.env, 'SMTP_PORT') || '587', 10),
  SMTP_USER:         readOptionalEnv(process.env, 'SMTP_USER') ?? 'apikey',
  SMTP_PASS:         readOptionalEnv(process.env, 'SMTP_PASS'),
  SMTP_FROM:         readOptionalEnv(process.env, 'SMTP_FROM'),

  // Notifications — SMS (Twilio)
  TWILIO_ACCOUNT_SID:  readOptionalEnv(process.env, 'TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN:   readOptionalEnv(process.env, 'TWILIO_AUTH_TOKEN'),
  TWILIO_PHONE_NUMBER: readOptionalEnv(process.env, 'TWILIO_PHONE_NUMBER'),
};
