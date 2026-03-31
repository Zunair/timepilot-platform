import { query as db } from '../config/db.js';
import { env } from '../config/env.js';
import { oauthAccountRepository } from '../repositories/OAuthAccountRepository.js';
import type { OAuthAccountRecord } from '../repositories/OAuthAccountRepository.js';
import type { UUID } from '../types/index.js';

const MS_MAIL_SEND_SCOPE = 'Mail.Send';

export interface EmailAttachment {
  filename: string;
  content: string;       // base64-encoded content
  contentType: string;   // MIME type, e.g. 'text/calendar'
}

function hasValue(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function hasMicrosoftMailSendScope(scope?: unknown): boolean {
  if (!hasValue(scope)) return false;
  const scopes = scope.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  return scopes.some((s) => s.toLowerCase() === MS_MAIL_SEND_SCOPE.toLowerCase());
}

function computeAccessTokenExpiry(expiresInSeconds?: number): string | undefined {
  if (!expiresInSeconds || Number.isNaN(expiresInSeconds) || expiresInSeconds <= 0) {
    return undefined;
  }
  return new Date(Date.now() + (expiresInSeconds * 1000)).toISOString();
}

function hasFreshAccessToken(expiresAt?: unknown, skewSeconds = 60): boolean {
  if (!hasValue(expiresAt)) return false;
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) return false;
  return expiresAtMs > Date.now() + skewSeconds * 1000;
}

async function getUserEmail(userId: UUID): Promise<string | null> {
  const result = await db<Record<string, unknown>>('SELECT email FROM users WHERE id = $1', [userId]);
  if ((result.rowCount ?? 0) === 0) return null;
  const email = result.rows[0]?.email as string | undefined;
  return hasValue(email) ? email : null;
}

interface RefreshResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

async function refreshMicrosoftAccessToken(account: OAuthAccountRecord): Promise<OAuthAccountRecord | null> {
  if (!hasValue(account.refreshToken)) return null;
  if (!hasValue(env.MICROSOFT_CLIENT_ID) || !hasValue(env.MICROSOFT_CLIENT_SECRET)) return null;

  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    client_secret: env.MICROSOFT_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: account.refreshToken,
    scope: 'openid profile email User.Read Mail.Send offline_access',
  });

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) return null;
  const refreshed = await response.json() as RefreshResponse;
  if (!hasValue(refreshed.access_token)) return null;

  const updated = await oauthAccountRepository.upsert({
    userId: account.userId,
    provider: 'microsoft',
    providerUserId: account.providerUserId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    tokenType: refreshed.token_type,
    scope: refreshed.scope || account.scope,
    accessTokenExpiresAt: computeAccessTokenExpiry(refreshed.expires_in),
  });

  return updated;
}

export async function sendViaMicrosoftUserMailbox(params: {
  userId: UUID;
  recipient: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<boolean> {
  const account = await oauthAccountRepository.findByUserAndProvider(params.userId, 'microsoft');
  if (!account) return false;
  if (!hasMicrosoftMailSendScope(account.scope)) return false;

  let senderAccount = account;
  if (!hasFreshAccessToken(senderAccount.accessTokenExpiresAt)) {
    const refreshed = await refreshMicrosoftAccessToken(senderAccount);
    if (!refreshed) return false;
    senderAccount = refreshed;
  }

  if (!hasValue(senderAccount.accessToken)) return false;

  const senderEmail = await getUserEmail(params.userId);
  if (!senderEmail) return false;

  const graphAttachments = (params.attachments ?? []).map((att) => ({
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: att.filename,
    contentType: att.contentType,
    contentBytes: att.content,
  }));

  const message: Record<string, unknown> = {
    subject: params.subject,
    body: {
      contentType: 'HTML',
      content: params.html,
    },
    from: {
      emailAddress: { address: senderEmail },
    },
    toRecipients: [
      { emailAddress: { address: params.recipient } },
    ],
  };

  if (graphAttachments.length > 0) {
    message.attachments = graphAttachments;
  }

  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${senderAccount.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  return response.ok || response.status === 202;
}
