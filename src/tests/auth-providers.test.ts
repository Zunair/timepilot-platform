import { describe, expect, it } from 'vitest';
import {
  buildAppleOAuthAuthorizeUrl,
  buildGoogleOAuthAuthorizeUrl,
  buildMicrosoftOAuthAuthorizeUrl,
  hasFreshAccessToken,
  getOrganizationSlugFromOAuthRequest,
  getOAuthProviderAvailability,
  getEnabledOAuthProviders,
  parseOAuthProvider,
  parseQueryString,
  parseRequestParam,
  parseAppleIdentityPayload,
} from '../routes/auth.routes.js';

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

  it('builds a Microsoft OAuth authorize URL with org slug state', () => {
    const url = buildMicrosoftOAuthAuthorizeUrl('acme', {
      MICROSOFT_CLIENT_ID: 'ms-client-id',
      MICROSOFT_CALLBACK_URL: 'http://localhost:3000/api/auth/microsoft/callback',
    });

    expect(url).toContain('https://login.microsoftonline.com/common/oauth2/v2.0/authorize?');
    expect(url).toContain('client_id=ms-client-id');
    expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fauth%2Fmicrosoft%2Fcallback');
    expect(url).toContain('state=acme');
  });

  it('builds an Apple authorize URL with form_post mode', () => {
    const url = buildAppleOAuthAuthorizeUrl('acme', {
      APPLE_CLIENT_ID: 'apple.client.id',
      APPLE_CALLBACK_URL: 'http://localhost:3000/api/auth/apple/callback',
    });

    expect(url).toContain('https://appleid.apple.com/auth/authorize?');
    expect(url).toContain('client_id=apple.client.id');
    expect(url).toContain('response_mode=form_post');
    expect(url).toContain('state=acme');
  });

  it('parses Apple user payload into email and name fields', () => {
    const parsed = parseAppleIdentityPayload(JSON.stringify({
      email: 'person@example.com',
      name: {
        firstName: 'Jane',
        lastName: 'Doe',
      },
    }));

    expect(parsed).toEqual({
      email: 'person@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    });
  });

  it('returns empty values for invalid Apple user payload', () => {
    expect(parseAppleIdentityPayload('not-json')).toEqual({});
    expect(parseAppleIdentityPayload('   ')).toEqual({});
    expect(parseAppleIdentityPayload(undefined)).toEqual({});
  });
});

describe('oauth callback request parsing', () => {
  it('reads values from query and trims whitespace', () => {
    expect(parseQueryString('  acme  ')).toBe('acme');
    expect(parseQueryString('   ')).toBeUndefined();
    expect(parseQueryString(undefined)).toBeUndefined();
  });

  it('prefers query value over body value for the same key', () => {
    const req = {
      query: { code: 'query-code' },
      body: { code: 'body-code' },
    } as any;

    expect(parseRequestParam(req, 'code')).toBe('query-code');
  });

  it('falls back to body value when query value is absent', () => {
    const req = {
      query: {},
      body: { code: 'body-code' },
    } as any;

    expect(parseRequestParam(req, 'code')).toBe('body-code');
  });

  it('resolves organization slug from org first, then from state', () => {
    const reqWithOrg = {
      query: { org: 'acme', state: 'ignored-state' },
      body: {},
    } as any;

    const reqWithStateOnly = {
      query: { state: 'acme-from-state' },
      body: {},
    } as any;

    expect(getOrganizationSlugFromOAuthRequest(reqWithOrg)).toBe('acme');
    expect(getOrganizationSlugFromOAuthRequest(reqWithStateOnly)).toBe('acme-from-state');
  });

  it('supports Apple form_post payload where org/state/code are in body', () => {
    const req = {
      query: {},
      body: {
        state: 'acme',
        code: 'apple-code',
        user: '{"email":"person@example.com"}',
      },
    } as any;

    expect(getOrganizationSlugFromOAuthRequest(req)).toBe('acme');
    expect(parseRequestParam(req, 'code')).toBe('apple-code');
    expect(parseRequestParam(req, 'user')).toBe('{"email":"person@example.com"}');
  });

  it('parses only supported OAuth provider path values', () => {
    expect(parseOAuthProvider('google')).toBe('google');
    expect(parseOAuthProvider('apple')).toBe('apple');
    expect(parseOAuthProvider('microsoft')).toBe('microsoft');
    expect(parseOAuthProvider('github')).toBeNull();
  });

  it('treats access token expiry as fresh only when outside safety skew window', () => {
    expect(hasFreshAccessToken(new Date(Date.now() + 2 * 60 * 1000).toISOString())).toBe(true);
    expect(hasFreshAccessToken(new Date(Date.now() + 10 * 1000).toISOString())).toBe(false);
    expect(hasFreshAccessToken(undefined)).toBe(false);
    expect(hasFreshAccessToken('not-a-date')).toBe(false);
  });
});
