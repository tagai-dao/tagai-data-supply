import { pool } from './pool';
import { logger } from '../utils/logger';

// spec §4.2: 先查 bsc_tweet 是否已存在
export async function tweetExistsInBscTweet(tweet_id: string): Promise<boolean> {
  const [rows] = await pool.execute<any[]>(
    'SELECT 1 FROM `bsc_tweet` WHERE tweet_id = ? LIMIT 1',
    [tweet_id],
  );
  return rows.length > 0;
}

export interface PendingTweet {
  tweet_id: string;
  twitter_id: string;
  twitter_username?: string | null;
  twitter_name?: string | null;
  profile?: string | null;
  followers?: number | null;
  followings?: number | null;
  tweet_count?: number | null;
  like_count?: number | null;
  listed_count?: number | null;
  verified?: boolean | number | null;
  content: string;
  tweet_time: Date | string;
  node_id: string;
  tagai_account: string;
  tagai_account_type: number;
  topic_id: string | null;
  subtask_id: string | null;
  tick: string;
}

// spec §4.2: 写 pending 表（UNIQUE tweet_id 兜底，INSERT IGNORE）
export async function insertPendingTweet(p: PendingTweet): Promise<boolean> {
  const [res] = await pool.execute(
    `INSERT IGNORE INTO \`bsc_tds_pending_tweet\`
     (tweet_id, twitter_id, twitter_username, twitter_name, profile, followers, followings, tweet_count, like_count, listed_count, verified, content, tweet_time, node_id, tagai_account, tagai_account_type, topic_id, subtask_id, tick, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [p.tweet_id, p.twitter_id, p.twitter_username ?? null, p.twitter_name ?? null, p.profile ?? null,
     p.followers ?? null, p.followings ?? null, p.tweet_count ?? null, p.like_count ?? null,
     p.listed_count ?? null, p.verified == null ? null : (p.verified ? 1 : 0),
     p.content, p.tweet_time, p.node_id, p.tagai_account,
     p.tagai_account_type, p.topic_id, p.subtask_id, p.tick],
  );
  return (res as any).affectedRows > 0;
}

// 写 all_tweets 原始备份（spec §4.2，不去重，沿用 tiptag 行为）
export async function backupToAllTweets(tweet_id: string, content: string): Promise<void> {
  await pool.execute(
    'INSERT IGNORE INTO `all_tweets` (tweet_id, content) VALUES (?, ?)',
    [tweet_id, content],
  ).catch((e: any) => logger.warn({ err: e?.message, tweet_id }, 'backupToAllTweets failed'));
}

// 查 pending 行（按 status 过滤，分页）
export async function listPending(status: number | null, limit = 100, offset = 0): Promise<any[]> {
  const sql = status !== null
    ? 'SELECT * FROM `bsc_tds_pending_tweet` WHERE status = ? ORDER BY id DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM `bsc_tds_pending_tweet` ORDER BY id DESC LIMIT ? OFFSET ?';
  const params = status !== null ? [status, limit, offset] : [limit, offset];
  const [rows] = await pool.query(sql, params);
  return rows as any[];
}

// 重试：回 status=0，重置 retry_count=0 + 清 last_error
export async function retryPending(id: number): Promise<boolean> {
  const [res] = await pool.execute(
    "UPDATE `bsc_tds_pending_tweet` SET status = 0, last_error = NULL, retry_count = 0 WHERE id = ? AND status = 3",
    [id],
  );
  return (res as any).affectedRows > 0;
}
