import { describe, expect, it } from 'vitest';
import { validateTwilioConfig } from '../config/env.js';

describe('env validation', () => {
  it('accepts missing Twilio config so SMS can stay disabled', () => {
    expect(() => validateTwilioConfig({})).not.toThrow();
  });

  it('rejects placeholder Twilio values with a clear startup error', () => {
    expect(() => validateTwilioConfig({
      TWILIO_ACCOUNT_SID: 'your_twilio_account_sid',
      TWILIO_AUTH_TOKEN: 'your_twilio_auth_token',
      TWILIO_PHONE_NUMBER: '+1234567890',
    })).toThrow(/replace placeholder values/i);
  });

  it('rejects Twilio account sids that do not start with AC', () => {
    expect(() => validateTwilioConfig({
      TWILIO_ACCOUNT_SID: 'SK123456789',
      TWILIO_AUTH_TOKEN: 'secret-token',
      TWILIO_PHONE_NUMBER: '+15551234567',
    })).toThrow(/must start with AC/i);
  });
});