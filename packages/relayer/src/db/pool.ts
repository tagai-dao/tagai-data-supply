import mysql from 'mysql2/promise';
import { config } from '../config';

// spec §5.6: 独立连接池 + 独立 DB 用户，不共享 tiptag pool。
// spec §5.3: supportBigNumbers + bigNumberStrings 防 snowflake 精度丢失（cursor/tweet_id 按字符串处理）。
export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  supportBigNumbers: true,
  bigNumberStrings: true,
});

export async function closePool(): Promise<void> {
  await pool.end();
}

// 仅供测试用：允许注入自定义 pool
export function createTestPool(overrides: Partial<mysql.PoolOptions> = {}): mysql.Pool {
  return mysql.createPool({
    host: 'localhost',
    port: 3306,
    user: 'test',
    password: 'test',
    database: 'test',
    waitForConnections: true,
    connectionLimit: 5,
    supportBigNumbers: true,
    bigNumberStrings: true,
    ...overrides,
  });
}
