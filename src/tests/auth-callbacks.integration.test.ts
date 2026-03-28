import http from 'node:http';
import express from 'express';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/api/auth/google/callback',
    APPLE_CLIENT_ID: 'apple-client-id',
    APPLE_CLIENT_SECRET: 'apple-client-secret',
    APPLE_CALLBACK_URL: 'http://localhost:3000/api/auth/apple/callback',
    MICROSOFT_CLIENT_ID: 'microsoft-client-id',
    MICROSOFT_CLIENT_SECRET: 'microsoft-client-secret',
    MICROSOFT_CALLBACK_URL: 'http://localhost:3000/api/auth/microsoft/callback',
  },
}));

vi.mock('../services/SessionService.js', () => ({
  sessionService: {
    parseSessionId: vi.fn(),
    validate: vi.fn(),
    revoke: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('../repositories/UserRepository.js', () => ({
  userRepository: {
    findByEmail: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('../repositories/OrganizationRepository.js', () => ({
  organizationRepository: {
    findBySlug: vi.fn(),
  },
}));

vi.mock('../repositories/OrganizationMemberRepository.js', () => ({
  organizationMemberRepository: {
    findByUserAndOrganization: vi.fn(),
  },
}));

vi.mock('../repositories/OAuthAccountRepository.js', () => ({
  oauthAccountRepository: {
    findByUserAndProvider: vi.fn(),
    upsert: vi.fn(),
  },
}));

import { authRouter } from '../routes/auth.routes.js';
import { sessionService } from '../services/SessionService.js';
import { userRepository } from '../repositories/UserRepository.js';
import { organizationRepository } from '../repositories/OrganizationRepository.js';
import { organizationMemberRepository } from '../repositories/OrganizationMemberRepository.js';
import { oauthAccountRepository } from '../repositories/OAuthAccountRepository.js';

const MOCK_ORG = { id: 'org-1', slug: 'acme' };
const MOCK_USER = {
  id: 'user-1',
  email: 'person@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  timezone: 'UTC',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

let server: http.Server;
let baseUrl = '';

type TestResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
  json: () => any;
};

async function request(
  path: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<TestResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(baseUrl + path);
    const req = http.request({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port,
      path: `${url.pathname}${url.search}`,
      method: init?.method || 'GET',
      headers: init?.headers,
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          text,
          json: () => JSON.parse(text),
        });
      });
    });

    req.on('error', reject);

    if (init?.body) {
      req.write(init.body);
    }

    req.end();
  });
}

describe('auth callback integration (router-level)', () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/api/auth', authRouter);

    server = app.listen(0);

    await new Promise<void>((resolve) => {
      server.on('listening', () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind test server');
    }

    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());

    vi.mocked(sessionService.parseSessionId).mockReturnValue('session-1');
    vi.mocked(sessionService.validate).mockResolvedValue({
      sessionId: 'session-1',
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'MEMBER',
    } as any);

    vi.mocked(organizationRepository.findBySlug).mockResolvedValue(MOCK_ORG as any);
    vi.mocked(organizationMemberRepository.findByUserAndOrganization).mockResolvedValue({ role: 'MEMBER' } as any);
    vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue(null);
    vi.mocked(oauthAccountRepository.upsert).mockResolvedValue({ id: 'oauth-1' } as any);
    vi.mocked(sessionService.create).mockResolvedValue({
      session: { id: 'session-1' },
      cookie: 'session_id=session-1; HttpOnly; SameSite=Strict; Path=/',
    } as any);
  });

  it('redirects to Google authorize endpoint when callback has no code', async () => {
    const res = await request('/api/auth/google/callback?org=acme', { method: 'GET' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('https://accounts.google.com/o/oauth2/v2/auth?');
    expect(res.headers.location).toContain('state=acme');
  });

  it('creates a session after successful Google token/profile exchange', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(userRepository.create).mockResolvedValue(MOCK_USER as any);

    vi.mocked(global.fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'token-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        email: 'person@example.com',
        given_name: 'Jane',
        family_name: 'Doe',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));

    const res = await request('/api/auth/google/callback?org=acme&code=google-code', {
      method: 'GET',
    });

    expect(res.status).toBe(200);
    expect(res.json()).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'MEMBER',
    });
    expect(String(res.headers['set-cookie'])).toContain('session_id=session-1');

    expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'person@example.com',
      firstName: 'Jane',
      lastName: 'Doe',
    }));
    expect(oauthAccountRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      provider: 'google',
      accessToken: 'token-123',
    }));
  });

  it('returns 502 with provider error when Microsoft token exchange fails', async () => {
    vi.mocked(global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({
        error: 'invalid_client',
        error_description: 'AADSTS7000215: Invalid client secret provided.',
      }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await request('/api/auth/microsoft/callback?org=acme&code=bad-code', {
      method: 'GET',
    });

    expect(res.status).toBe(502);
    expect(res.json()).toEqual({
      error: 'OAUTH_TOKEN_EXCHANGE_FAILED',
      message: 'AADSTS7000215: Invalid client secret provided.',
    });
  });

  it('supports Apple form_post callback and uses body state/user payload values', async () => {
    vi.mocked(userRepository.findByEmail).mockResolvedValue(null);
    vi.mocked(userRepository.create).mockResolvedValue({
      ...MOCK_USER,
      email: 'apple.person@example.com',
      firstName: 'Apple',
      lastName: 'Person',
    } as any);

    const claims = Buffer.from(JSON.stringify({
      email: 'apple.person@example.com',
    })).toString('base64url');

    vi.mocked(global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ id_token: `header.${claims}.signature` }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const form = new URLSearchParams({
      state: 'acme',
      code: 'apple-code',
      user: JSON.stringify({ name: { firstName: 'Apple', lastName: 'Person' } }),
    });

    const res = await request('/api/auth/apple/callback', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    expect(res.status).toBe(200);
    expect(res.json()).toEqual({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'MEMBER',
    });
    expect(oauthAccountRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      provider: 'apple',
    }));
    expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      email: 'apple.person@example.com',
      firstName: 'Apple',
      lastName: 'Person',
    }));
  });

  it('returns existing token without provider refresh when token is still fresh', async () => {
    vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue({
      id: 'oauth-1',
      userId: 'user-1',
      provider: 'google',
      providerUserId: 'google-sub-1',
      accessToken: 'still-fresh-token',
      refreshToken: 'refresh-token',
      accessTokenExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    const res = await request('/api/auth/providers/google/refresh', {
      method: 'POST',
      headers: { cookie: 'session_id=session-1' },
    });

    expect(res.status).toBe(200);
    expect(res.json()).toEqual({
      provider: 'google',
      accessToken: 'still-fresh-token',
      expiresAt: expect.any(String),
      refreshed: false,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('refreshes expired token and persists rotated values', async () => {
    vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue({
      id: 'oauth-1',
      userId: 'user-1',
      provider: 'google',
      providerUserId: 'google-sub-1',
      accessToken: 'expired-token',
      refreshToken: 'old-refresh-token',
      accessTokenExpiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
    vi.mocked(oauthAccountRepository.upsert).mockResolvedValue({
      id: 'oauth-1',
      userId: 'user-1',
      provider: 'google',
      providerUserId: 'google-sub-1',
      accessToken: 'new-token',
      refreshToken: 'new-refresh-token',
      accessTokenExpiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);
    vi.mocked(global.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({
        access_token: 'new-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const res = await request('/api/auth/providers/google/refresh', {
      method: 'POST',
      headers: { cookie: 'session_id=session-1' },
    });

    expect(res.status).toBe(200);
    expect(res.json()).toEqual({
      provider: 'google',
      accessToken: 'new-token',
      expiresAt: expect.any(String),
      refreshed: true,
    });
    expect(oauthAccountRepository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      provider: 'google',
      providerUserId: 'google-sub-1',
      accessToken: 'new-token',
      refreshToken: 'new-refresh-token',
    }));
  });

  it('returns 409 when account has no refresh token', async () => {
    vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue({
      id: 'oauth-1',
      userId: 'user-1',
      provider: 'google',
      providerUserId: 'google-sub-1',
      accessToken: undefined,
      refreshToken: undefined,
      accessTokenExpiresAt: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    const res = await request('/api/auth/providers/google/refresh', {
      method: 'POST',
      headers: { cookie: 'session_id=session-1' },
    });

    expect(res.status).toBe(409);
    expect(res.json()).toEqual({
      error: 'OAUTH_REFRESH_NOT_AVAILABLE',
      message: 'No refresh token is available for this provider account',
    });
  });
});
