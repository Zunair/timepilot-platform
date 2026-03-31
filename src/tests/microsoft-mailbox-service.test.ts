import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UUID } from '../types/index.js';

vi.mock('../config/env.js', () => ({
  env: {
    MICROSOFT_CLIENT_ID: 'ms-client-id',
    MICROSOFT_CLIENT_SECRET: 'ms-client-secret',
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
import { sendViaMicrosoftUserMailbox, hasMicrosoftMailSendScope } from '../services/MicrosoftMailboxService.js';

const USER_ID = 'user-1' as UUID;

describe('MicrosoftMailboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  describe('hasMicrosoftMailSendScope', () => {
    it('returns true when scope includes Mail.Send', () => {
      expect(hasMicrosoftMailSendScope('openid profile email User.Read Mail.Send offline_access')).toBe(true);
    });

    it('returns true for case-insensitive match', () => {
      expect(hasMicrosoftMailSendScope('openid mail.send')).toBe(true);
    });

    it('returns false when scope is missing Mail.Send', () => {
      expect(hasMicrosoftMailSendScope('openid profile email User.Read')).toBe(false);
    });

    it('returns false for non-string scope', () => {
      expect(hasMicrosoftMailSendScope(undefined)).toBe(false);
      expect(hasMicrosoftMailSendScope(null)).toBe(false);
      expect(hasMicrosoftMailSendScope({ value: 'Mail.Send' })).toBe(false);
    });
  });

  describe('sendViaMicrosoftUserMailbox', () => {
    it('returns false when user has no linked Microsoft account', async () => {
      vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue(null);

      const sent = await sendViaMicrosoftUserMailbox({
        userId: USER_ID,
        recipient: 'client@example.com',
        subject: 'Reminder',
        html: '<p>Hi</p>',
      });

      expect(sent).toBe(false);
    });

    it('returns false when account does not include Mail.Send scope', async () => {
      vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue({
        userId: USER_ID,
        provider: 'microsoft',
        providerUserId: 'ms-sub-1',
        accessToken: 'token',
        refreshToken: 'refresh',
        scope: 'openid email profile User.Read',
        accessTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      } as any);

      const sent = await sendViaMicrosoftUserMailbox({
        userId: USER_ID,
        recipient: 'client@example.com',
        subject: 'Reminder',
        html: '<p>Hi</p>',
      });

      expect(sent).toBe(false);
    });

    it('returns false when linked Microsoft account contains malformed non-string scope data', async () => {
      vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue({
        userId: USER_ID,
        provider: 'microsoft',
        providerUserId: 'ms-sub-1',
        accessToken: 'token',
        refreshToken: 'refresh',
        scope: { value: 'Mail.Send' },
        accessTokenExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      } as any);

      const sent = await sendViaMicrosoftUserMailbox({
        userId: USER_ID,
        recipient: 'client@example.com',
        subject: 'Reminder',
        html: '<p>Hi</p>',
      });

      expect(sent).toBe(false);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('refreshes expired token then sends via Microsoft Graph API', async () => {
      vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue({
        userId: USER_ID,
        provider: 'microsoft',
        providerUserId: 'ms-sub-1',
        accessToken: 'expired-token',
        refreshToken: 'refresh-token',
        scope: 'openid email profile User.Read Mail.Send offline_access',
        accessTokenExpiresAt: new Date(Date.now() - 60_000).toISOString(),
      } as any);
      vi.mocked(oauthAccountRepository.upsert).mockResolvedValue({
        userId: USER_ID,
        provider: 'microsoft',
        providerUserId: 'ms-sub-1',
        accessToken: 'fresh-token',
        refreshToken: 'refresh-token-rotated',
        scope: 'openid email profile User.Read Mail.Send offline_access',
        accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      } as any);
      vi.mocked(dbQuery as any).mockResolvedValue({
        rowCount: 1,
        rows: [{ email: 'sender@example.com' }],
      });

      vi.mocked(global.fetch as any)
        // Token refresh call
        .mockResolvedValueOnce(new Response(JSON.stringify({
          access_token: 'fresh-token',
          refresh_token: 'refresh-token-rotated',
          expires_in: 3600,
          scope: 'openid email profile User.Read Mail.Send offline_access',
        }), { status: 200, headers: { 'content-type': 'application/json' } }))
        // sendMail call — MS Graph returns 202 Accepted
        .mockResolvedValueOnce(new Response(null, { status: 202 }));

      const sent = await sendViaMicrosoftUserMailbox({
        userId: USER_ID,
        recipient: 'client@example.com',
        subject: 'Booking Confirmed',
        html: '<p>Your booking is confirmed</p>',
      });

      expect(sent).toBe(true);
      expect(oauthAccountRepository.upsert).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledTimes(2);

      // Verify the Graph API call payload
      const graphCall = vi.mocked(global.fetch as any).mock.calls[1];
      expect(graphCall[0]).toBe('https://graph.microsoft.com/v1.0/me/sendMail');
      const body = JSON.parse(graphCall[1].body);
      expect(body.message.subject).toBe('Booking Confirmed');
      expect(body.message.toRecipients[0].emailAddress.address).toBe('client@example.com');
    });

    it('sends with attachments when provided', async () => {
      vi.mocked(oauthAccountRepository.findByUserAndProvider).mockResolvedValue({
        userId: USER_ID,
        provider: 'microsoft',
        providerUserId: 'ms-sub-1',
        accessToken: 'valid-token',
        refreshToken: 'refresh-token',
        scope: 'openid email profile User.Read Mail.Send offline_access',
        accessTokenExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      } as any);
      vi.mocked(dbQuery as any).mockResolvedValue({
        rowCount: 1,
        rows: [{ email: 'sender@example.com' }],
      });
      vi.mocked(global.fetch as any).mockResolvedValueOnce(new Response(null, { status: 202 }));

      const sent = await sendViaMicrosoftUserMailbox({
        userId: USER_ID,
        recipient: 'client@example.com',
        subject: 'Booking',
        html: '<p>Hi</p>',
        attachments: [{
          filename: 'appointment.ics',
          content: Buffer.from('BEGIN:VCALENDAR').toString('base64'),
          contentType: 'text/calendar',
        }],
      });

      expect(sent).toBe(true);
      const graphCall = vi.mocked(global.fetch as any).mock.calls[0];
      const body = JSON.parse(graphCall[1].body);
      expect(body.message.attachments).toHaveLength(1);
      expect(body.message.attachments[0].name).toBe('appointment.ics');
    });
  });
});
