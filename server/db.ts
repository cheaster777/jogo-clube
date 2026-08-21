import { Pool, type PoolClient, type PoolConfig } from 'pg';
import type { AppConfig } from './config';

export function createPool(config: AppConfig): Pool {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL é obrigatória para iniciar a API.');
  }

  const poolConfig: PoolConfig = {
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: config.databaseStatementTimeoutMs,
    idle_in_transaction_session_timeout: config.databaseIdleInTransactionTimeoutMs,
    ...(config.databaseSsl ? {
      ssl: {
        rejectUnauthorized: config.databaseSslRejectUnauthorized,
        ...(config.databaseSslCa ? { ca: config.databaseSslCa } : {}),
      },
    } : {}),
  };

  return new Pool(poolConfig);
}

export async function checkDatabase(pool: { query: QueryFunction }): Promise<void> {
  await pool.query('SELECT 1');
}

export async function withTransaction<T>(pool: Pool, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

type QueryFunction = (...args: any[]) => Promise<any>;
