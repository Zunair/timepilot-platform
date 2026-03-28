import { query as db } from '../config/db.js';
import type { UUID } from '../types/index.js';

export type OAuthProviderName = 'google' | 'apple' | 'microsoft';

export interface OAuthAccountRecord {
  id: UUID;
  userId: UUID;
  provider: OAuthProviderName;
  providerUserId: string;
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  accessTokenExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class OAuthAccountRepository {
  private readonly columns = [
    'id',
    'user_id',
    'provider',
    'provider_user_id',
    'access_token',
    'refresh_token',
    'token_type',
    'scope',
    'access_token_expires_at',
    'created_at',
    'updated_at',
  ];

  async upsert(data: {
    userId: UUID;
    provider: OAuthProviderName;
    providerUserId: string;
    accessToken?: string;
    refreshToken?: string;
    tokenType?: string;
    scope?: string;
    accessTokenExpiresAt?: string;
  }): Promise<OAuthAccountRecord> {
    const result = await db(
      `INSERT INTO oauth_accounts (
        user_id,
        provider,
        provider_user_id,
        access_token,
        refresh_token,
        token_type,
        scope,
        access_token_expires_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id, provider)
      DO UPDATE SET
        provider_user_id = EXCLUDED.provider_user_id,
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_accounts.refresh_token),
        token_type = EXCLUDED.token_type,
        scope = EXCLUDED.scope,
        access_token_expires_at = EXCLUDED.access_token_expires_at,
        updated_at = CURRENT_TIMESTAMP
      RETURNING ${this.columns.join(', ')}`,
      [
        data.userId,
        data.provider,
        data.providerUserId,
        data.accessToken,
        data.refreshToken,
        data.tokenType,
        data.scope,
        data.accessTokenExpiresAt,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async findByUserAndProvider(
    userId: UUID,
    provider: OAuthProviderName,
  ): Promise<OAuthAccountRecord | null> {
    const result = await db(
      `SELECT ${this.columns.join(', ')}
       FROM oauth_accounts
       WHERE user_id = $1 AND provider = $2`,
      [userId, provider],
    );

    return result.rows[0] ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: Record<string, unknown>): OAuthAccountRecord {
    return {
      id: row.id as UUID,
      userId: row.user_id as UUID,
      provider: row.provider as OAuthProviderName,
      providerUserId: row.provider_user_id as string,
      accessToken: row.access_token as string | undefined,
      refreshToken: row.refresh_token as string | undefined,
      tokenType: row.token_type as string | undefined,
      scope: row.scope as string | undefined,
      accessTokenExpiresAt: row.access_token_expires_at as string | undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}

export const oauthAccountRepository = new OAuthAccountRepository();
