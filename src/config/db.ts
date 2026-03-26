/**
 * Database Configuration Module
 * 
 * Provides PostgreSQL connection pooling and query execution.
 * All queries run through this module to ensure consistent connection handling
 * and to enable future query auditing/logging capabilities.
 */

import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;
type QueryResultRow = pg.QueryResultRow;

// Create connection pool
const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

/**
 * Execute a query on the pool
 * @param query - SQL query string
 * @param values - Query parameter values
 * @returns Promise resolving to query result
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values?: unknown[]
): Promise<pg.QueryResult<T>> {
  const client = await pool.connect();
  try {
    return await client.query<T>(sql, values);
  } finally {
    client.release();
  }
}

/**
 * Execute a transaction with automatic rollback on error
 * @param callback - Transaction callback function
 * @returns Promise resolving to callback result
 */
export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Close all connections in the pool
 * @returns Promise resolving when all connections are closed
 */
export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;
