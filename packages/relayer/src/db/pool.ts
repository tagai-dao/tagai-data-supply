import mysql, { type Pool, type PoolOptions } from 'mysql2/promise';
import { config } from '../config';
import { logger } from '../utils/logger';

// spec §5.6: 独立连接池 + 独立 DB 用户，不共享 tiptag pool。
// spec §5.3: supportBigNumbers + bigNumberStrings 防 snowflake 精度丢失（tweet_id 按字符串处理）。
const RETRYABLE_DB_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
]);

function buildPoolOptions(): PoolOptions {
  return {
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    waitForConnections: true,
    connectionLimit: 10,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 30_000,
    // 远程 MySQL 常在 wait_timeout 后断开空闲连接；keepAlive + 重试避免 scheduler tick 报错
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
  };
}

function createRawPool(): Pool {
  return mysql.createPool(buildPoolOptions());
}

let rawPool = createRawPool();

export function isRetryableDbError(err: unknown): boolean {
  const e = err as { code?: string; fatal?: boolean };
  if (e?.fatal) return true;
  return e?.code != null && RETRYABLE_DB_CODES.has(e.code);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function recreatePool(reason: string): Promise<void> {
  logger.warn({ reason }, 'recreating mysql pool after connection error');
  const old = rawPool;
  rawPool = createRawPool();
  try {
    await old.end();
  } catch {
    // 旧池关闭失败可忽略
  }
}

async function withDbRetry<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableDbError(err) || attempt >= maxAttempts) throw err;
      const code = (err as { code?: string }).code ?? 'unknown';
      logger.warn({ op, attempt, maxAttempts, code }, 'mysql operation failed, will retry');
      await recreatePool(code);
      await sleep(attempt * 1000);
    }
  }
  throw new Error('mysql retry exhausted');
}

type PoolFacade = Pick<Pool, 'execute' | 'query' | 'getConnection' | 'end'>;

/** 带断线重试的连接池门面；业务代码继续 pool.execute / pool.query 即可。 */
export const pool: PoolFacade = {
  execute: ((...args: Parameters<Pool['execute']>) =>
    withDbRetry('execute', () => rawPool.execute(...args))) as Pool['execute'],
  query: ((...args: Parameters<Pool['query']>) =>
    withDbRetry('query', () => rawPool.query(...args))) as Pool['query'],
  getConnection: (() =>
    withDbRetry('getConnection', () => rawPool.getConnection())) as Pool['getConnection'],
  end: () => rawPool.end(),
};

export async function closePool(): Promise<void> {
  await pool.end();
}

// 仅供测试用：允许注入自定义 pool
export function createTestPool(overrides: Partial<PoolOptions> = {}): Pool {
  return mysql.createPool({
    ...buildPoolOptions(),
    host: 'localhost',
    port: 3306,
    user: 'test',
    password: 'test',
    database: 'test',
    connectionLimit: 5,
    ...overrides,
  });
}
