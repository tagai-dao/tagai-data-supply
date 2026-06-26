import type { Pool } from 'mysql2/promise';
import { pool } from './pool';
import { TWEET_TABLE } from '../config/constants';
import { hashToken } from '../auth/tokens';

// 允许注入 Pool，便于测试与未来多 pool
export function withPool(p: Pool) {
  return {
    execute: (sql: string, params?: any[]) => p.execute(sql, params),
    query: (sql: string, params?: any[]) => p.query(sql, params),
  };
}

// spec §5.1: bsc_tweet INSERT 列清单（线上核对后以实际为准，verify-schema 会校验）
export const BSC_TWEET_INSERT_COLUMNS = [
  'tweet_id', 'twitter_id', 'content', 'tweet_time',
  'tick', 'tags', 'day_number', 'video_link',
] as const;

export function buildInsertTweetSql(): string {
  const cols = BSC_TWEET_INSERT_COLUMNS.map((c) => `\`${c}\``).join(', ');
  const placeholders = BSC_TWEET_INSERT_COLUMNS.map(() => '?').join(', ');
  return `INSERT IGNORE INTO \`${TWEET_TABLE}\` (${cols}) VALUES (${placeholders})`;
}

export interface TweetInsert {
  tweet_id: string;
  twitter_id: string;
  content: string;
  tweet_time: Date | string;
  tick: string; // spec §5.1: 必填，社区 tick 或 NO_TICK_SENTINEL
  tags: string | null;
  day_number: number;
  video_link: string | null;
}

export async function insertTweet(t: TweetInsert): Promise<boolean> {
  const values = BSC_TWEET_INSERT_COLUMNS.map((c) => (t as any)[c]);
  const [res] = await pool.execute(buildInsertTweetSql(), values as any);
  return (res as any).affectedRows > 0;
}

// spec §5.1: 线上 schema 核对
export interface BscTweetSchemaCheck {
  hasTweetIdUnique: boolean;
  hasTickNotNull: boolean;
  columns: string[];
  ddl: string;
}

export async function verifyBscTweetSchema(): Promise<BscTweetSchemaCheck> {
  const [rows] = await pool.query<any[]>(`SHOW CREATE TABLE \`${TWEET_TABLE}\``);
  const ddl: string = rows[0]?.['Create Table'] ?? '';
  const columns = [...ddl.matchAll(/^\s+`(\w+)`/gm)].map((m) => m[1]);
  return {
    hasTweetIdUnique: /UNIQUE KEY.*tweet_id/i.test(ddl),
    hasTickNotNull: /`tick`\s+varchar\(32\)\s+NOT\s+NULL/i.test(ddl),
    columns,
    ddl,
  };
}

export const REQUIRED_INSERT_COLUMNS = [...BSC_TWEET_INSERT_COLUMNS];

// ---------- invite（spec §10.1 / §5.2）----------

export interface InviteRow {
  invite_id: string;
  invite_secret_hash: string;
  node_id: string | null;
  status: 'active' | 'used' | 'revoked';
  used_at: Date | null;
  created_at: Date;
}

// spec §5.2: 注册校验 status=active AND node_id IS NULL
export const CONSUME_INVITE_SQL =
  'SELECT * FROM `tds_invite` WHERE invite_secret_hash = ? AND status = ? FOR UPDATE';

export async function createInvite(invite_id: string, invite_secret_hash: string): Promise<void> {
  await pool.execute(
    'INSERT INTO `tds_invite` (invite_id, invite_secret_hash, status) VALUES (?, ?, "active")',
    [invite_id, invite_secret_hash],
  );
}

export interface ConsumeInviteResult {
  ok: boolean;
  invite_id?: string;
}

// spec §10.1: 一次性消费 invite。事务内查 active + 标 used。
export async function consumeInvite(invite_secret: string): Promise<ConsumeInviteResult> {
  const h = hashToken(invite_secret);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute<any[]>(CONSUME_INVITE_SQL, [h, 'active']);
    const invite = rows[0] as InviteRow | undefined;
    if (!invite) {
      await conn.rollback();
      return { ok: false };
    }
    await conn.execute(
      'UPDATE `tds_invite` SET status = "used", used_at = NOW() WHERE invite_id = ?',
      [invite.invite_id],
    );
    await conn.commit();
    return { ok: true, invite_id: invite.invite_id };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

// ---------- node（spec §10.1 / §5.2）----------

export interface NodeRow {
  node_id: string;
  token_hash: string;
  label: string | null;
  status: 'online' | 'offline' | 'cooldown' | 'disabled';
  timezone: string;
  last_heartbeat: Date | null;
  cookie_health: number;
  invite_id: string | null;
  created_at: Date;
}

export interface RegisterNodeInput {
  node_id: string;
  token_hash: string;
  invite_id: string;
  timezone: string;
  label?: string | null;
}

export async function createNode(input: RegisterNodeInput): Promise<void> {
  await pool.execute(
    `INSERT INTO \`tds_node\` (node_id, token_hash, label, status, timezone, cookie_health, invite_id)
     VALUES (?, ?, ?, 'offline', ?, 100, ?)`,
    [input.node_id, input.token_hash, input.label ?? null, input.timezone, input.invite_id],
  );
}

// spec §6: WS hello 鉴权 — 按 token sha256 O(1) 查找
export async function findNodeByToken(node_token: string): Promise<NodeRow | null> {
  const h = hashToken(node_token);
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM `tds_node` WHERE token_hash = ? LIMIT 1',
    [h],
  );
  return (rows[0] as NodeRow) ?? null;
}

export async function findNodeById(node_id: string): Promise<NodeRow | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM `tds_node` WHERE node_id = ? LIMIT 1',
    [node_id],
  );
  return (rows[0] as NodeRow) ?? null;
}

export async function setNodeStatus(
  node_id: string,
  status: NodeRow['status'],
): Promise<void> {
  await pool.execute(
    'UPDATE `tds_node` SET status = ? WHERE node_id = ?',
    [status, node_id],
  );
}

export async function updateHeartbeat(
  node_id: string,
  cookie_status?: string,
): Promise<void> {
  await pool.execute(
    'UPDATE `tds_node` SET last_heartbeat = NOW(), status = "online" WHERE node_id = ?',
    [node_id],
  );
}

export async function listOnlineNodes(): Promise<NodeRow[]> {
  const [rows] = await pool.execute<any[]>(
    "SELECT * FROM `tds_node` WHERE status = 'online'",
  );
  return rows as NodeRow[];
}

