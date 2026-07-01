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
     (tweet_id, twitter_id, content, tweet_time, node_id, tagai_account, tagai_account_type, topic_id, subtask_id, tick, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [p.tweet_id, p.twitter_id, p.content, p.tweet_time, p.node_id, p.tagai_account,
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
