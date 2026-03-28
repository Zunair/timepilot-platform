import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UUID } from '../types/index.js';

vi.mock('../config/env.js', () => ({
  env: {
    GOOGLE_CLIENT_ID: 'google-client-id',
    GOOGLE_CLIENT_SECRET: 'google-client-secret',
  },
}));

vi.mock('../config/db.js', () => ({
  query: vi.fn(),
}));

vi.mock('../repositories/OAuthAccountRepository.js', () => ({
  oauthAccountRepository: {
    findByUserAndProvider: vi.fn(),
    upsert: vi.fn(),
  },
}));

import { query as dbQuery } from '../config/db.js';
import { oauthAccountRepository } from '../repositories/OAuthAccountRepository.js';
import { sendViaGoogleUserMailbox } from '../services/GoogleMailboxService.js';

const USER_ID = 'user-1' as UUID;

describe('GoogleMailboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns false when user has no linked Google account', async () => {
    vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue(null);

    const sent = await sendViaGoogleUserMailbox({
      userId: USER_ID,
      recipient: 'client@example.com',
      subject: 'Reminder',
      html: '<p>Hi</p>',
    });

    expect(sent).toBe(false);
  });

  it('returns false when account does not include gmail.send scope', async () => {
    vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue({
      userId: USER_ID,
      provider: 'google',
      providerUserId: 'google-sub-1',
      accessToken: 'token',
      refreshToken: 'refresh',
      scope: 'openid email profile',
      accessTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    } as any);

    const sent = await sendViaGoogleUserMailbox({
      userId: USER_ID,
      recipient: 'client@example.com',
      subject: 'Reminder',
      html: '<p>Hi</p>',
    });

    expect(sent).toBe(false);
  });

  it('refreshes expired token then sends via Gmail API', async () => {
    vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue({
      userId: USER_ID,
      provider: 'google',
      providerUserId: 'google-sub-1',
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      scope: 'openid email profile https://www.googleapis.com/auth/gmail.send',
      accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    } as any);
    vi.mocked(oauthAccountRepository.upsert).mockResolvedValue({
      userId: USER_ID,
      provider: 'google',
      providerUserId: 'google-sub-1',
      accessToken: 'fresh-token',
      refreshToken: 'refresh-token-rotated',
      scope: 'openid email profile https://www.googleapis.com/auth/gmail.send',
      accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
    } as any);
    vi.mocked(dbQuery as any).mockResolvedValue({
      rowCount: 1,
      rows: [{ email: 'sender@example.com' }],
    });

    vi.mocked(global.fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'fresh-token',
        refresh_token: 'refresh-token-rotated',
        expires_in: 3600,
        scope: 'openid email profile https://www.googleapis.com/auth/gmail.send',
      }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'gmail-msg-1' }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const sent = await sendViaGoogleUserMailbox({
      userId: USER_ID,
      recipient: 'client@example.com',
      subject: 'Reminder',
      html: '<p>Hi</p>',
    });

    expect(sent).toBe(true);
    expect(oauthAccountRepository.upsert).toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
