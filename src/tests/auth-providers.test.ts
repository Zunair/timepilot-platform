import { describe, expect, it } from 'vitest';
import { buildGoogleOAuthAuthorizeUrl, getOAuthProviderAvailability, getEnabledOAuthProviders } from '../routes/auth.routes.js';

describe('oauth provider availability', () => {
  it('enables a provider only when id, secret, and callback are all present', () => {
    const availability = getOAuthProviderAvailability({
      GOOGLE_CLIENT_ID: 'gid',
      GOOGLE_CLIENT_SECRET: 'gsecret',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
      APPLE_CLIENT_ID: 'aid',
      APPLE_CLIENT_SECRET: '',
      APPLE_CALLBACK_URL: 'http://localhost:3000/api/auth/apple/callback',
      MICROSOFT_CLIENT_ID: 'mid',
      MICROSOFT_CLIENT_SECRET: 'msecret',
      MICROSOFT_CALLBACK_URL: undefined,
    });

    expect(availability.google).toBe(true);
    expect(availability.apple).toBe(false);
    expect(availability.microsoft).toBe(false);
  });

  it('treats whitespace-only values as missing', () => {
    const availability = getOAuthProviderAvailability({
      GOOGLE_CLIENT_ID: '   ',
      GOOGLE_CLIENT_SECRET: 'x',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
      APPLE_CLIENT_ID: undefined,
      APPLE_CLIENT_SECRET: undefined,
      APPLE_CALLBACK_URL: undefined,
      MICROSOFT_CLIENT_ID: undefined,
      MICROSOFT_CLIENT_SECRET: undefined,
      MICROSOFT_CALLBACK_URL: undefined,
    });

    expect(availability.google).toBe(false);
  });

  it('returns only enabled providers in stable order', () => {
    const enabled = getEnabledOAuthProviders({
      GOOGLE_CLIENT_ID: 'gid',
      GOOGLE_CLIENT_SECRET: 'gsecret',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
      APPLE_CLIENT_ID: 'aid',
      APPLE_CLIENT_SECRET: 'asecret',
      APPLE_CALLBACK_URL: 'http://localhost:3000/api/auth/apple/callback',
      MICROSOFT_CLIENT_ID: undefined,
      MICROSOFT_CLIENT_SECRET: undefined,
      MICROSOFT_CALLBACK_URL: undefined,
    });

    expect(enabled).toEqual(['google', 'apple']);
  });

  it('builds a Google OAuth authorize URL with state bound to org slug', () => {
    const url = buildGoogleOAuthAuthorizeUrl('acme', {
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
    });

    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
    expect(url).toContain('client_id=google-client-id');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fgoogle%2Fcallback');
    expect(url).toContain('state=acme');
  });

  it('throws when building Google authorize URL without required config', () => {
    expect(() => buildGoogleOAuthAuthorizeUrl('acme', {
      GOOGLE_CLIENT_ID: 'google-client-id',
      GOOGLE_CALLBACK_URL: undefined,
    })).toThrow('Google OAuth is not configured');
  });
});
