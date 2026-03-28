import { query as db } from '../config/db.js';
import { env } from '../config/env.js';
import { oauthAccountRepository } from '../repositories/OAuthAccountRepository.js';
import type { OAuthAccountRecord } from '../repositories/OAuthAccountRepository.js';
import type { UUID } from '../types/index.js';

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

function hasValue(v?: string | null): v is string {
  return Boolean(v && v.trim().length > 0);
}

function hasGmailSendScope(scope?: string): boolean {
  if (!hasValue(scope)) return false;
  const scopes = scope.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  return scopes.includes(GMAIL_SEND_SCOPE) || scopes.includes('gmail.send');
}

function computeAccessTokenExpiry(expiresInSeconds?: number): string | undefined {
  if (!expiresInSeconds || Number.isNaN(expiresInSeconds) || expiresInSeconds <= 0) {
    return undefined;
  }
  return new Date(Date.now() + (expiresInSeconds * 1000)).toISOString();
}

function hasFreshAccessToken(expiresAt?: string, skewSeconds = 60): boolean {
  if (!hasValue(expiresAt)) return false;
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) return false;
  return expiresAtMs > Date.now() + skewSeconds * 1000;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf-8').toString('base64url');
}

function buildRawMimeEmail(from: string, to: string, subject: string, html: string): string {
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    html,
  ].join('\r\n');

  return toBase64Url(mime);
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

async function refreshGoogleAccessToken(account: OAuthAccountRecord): Promise<OAuthAccountRecord | null> {
  if (!hasValue(account.refreshToken)) return null;
  if (!hasValue(env.GOOGLE_CLIENT_ID) || !hasValue(env.GOOGLE_CLIENT_SECRET)) return null;

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: account.refreshToken,
  });

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) return null;
  const refreshed = await response.json() as RefreshResponse;
  if (!hasValue(refreshed.access_token)) return null;

  const updated = await oauthAccountRepository.upsert({
    userId: account.userId,
    provider: 'google',
    providerUserId: account.providerUserId,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    tokenType: refreshed.token_type,
    scope: refreshed.scope || account.scope,
    accessTokenExpiresAt: computeAccessTokenExpiry(refreshed.expires_in),
  });

  return updated;
}

export async function sendViaGoogleUserMailbox(params: {
  userId: UUID;
  recipient: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  const account = await oauthAccountRepository.findByUserAndProvider(params.userId, 'google');
  if (!account) return false;
  if (!hasGmailSendScope(account.scope)) return false;

  let senderAccount = account;
  if (!hasFreshAccessToken(senderAccount.accessTokenExpiresAt)) {
    const refreshed = await refreshGoogleAccessToken(senderAccount);
    if (!refreshed) return false;
    senderAccount = refreshed;
  }

  if (!hasValue(senderAccount.accessToken)) return false;

  const senderEmail = await getUserEmail(params.userId);
  if (!senderEmail) return false;

  const raw = buildRawMimeEmail(senderEmail, params.recipient, params.subject, params.html);
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${senderAccount.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });

  return response.ok;
}
