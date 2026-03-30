/**
 * Authentication routes
 *
 * Handles session lifecycle: create (via dev-only bypass or post-OAuth callback),
 * inspect, and revoke.
 */

import { Router, Request, Response } from 'express';
import { sessionService } from '../services/SessionService.js';
import { userRepository } from '../repositories/UserRepository.js';
import { organizationMemberRepository } from '../repositories/OrganizationMemberRepository.js';
import { organizationRepository } from '../repositories/OrganizationRepository.js';
import { oauthAccountRepository } from '../repositories/OAuthAccountRepository.js';
import { sessionRepository } from '../repositories/SessionRepository.js';
import { availabilityRepository } from '../repositories/AvailabilityRepository.js';
import type { OAuthProviderName } from '../repositories/OAuthAccountRepository.js';
import { env } from '../config/env.js';
import { AvailabilityType, RoleType } from '../types/index.js';
import type { UUID } from '../types/index.js';
import { isValidTimezone, localDateTimeInTimezoneToUTC } from '../utils/timezone.js';

type OAuthEnvShape = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_CALLBACK_URL?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_CALLBACK_URL?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_CALLBACK_URL?: string;
};

function hasValue(v?: string): v is string {
  return Boolean(v && v.trim().length > 0);
}

interface GoogleTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfoResponse {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

interface MicrosoftTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface MicrosoftGraphMeResponse {
  id?: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string;
  userPrincipalName?: string;
}

interface AppleTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface AppleIdTokenClaims {
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
}

interface AppleIdentityPayload {
  email?: string;
  name?: {
    firstName?: string;
    lastName?: string;
  };
}

interface OAuthRefreshResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

type OAuthStateAction = 'login' | 'enable_google_mail';

interface OAuthStatePayload {
  v: 1;
  action: OAuthStateAction;
  organizationSlug?: string;
  returnTo?: string;
}

interface OAuthLoginResolution {
  userId: UUID;
  organizationId?: UUID;
  role?: RoleType;
  requiresOrganizationSelection: boolean;
}

const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export function parseQueryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function parseRequestParam(req: Request, key: string): string | undefined {
  const queryVal = parseQueryString(req.query[key]);
  if (queryVal) return queryVal;

  const body = req.body as Record<string, unknown> | undefined;
  const bodyVal = body ? parseQueryString(body[key]) : undefined;
  return bodyVal;
}

function splitDisplayName(fullName?: string): { firstName: string; lastName: string } {
  if (!fullName) return { firstName: 'User', lastName: '' };
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: 'User', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function computeAccessTokenExpiry(expiresInSeconds?: number): string | undefined {
  if (!expiresInSeconds || Number.isNaN(expiresInSeconds) || expiresInSeconds <= 0) {
    return undefined;
  }

  return new Date(Date.now() + (expiresInSeconds * 1000)).toISOString();
}

export function hasFreshAccessToken(expiresAt?: string, skewSeconds = 60): boolean {
  if (!hasValue(expiresAt)) return false;
  const expiresAtMs = Date.parse(expiresAt!);
  if (Number.isNaN(expiresAtMs)) return false;

  return expiresAtMs > (Date.now() + (skewSeconds * 1000));
}

export function parseOAuthProvider(value: string): OAuthProviderName | null {
  if (value === 'google' || value === 'apple' || value === 'microsoft') {
    return value;
  }
  return null;
}

async function refreshProviderAccessToken(
  provider: OAuthProviderName,
  refreshToken: string,
): Promise<OAuthRefreshResponse> {
  if (provider === 'google') {
    const body = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    return await response.json() as OAuthRefreshResponse;
  }

  if (provider === 'apple') {
    const body = new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID!,
      client_secret: env.APPLE_CLIENT_SECRET!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    const response = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    return await response.json() as OAuthRefreshResponse;
  }

  const body = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID!,
    client_secret: env.MICROSOFT_CLIENT_SECRET!,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'openid profile email User.Read offline_access',
  });

  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  return await response.json() as OAuthRefreshResponse;
}

export function getOrganizationSlugFromOAuthRequest(req: Request): string | undefined {
  const orgFromQuery = parseRequestParam(req, 'org');
  if (orgFromQuery) return orgFromQuery;

  const state = parseOAuthState(parseRequestParam(req, 'state'));
  if (state.organizationSlug) return state.organizationSlug;

  return undefined;
}

function hasGmailSendScope(scope?: string): boolean {
  if (!hasValue(scope)) return false;
  return scope!
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .some((s) => s === GMAIL_SEND_SCOPE || s === 'gmail.send');
}

export function buildOAuthState(payload: OAuthStatePayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf-8').toString('base64url');
}

export function parseOAuthState(value?: string): {
  action: OAuthStateAction;
  organizationSlug?: string;
  returnTo?: string;
} {
  if (!hasValue(value)) {
    return { action: 'login' };
  }

  try {
    const decoded = Buffer.from(value!, 'base64url').toString('utf-8');
    const parsed = JSON.parse(decoded) as Partial<OAuthStatePayload>;
    if (parsed.action === 'login' || parsed.action === 'enable_google_mail') {
      return {
        action: parsed.action,
        organizationSlug: hasValue(parsed.organizationSlug) ? parsed.organizationSlug : undefined,
        returnTo: hasValue(parsed.returnTo) ? parsed.returnTo : undefined,
      };
    }
  } catch {
    // Backward compatibility: legacy state was raw org slug.
  }

  return {
    action: 'login',
    organizationSlug: value,
  };
}

function sanitizeReturnTo(raw?: string): string {
  const fallback = `${env.CLIENT_BASE_URL}/`;
  if (!hasValue(raw)) return fallback;

  try {
    const base = new URL(env.CLIENT_BASE_URL);
    const parsed = new URL(raw!, env.CLIENT_BASE_URL);
    if (parsed.origin !== base.origin) {
      return fallback;
    }

    return parsed.toString();
  } catch {
    return fallback;
  }
}

function appendQuery(url: string, key: string, value: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(key, value);
  return parsed.toString();
}

function slugifyOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'organization';
}

async function generateUniqueOrganizationSlug(name: string): Promise<string> {
  const base = slugifyOrganizationName(name);
  let candidate = base;
  let suffix = 2;

  while (await organizationRepository.findBySlug(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function seedDefaultAvailabilityForUser(params: {
  organizationId: UUID;
  userId: UUID;
  timezone: string;
}): Promise<void> {
  const dates: string[] = [];
  const today = new Date();

  for (let offset = 0; offset < 14; offset += 1) {
    const current = new Date(today);
    current.setUTCDate(today.getUTCDate() + offset);
    const day = current.getUTCDay();
    if (day === 0 || day === 6) continue;

    const ymd = current.toISOString().slice(0, 10);
    dates.push(ymd);
  }

  for (const ymd of dates) {
    await availabilityRepository.create({
      organizationId: params.organizationId,
      userId: params.userId,
      type: AvailabilityType.DAY,
      startTime: localDateTimeInTimezoneToUTC(ymd, '09:00', params.timezone),
      endTime: localDateTimeInTimezoneToUTC(ymd, '16:00', params.timezone),
      daysOfWeek: undefined,
      bufferMinutes: 0,
      timezone: params.timezone,
    });
  }
}

function decodeJwtPayload<T>(jwt: string): T {
  const parts = jwt.split('.');
  if (parts.length < 2) throw new Error('Invalid JWT format');

  const payload = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const json = Buffer.from(padded, 'base64').toString('utf-8');
  return JSON.parse(json) as T;
}

export function parseAppleIdentityPayload(userPayload?: string): {
  email?: string;
  firstName?: string;
  lastName?: string;
} {
  if (!hasValue(userPayload)) {
    return {};
  }

  try {
    const parsed = JSON.parse(userPayload!) as AppleIdentityPayload;

    return {
      email: hasValue(parsed.email) ? parsed.email : undefined,
      firstName: hasValue(parsed.name?.firstName) ? parsed.name?.firstName : undefined,
      lastName: hasValue(parsed.name?.lastName) ? parsed.name?.lastName : undefined,
    };
  } catch {
    return {};
  }
}

export function buildGoogleOAuthAuthorizeUrl(
  state: string,
  cfg: OAuthEnvShape = env,
  options?: { includeGmailSendScope?: boolean },
): string {
  if (!hasValue(cfg.GOOGLE_CLIENT_ID) || !hasValue(cfg.GOOGLE_CALLBACK_URL)) {
    throw new Error('Google OAuth is not configured');
  }

  const scopes = ['openid', 'email', 'profile'];
  if (options?.includeGmailSendScope) {
    scopes.push(GMAIL_SEND_SCOPE);
  }

  const params = new URLSearchParams({
    client_id: cfg.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: cfg.GOOGLE_CALLBACK_URL!.trim(),
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    include_granted_scopes: 'true',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function buildMicrosoftOAuthAuthorizeUrl(state: string, cfg: OAuthEnvShape = env): string {
  if (!hasValue(cfg.MICROSOFT_CLIENT_ID) || !hasValue(cfg.MICROSOFT_CALLBACK_URL)) {
    throw new Error('Microsoft OAuth is not configured');
  }

  const params = new URLSearchParams({
    client_id: cfg.MICROSOFT_CLIENT_ID!.trim(),
    redirect_uri: cfg.MICROSOFT_CALLBACK_URL!.trim(),
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

export function buildAppleOAuthAuthorizeUrl(state: string, cfg: OAuthEnvShape = env): string {
  if (!hasValue(cfg.APPLE_CLIENT_ID) || !hasValue(cfg.APPLE_CALLBACK_URL)) {
    throw new Error('Apple Sign-In is not configured');
  }

  const params = new URLSearchParams({
    client_id: cfg.APPLE_CLIENT_ID!.trim(),
    redirect_uri: cfg.APPLE_CALLBACK_URL!.trim(),
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  });
  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}

export function getOAuthProviderAvailability(cfg: OAuthEnvShape = env): Record<OAuthProviderName, boolean> {
  return {
    google: hasValue(cfg.GOOGLE_CLIENT_ID) && hasValue(cfg.GOOGLE_CLIENT_SECRET) && hasValue(cfg.GOOGLE_CALLBACK_URL),
    apple: hasValue(cfg.APPLE_CLIENT_ID) && hasValue(cfg.APPLE_CLIENT_SECRET) && hasValue(cfg.APPLE_CALLBACK_URL),
    microsoft: hasValue(cfg.MICROSOFT_CLIENT_ID) && hasValue(cfg.MICROSOFT_CLIENT_SECRET) && hasValue(cfg.MICROSOFT_CALLBACK_URL),
  };
}

export function getEnabledOAuthProviders(cfg: OAuthEnvShape = env): OAuthProviderName[] {
  const availability = getOAuthProviderAvailability(cfg);
  return (Object.keys(availability) as OAuthProviderName[]).filter((provider) => availability[provider]);
}

export const authRouter = Router();

// ---------------------------------------------------------------------------
// Session inspection
// ---------------------------------------------------------------------------

/** GET /api/auth/session — return current user/org if session is valid */
authRouter.get('/session', async (req: Request, res: Response) => {
  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'No session cookie' });
    return;
  }
  const payload = await sessionService.validate(sessionId).catch(() => null);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  const user = await userRepository.findById(payload.userId).catch(() => null);
  res.json({ userId: payload.userId, organizationId: payload.organizationId, role: payload.role, user });
});

/**
 * GET /api/auth/providers — list provider availability for login UIs.
 * A provider is enabled only when client id + secret + callback URL are all configured.
 */
authRouter.get('/providers', (_req: Request, res: Response) => {
  const availability = getOAuthProviderAvailability();
  const enabledProviders = getEnabledOAuthProviders();
  res.json({
    providers: {
      google: availability.google,
      apple: availability.apple,
      microsoft: availability.microsoft,
    },
    enabledProviders,
  });
});

/**
 * GET /api/auth/organizations
 * Lists organizations available to the currently logged-in user.
 */
authRouter.get('/organizations', async (req: Request, res: Response) => {
  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'No session cookie' });
    return;
  }

  const payload = await sessionService.validate(sessionId).catch(() => null);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  const memberships = await organizationMemberRepository.findOrganizationsForUser(payload.userId);
  const googleAccount = await oauthAccountRepository.findByUserAndProvider(payload.userId, 'google');
  const current = payload.organizationId
    ? memberships.find((m) => m.organizationId === payload.organizationId)
    : undefined;

  res.json({
    activeOrganizationId: payload.organizationId,
    activeOrganizationSlug: current?.organizationSlug,
    organizations: memberships.map((m) => ({
      id: m.organizationId,
      slug: m.organizationSlug,
      name: m.organizationName,
      role: m.role,
    })),
    emailNotifications: {
      provider: 'google',
      googleLinked: Boolean(googleAccount),
      enabled: hasGmailSendScope(googleAccount?.scope),
    },
  });
});

/**
 * POST /api/auth/organizations/create
 * Creates a new organization for a logged-in user with default 14-day availability.
 */
authRouter.post('/organizations/create', async (req: Request, res: Response) => {
  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'No session cookie' });
    return;
  }

  const payload = await sessionService.validate(sessionId).catch(() => null);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  const name = parseQueryString((req.body as Record<string, unknown> | undefined)?.name);
  const requestedTimezone = parseQueryString((req.body as Record<string, unknown> | undefined)?.timezone);
  if (!name || name.length < 2) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Organization name must be at least 2 characters' });
    return;
  }

  if (requestedTimezone && !isValidTimezone(requestedTimezone)) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid IANA timezone' });
    return;
  }

  const user = await userRepository.findById(payload.userId);
  if (!user) {
    res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    return;
  }

  const timezone = requestedTimezone || user.timezone || 'UTC';
  if (timezone !== user.timezone) {
    await userRepository.update(user.id, { timezone });
  }

  const slug = await generateUniqueOrganizationSlug(name);
  const organization = await organizationRepository.create({
    name,
    slug,
    description: `${name} workspace`,
  });

  await organizationMemberRepository.create({
    organizationId: organization.id,
    userId: user.id,
    role: RoleType.OWNER,
  });

  await seedDefaultAvailabilityForUser({
    organizationId: organization.id,
    userId: user.id,
    timezone,
  });

  const { cookie } = await sessionService.create(user.id, organization.id);
  res.setHeader('Set-Cookie', cookie);
  res.status(201).json({
    userId: user.id,
    organizationId: organization.id,
    organizationSlug: organization.slug,
    role: RoleType.OWNER,
  });
});

/**
 * POST /api/auth/organizations/select
 * Switches the active organization for the current session user.
 */
authRouter.post('/organizations/select', async (req: Request, res: Response) => {
  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'No session cookie' });
    return;
  }

  const payload = await sessionService.validate(sessionId).catch(() => null);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  const organizationId = parseQueryString((req.body as Record<string, unknown> | undefined)?.organizationId);
  if (!organizationId) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'organizationId is required' });
    return;
  }

  const membership = await organizationMemberRepository.findByUserAndOrganization(
    payload.userId,
    organizationId as UUID,
  );
  if (!membership) {
    res.status(403).json({ error: 'NOT_A_MEMBER', message: 'User is not a member of this organization' });
    return;
  }

  const organization = await organizationRepository.findByIdRaw(organizationId as UUID);
  if (!organization) {
    res.status(404).json({ error: 'ORG_NOT_FOUND', message: 'Organization not found' });
    return;
  }

  const { cookie } = await sessionService.create(payload.userId, organization.id);
  res.setHeader('Set-Cookie', cookie);
  res.json({
    userId: payload.userId,
    organizationId: organization.id,
    organizationSlug: organization.slug,
    role: membership.role,
  });
});

/**
 * GET /api/auth/providers/google/status
 * Returns whether gmail.send scope is granted for the current user.
 */
authRouter.get('/providers/google/status', async (req: Request, res: Response) => {
  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'No session cookie' });
    return;
  }

  const payload = await sessionService.validate(sessionId).catch(() => null);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  const account = await oauthAccountRepository.findByUserAndProvider(payload.userId, 'google');
  res.json({
    googleLinked: Boolean(account),
    enabled: hasGmailSendScope(account?.scope),
  });
});

/**
 * GET /api/auth/google/enable-email-scope
 * Starts incremental Google consent for gmail.send after login.
 */
authRouter.get('/google/enable-email-scope', async (req: Request, res: Response) => {
  const providers = getOAuthProviderAvailability();
  if (!providers.google) {
    res.status(503).json({
      error: 'OAUTH_PROVIDER_DISABLED',
      message: 'Google OAuth is not configured for this environment',
    });
    return;
  }

  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'No session cookie' });
    return;
  }
  const payload = await sessionService.validate(sessionId).catch(() => null);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  const returnTo = sanitizeReturnTo(parseRequestParam(req, 'returnTo'));
  const state = buildOAuthState({
    v: 1,
    action: 'enable_google_mail',
    returnTo,
  });
  const authorizeUrl = buildGoogleOAuthAuthorizeUrl(state, env, { includeGmailSendScope: true });
  res.redirect(authorizeUrl);
});

/**
 * POST /api/auth/providers/:provider/refresh
 * Refreshes an expired or near-expiry provider access token for the current user.
 */
authRouter.post('/providers/:provider/refresh', async (req: Request, res: Response) => {
  const provider = parseOAuthProvider(String(req.params.provider || ''));
  if (!provider) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'Unsupported OAuth provider' });
    return;
  }

  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (!sessionId) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'No session cookie' });
    return;
  }

  const payload = await sessionService.validate(sessionId).catch(() => null);
  if (!payload) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid' });
    return;
  }

  const oauthAccount = await oauthAccountRepository.findByUserAndProvider(payload.userId, provider);
  if (!oauthAccount) {
    res.status(404).json({ error: 'OAUTH_ACCOUNT_NOT_FOUND', message: 'No linked OAuth account for provider' });
    return;
  }

  if (hasValue(oauthAccount.accessToken) && hasFreshAccessToken(oauthAccount.accessTokenExpiresAt)) {
    res.json({
      provider,
      accessToken: oauthAccount.accessToken,
      expiresAt: oauthAccount.accessTokenExpiresAt,
      refreshed: false,
    });
    return;
  }

  if (!hasValue(oauthAccount.refreshToken)) {
    res.status(409).json({
      error: 'OAUTH_REFRESH_NOT_AVAILABLE',
      message: 'No refresh token is available for this provider account',
    });
    return;
  }

  try {
    const refreshed = await refreshProviderAccessToken(provider, oauthAccount.refreshToken!);
    if (!hasValue(refreshed.access_token)) {
      res.status(502).json({
        error: 'OAUTH_REFRESH_FAILED',
        message: refreshed.error_description || refreshed.error || 'Provider did not return a refreshed access token',
      });
      return;
    }

    const expiresAt = computeAccessTokenExpiry(refreshed.expires_in);
    const updatedAccount = await oauthAccountRepository.upsert({
      userId: oauthAccount.userId,
      provider,
      providerUserId: oauthAccount.providerUserId,
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenType: refreshed.token_type,
      scope: refreshed.scope,
      accessTokenExpiresAt: expiresAt,
    });

    res.json({
      provider,
      accessToken: updatedAccount.accessToken,
      expiresAt: updatedAccount.accessTokenExpiresAt,
      refreshed: true,
    });
  } catch (error) {
    console.error('[Auth] OAuth token refresh failed:', error);
    res.status(502).json({
      error: 'OAUTH_REFRESH_FAILED',
      message: 'OAuth token refresh failed',
    });
  }
});

// ---------------------------------------------------------------------------
// Logout
// ---------------------------------------------------------------------------

async function handleLogout(req: Request, res: Response): Promise<void> {
  const sessionId = sessionService.parseSessionId(req.headers.cookie);
  if (sessionId) {
    try {
      await sessionService.revoke(sessionId as UUID);
    } catch {
      // Swallow revoke failures so cookie clearing still signs the user out client-side.
    }
  }
  res.setHeader('Set-Cookie', 'session_id=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/');
  res.json({ message: 'Logged out' });
}

/**
 * /api/auth/logout — revoke the current session and clear the cookie.
 * Supports both POST (preferred) and GET (link/navigation fallback).
 */
authRouter.post('/logout', handleLogout);
authRouter.get('/logout', handleLogout);

// ---------------------------------------------------------------------------
// OAuth callbacks
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/google/callback
 * Behavior:
 * - No code: starts OAuth by redirecting to Google consent screen.
 * - With code: exchanges code for token, fetches user profile, creates session.
 */
authRouter.get('/google/callback', async (req, res) => {
  const providers = getOAuthProviderAvailability();
  if (!providers.google) {
    res.status(503).json({
      error: 'OAUTH_PROVIDER_DISABLED',
      message: 'Google OAuth is not configured for this environment',
    });
    return;
  }

  const state = parseOAuthState(parseRequestParam(req, 'state'));
  const organizationSlug = parseRequestParam(req, 'org') ?? state.organizationSlug;
  const returnTo = sanitizeReturnTo(parseRequestParam(req, 'returnTo') ?? state.returnTo);

  const code = parseQueryString(req.query.code);

  // Kick off OAuth flow when no auth code is present.
  if (!code) {
    const encodedState = buildOAuthState({
      v: 1,
      action: 'login',
      organizationSlug,
      returnTo,
    });
    const authorizeUrl = buildGoogleOAuthAuthorizeUrl(encodedState, env, { includeGmailSendScope: false });
    res.redirect(authorizeUrl);
    return;
  }

  try {
    const tokenBody = new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_CALLBACK_URL!,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    const tokenData = await tokenResponse.json() as GoogleTokenResponse;
    if (!tokenResponse.ok || !hasValue(tokenData.access_token)) {
      res.status(502).json({
        error: 'OAUTH_TOKEN_EXCHANGE_FAILED',
        message: tokenData.error_description || tokenData.error || 'Failed to exchange Google auth code',
      });
      return;
    }

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileResponse.json() as GoogleUserInfoResponse;

    if (!profileResponse.ok) {
      res.status(502).json({
        error: 'OAUTH_PROFILE_FETCH_FAILED',
        message: 'Failed to fetch Google user profile',
      });
      return;
    }

    if (!hasValue(profile.email)) {
      res.status(400).json({
        error: 'OAUTH_EMAIL_REQUIRED',
        message: 'Google account email is required',
      });
      return;
    }

    const names = splitDisplayName(profile.name);
    const firstName = hasValue(profile.given_name) ? profile.given_name! : names.firstName;
    const lastName = hasValue(profile.family_name) ? profile.family_name! : names.lastName;

    const loginResolution = await handleOAuthLogin(res, {
      email: profile.email!,
      firstName,
      lastName,
      profileImageUrl: hasValue(profile.picture) ? profile.picture : undefined,
      organizationSlug,
      oauthAction: state.action,
      provider: 'google',
      providerUserId: hasValue(profile.sub) ? profile.sub! : profile.email!,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      accessTokenExpiresAt: computeAccessTokenExpiry(tokenData.expires_in),
    });
    if (!loginResolution) return;

    let redirectTo = returnTo;
    if (loginResolution.requiresOrganizationSelection) {
      redirectTo = appendQuery(redirectTo, 'selectOrg', '1');
    }
    if (state.action === 'enable_google_mail') {
      redirectTo = appendQuery(redirectTo, 'emailScopeEnabled', '1');
    }

    res.redirect(redirectTo);
  } catch (error) {
    console.error('[Auth] Google OAuth callback failed:', error);
    res.status(502).json({
      error: 'OAUTH_CALLBACK_FAILED',
      message: 'Google OAuth login failed',
    });
  }
});

/**
 * /api/auth/apple/callback
 * - No code: starts Apple Sign-In redirect.
 * - With code: exchanges code for token and reads claims from id_token.
 */
const handleAppleCallback = async (req: Request, res: Response): Promise<void> => {
  const providers = getOAuthProviderAvailability();
  if (!providers.apple) {
    res.status(503).json({
      error: 'OAUTH_PROVIDER_DISABLED',
      message: 'Apple Sign-In is not configured for this environment',
    });
    return;
  }

  const state = parseOAuthState(parseRequestParam(req, 'state'));
  const organizationSlug = parseRequestParam(req, 'org') ?? state.organizationSlug;
  const returnTo = sanitizeReturnTo(parseRequestParam(req, 'returnTo') ?? state.returnTo);

  const code = parseRequestParam(req, 'code');
  const appleIdentity = parseAppleIdentityPayload(parseRequestParam(req, 'user'));

  if (!code) {
    const encodedState = buildOAuthState({
      v: 1,
      action: 'login',
      organizationSlug,
      returnTo,
    });
    const authorizeUrl = buildAppleOAuthAuthorizeUrl(encodedState);
    res.redirect(authorizeUrl);
    return;
  }

  try {
    const tokenBody = new URLSearchParams({
      code,
      client_id: env.APPLE_CLIENT_ID!,
      client_secret: env.APPLE_CLIENT_SECRET!,
      grant_type: 'authorization_code',
      redirect_uri: env.APPLE_CALLBACK_URL!,
    });

    const tokenResponse = await fetch('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    const tokenData = await tokenResponse.json() as AppleTokenResponse;
    if (!tokenResponse.ok || !hasValue(tokenData.id_token)) {
      res.status(502).json({
        error: 'OAUTH_TOKEN_EXCHANGE_FAILED',
        message: tokenData.error_description || tokenData.error || 'Failed to exchange Apple auth code',
      });
      return;
    }

    // Apple user profile is encoded in id_token JWT claims.
    const claims = decodeJwtPayload<AppleIdTokenClaims>(tokenData.id_token!);
    const email = hasValue(claims.email) ? claims.email : appleIdentity.email;
    if (!hasValue(email)) {
      res.status(400).json({
        error: 'OAUTH_EMAIL_REQUIRED',
        message: 'Apple account email is required',
      });
      return;
    }

    const loginResolution = await handleOAuthLogin(res, {
      email,
      firstName: hasValue(appleIdentity.firstName) ? appleIdentity.firstName! : 'Apple',
      lastName: hasValue(appleIdentity.lastName) ? appleIdentity.lastName! : 'User',
      organizationSlug,
      oauthAction: state.action,
      provider: 'apple',
      providerUserId: hasValue(claims.sub) ? claims.sub! : email,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type,
      accessTokenExpiresAt: computeAccessTokenExpiry(tokenData.expires_in),
    });
    if (!loginResolution) return;

    let redirectTo = returnTo;
    if (loginResolution.requiresOrganizationSelection) {
      redirectTo = appendQuery(redirectTo, 'selectOrg', '1');
    }
    res.redirect(redirectTo);
  } catch (error) {
    console.error('[Auth] Apple callback failed:', error);
    res.status(502).json({
      error: 'OAUTH_CALLBACK_FAILED',
      message: 'Apple Sign-In failed',
    });
  }
};

authRouter.get('/apple/callback', handleAppleCallback);
authRouter.post('/apple/callback', handleAppleCallback);

/**
 * GET /api/auth/microsoft/callback
 * - No code: starts Microsoft OAuth redirect.
 * - With code: exchanges code, fetches profile, and creates session.
 */
authRouter.get('/microsoft/callback', async (req, res) => {
  const providers = getOAuthProviderAvailability();
  if (!providers.microsoft) {
    res.status(503).json({
      error: 'OAUTH_PROVIDER_DISABLED',
      message: 'Microsoft OAuth is not configured for this environment',
    });
    return;
  }

  const state = parseOAuthState(parseRequestParam(req, 'state'));
  const organizationSlug = parseRequestParam(req, 'org') ?? state.organizationSlug;
  const returnTo = sanitizeReturnTo(parseRequestParam(req, 'returnTo') ?? state.returnTo);

  const code = parseRequestParam(req, 'code');
  if (!code) {
    const encodedState = buildOAuthState({
      v: 1,
      action: 'login',
      organizationSlug,
      returnTo,
    });
    const authorizeUrl = buildMicrosoftOAuthAuthorizeUrl(encodedState);
    res.redirect(authorizeUrl);
    return;
  }

  try {
    const tokenBody = new URLSearchParams({
      code,
      client_id: env.MICROSOFT_CLIENT_ID!,
      client_secret: env.MICROSOFT_CLIENT_SECRET!,
      redirect_uri: env.MICROSOFT_CALLBACK_URL!,
      grant_type: 'authorization_code',
      scope: 'openid profile email User.Read',
    });

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody.toString(),
    });

    const tokenData = await tokenResponse.json() as MicrosoftTokenResponse;
    if (!tokenResponse.ok || !hasValue(tokenData.access_token)) {
      res.status(502).json({
        error: 'OAUTH_TOKEN_EXCHANGE_FAILED',
        message: tokenData.error_description || tokenData.error || 'Failed to exchange Microsoft auth code',
      });
      return;
    }

    const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,givenName,surname,mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileResponse.json() as MicrosoftGraphMeResponse;

    if (!profileResponse.ok) {
      res.status(502).json({
        error: 'OAUTH_PROFILE_FETCH_FAILED',
        message: 'Failed to fetch Microsoft user profile',
      });
      return;
    }

    const candidateEmail = hasValue(profile.mail)
      ? profile.mail
      : hasValue(profile.userPrincipalName)
        ? profile.userPrincipalName
        : undefined;

    if (!hasValue(candidateEmail)) {
      res.status(400).json({
        error: 'OAUTH_EMAIL_REQUIRED',
        message: 'Microsoft account email is required',
      });
      return;
    }

    const email = candidateEmail;

    const names = splitDisplayName(profile.displayName);
    const firstName = hasValue(profile.givenName) ? profile.givenName! : names.firstName;
    const lastName = hasValue(profile.surname) ? profile.surname! : names.lastName;

    const loginResolution = await handleOAuthLogin(res, {
      email,
      firstName,
      lastName,
      organizationSlug,
      oauthAction: state.action,
      provider: 'microsoft',
      providerUserId: hasValue(profile.id) ? profile.id! : email,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type,
      scope: tokenData.scope,
      accessTokenExpiresAt: computeAccessTokenExpiry(tokenData.expires_in),
    });
    if (!loginResolution) return;

    let redirectTo = returnTo;
    if (loginResolution.requiresOrganizationSelection) {
      redirectTo = appendQuery(redirectTo, 'selectOrg', '1');
    }
    res.redirect(redirectTo);
  } catch (error) {
    console.error('[Auth] Microsoft callback failed:', error);
    res.status(502).json({
      error: 'OAUTH_CALLBACK_FAILED',
      message: 'Microsoft OAuth login failed',
    });
  }
});

// ---------------------------------------------------------------------------
// Internal helper shared by all provider callbacks once implemented
// ---------------------------------------------------------------------------

export async function handleOAuthLogin(
  res: Response,
  profile: {
    email: string;
    firstName: string;
    lastName: string;
    profileImageUrl?: string;
    organizationSlug?: string;
    oauthAction: OAuthStateAction;
    provider: OAuthProviderName;
    providerUserId: string;
    accessToken?: string;
    refreshToken?: string;
    tokenType?: string;
    scope?: string;
    accessTokenExpiresAt?: string;
  },
): Promise<OAuthLoginResolution | null> {
  // Upsert user by email
  let user = await userRepository.findByEmail(profile.email);
  if (!user) {
    user = await userRepository.create({
      email:           profile.email,
      firstName:       profile.firstName,
      lastName:        profile.lastName,
      profileImageUrl: profile.profileImageUrl,
    });
  }

  const memberships = await organizationMemberRepository.findOrganizationsForUser(user.id);
  if (memberships.length === 0) {
    if (hasValue(profile.organizationSlug)) {
      res.status(403).json({ error: 'NOT_A_MEMBER', message: 'User is not a member of this organization' });
      return null;
    }

    await oauthAccountRepository.upsert({
      userId: user.id,
      provider: profile.provider,
      providerUserId: profile.providerUserId,
      accessToken: profile.accessToken,
      refreshToken: profile.refreshToken,
      tokenType: profile.tokenType,
      scope: profile.scope,
      accessTokenExpiresAt: profile.accessTokenExpiresAt,
    });

    const { cookie } = await sessionService.create(user.id);
    res.setHeader('Set-Cookie', cookie);

    return {
      userId: user.id,
      requiresOrganizationSelection: false,
    };
  }

  let selected = null as typeof memberships[number] | null;
  let requiresOrganizationSelection = false;

  if (hasValue(profile.organizationSlug)) {
    selected = memberships.find((m) => m.organizationSlug === profile.organizationSlug) ?? null;
    if (!selected) {
      res.status(403).json({ error: 'NOT_A_MEMBER', message: 'User is not a member of this organization' });
      return null;
    }
  } else {
    const lastOrgId = await sessionRepository.findLatestOrganizationForUser(user.id);
    if (lastOrgId) {
      selected = memberships.find((m) => m.organizationId === lastOrgId) ?? null;
    }

    if (!selected) {
      selected = memberships[0];
      requiresOrganizationSelection = memberships.length > 1;
    }
  }

  await oauthAccountRepository.upsert({
    userId: user.id,
    provider: profile.provider,
    providerUserId: profile.providerUserId,
    accessToken: profile.accessToken,
    refreshToken: profile.refreshToken,
    tokenType: profile.tokenType,
    scope: profile.scope,
    accessTokenExpiresAt: profile.accessTokenExpiresAt,
  });

  const { cookie } = await sessionService.create(user.id, selected.organizationId);
  res.setHeader('Set-Cookie', cookie);

  return {
    userId: user.id,
    organizationId: selected.organizationId,
    role: selected.role,
    requiresOrganizationSelection,
  };
}

// ---------------------------------------------------------------------------
// Development-only test login (disabled in production)
// ---------------------------------------------------------------------------

if (env.NODE_ENV !== 'production') {
  /**
   * POST /api/auth/dev-login
   * Body: { email, organizationSlug }
   *
   * Creates a session for an existing user+org pair without OAuth.
   * ONLY available outside production — never expose in production builds.
   */
  authRouter.post('/dev-login', async (req: Request, res: Response) => {
    const { email, organizationSlug } = req.body as { email?: string; organizationSlug?: string };
    if (!email || !organizationSlug) {
      res.status(400).json({ error: 'BAD_REQUEST', message: 'email and organizationSlug required' });
      return;
    }

    const user = await userRepository.findByEmail(email).catch(() => null);
    if (!user) {
      res.status(404).json({ error: 'USER_NOT_FOUND', message: 'No user with that email' });
      return;
    }

    const org = await organizationRepository.findBySlug(organizationSlug).catch(() => null);
    if (!org) {
      res.status(404).json({ error: 'ORG_NOT_FOUND', message: 'Organization not found' });
      return;
    }

    const membership = await organizationMemberRepository.findByUserAndOrganization(
      user.id, org.id,
    ).catch(() => null);
    if (!membership) {
      res.status(403).json({ error: 'NOT_A_MEMBER', message: 'User is not a member of this organization' });
      return;
    }

    const { cookie } = await sessionService.create(user.id, org.id);
    res.setHeader('Set-Cookie', cookie);
    res.json({ userId: user.id, organizationId: org.id, role: membership.role });
  });
}
