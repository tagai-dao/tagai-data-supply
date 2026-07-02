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

// reply 已在 bsc_relation_reply（reply_id = 推文 id）→ 无需再进 pending
export async function replyExistsInBscRelationReply(reply_id: string): Promise<boolean> {
  const [rows] = await pool.execute<any[]>(
    'SELECT 1 FROM `bsc_relation_reply` WHERE reply_id = ? LIMIT 1',
    [reply_id],
  );
  return rows.length > 0;
}

export interface PendingTweet {
  tweet_id: string;
  kind?: 'post' | 'reply';
  tweet_type?: 'original' | 'quote' | 'reply';
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
  retweet_id?: string | null;
  retweet_info?: string | null;
  conversation_id?: string | null;
  parent_tweet_id?: string | null;
  parent_twitter_id?: string | null;
  parent_twitter_username?: string | null;
  parent_twitter_name?: string | null;
  parent_profile?: string | null;
  parent_followers?: number | null;
  parent_followings?: number | null;
  parent_tweet_count?: number | null;
  parent_like_count?: number | null;
  parent_listed_count?: number | null;
  parent_verified?: boolean | number | null;
  parent_content?: string | null;
  parent_raw_payload?: string | null;
  parent_tweet_time?: Date | string | null;
  tweet_time: Date | string;
  node_id: string;
  tagai_account: string;
  tagai_account_type: number;
  topic_id: string | null;
  subtask_id: string | null;
  tick: string;
}

function toBoolInt(v: boolean | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v ? 1 : 0;
}

function toJsonText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

// spec §4.2: 写 pending 表（UNIQUE tweet_id 兜底，INSERT IGNORE）
export async function insertPendingTweet(p: PendingTweet): Promise<boolean> {
  const [res] = await pool.execute(
    `INSERT IGNORE INTO \`bsc_tds_pending_tweet\`
     (tweet_id, kind, tweet_type, twitter_id, twitter_username, twitter_name, profile,
      followers, followings, tweet_count, like_count, listed_count, verified,
      content, retweet_id, retweet_info, conversation_id,
      parent_tweet_id, parent_twitter_id, parent_twitter_username, parent_twitter_name, parent_profile,
      parent_followers, parent_followings, parent_tweet_count, parent_like_count, parent_listed_count, parent_verified,
      parent_content, parent_raw_payload, parent_tweet_time,
      tweet_time, node_id, tagai_account, tagai_account_type, topic_id, subtask_id, tick, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      p.tweet_id,
      p.kind ?? 'post',
      p.tweet_type ?? 'original',
      p.twitter_id,
      p.twitter_username ?? null,
      p.twitter_name ?? null,
      p.profile ?? null,
      p.followers ?? null,
      p.followings ?? null,
      p.tweet_count ?? null,
      p.like_count ?? null,
      p.listed_count ?? null,
      toBoolInt(p.verified),
      p.content,
      p.retweet_id ?? null,
      p.retweet_info ?? null,
      p.conversation_id ?? null,
      p.parent_tweet_id ?? null,
      p.parent_twitter_id ?? null,
      p.parent_twitter_username ?? null,
      p.parent_twitter_name ?? null,
      p.parent_profile ?? null,
      p.parent_followers ?? null,
      p.parent_followings ?? null,
      p.parent_tweet_count ?? null,
      p.parent_like_count ?? null,
      p.parent_listed_count ?? null,
      toBoolInt(p.parent_verified),
      p.parent_content ?? null,
      p.parent_raw_payload ?? null,
      p.parent_tweet_time ?? null,
      p.tweet_time,
      p.node_id,
      p.tagai_account,
      p.tagai_account_type,
      p.topic_id,
      p.subtask_id,
      p.tick,
    ],
  );
  return (res as any).affectedRows > 0;
}

/** 从 Node 上报字段构造 pending 行 */
export function mapIncomingToPending(
  tw: Record<string, unknown>,
  ctx: { node_id: string; tagai_account: string; tagai_account_type: number; topic_id: string | null; subtask_id: string; tick: string },
  toTweetTime: (t: unknown) => Date | string,
): PendingTweet {
  const kind = (tw.kind === 'reply' ? 'reply' : 'post') as 'post' | 'reply';
  const tweetType = typeof tw.tweet_type === 'string' ? tw.tweet_type : 'original';
  return {
    tweet_id: String(tw.tweet_id),
    kind,
    tweet_type: (tweetType === 'quote' || tweetType === 'reply' ? tweetType : 'original') as PendingTweet['tweet_type'],
    twitter_id: String(tw.twitter_id ?? ''),
    twitter_username: tw.twitter_username != null ? String(tw.twitter_username) : null,
    twitter_name: tw.twitter_name != null ? String(tw.twitter_name) : null,
    profile: tw.profile != null ? String(tw.profile) : null,
    followers: tw.followers != null ? Number(tw.followers) : null,
    followings: tw.followings != null ? Number(tw.followings) : null,
    tweet_count: tw.tweet_count != null ? Number(tw.tweet_count) : null,
    like_count: tw.like_count != null ? Number(tw.like_count) : null,
    listed_count: tw.listed_count != null ? Number(tw.listed_count) : null,
    verified: tw.verified as boolean | number | null,
    content: String(tw.content ?? ''),
    retweet_id: tw.retweet_id != null ? String(tw.retweet_id) : null,
    retweet_info: tw.retweet_info != null ? String(tw.retweet_info) : null,
    conversation_id: tw.conversation_id != null ? String(tw.conversation_id) : null,
    parent_tweet_id: tw.parent_tweet_id != null ? String(tw.parent_tweet_id) : null,
    parent_twitter_id: tw.parent_twitter_id != null ? String(tw.parent_twitter_id) : null,
    parent_twitter_username: tw.parent_twitter_username != null ? String(tw.parent_twitter_username) : null,
    parent_twitter_name: tw.parent_twitter_name != null ? String(tw.parent_twitter_name) : null,
    parent_profile: tw.parent_profile != null ? String(tw.parent_profile) : null,
    parent_followers: tw.parent_followers != null ? Number(tw.parent_followers) : null,
    parent_followings: tw.parent_followings != null ? Number(tw.parent_followings) : null,
    parent_tweet_count: tw.parent_tweet_count != null ? Number(tw.parent_tweet_count) : null,
    parent_like_count: tw.parent_like_count != null ? Number(tw.parent_like_count) : null,
    parent_listed_count: tw.parent_listed_count != null ? Number(tw.parent_listed_count) : null,
    parent_verified: tw.parent_verified as boolean | number | null,
    parent_content: tw.parent_content != null ? String(tw.parent_content) : null,
    parent_raw_payload: toJsonText(tw.parent_raw_payload),
    parent_tweet_time: tw.parent_tweet_time != null ? toTweetTime(tw.parent_tweet_time) : null,
    tweet_time: toTweetTime(tw.tweet_time),
    node_id: ctx.node_id,
    tagai_account: ctx.tagai_account,
    tagai_account_type: ctx.tagai_account_type,
    topic_id: ctx.topic_id,
    subtask_id: ctx.subtask_id,
    tick: ctx.tick,
  };
}

// 写 all_tweets 原始备份（spec §4.2，不去重，沿用 tiptag 行为）
// content 存 Twitter API v2 JSON 字符串（data + includes），与 twitter.ts storeTweetToDb 一致
export function buildAllTweetsContent(tw: {
  tweet_id: string;
  twitter_id?: string | null;
  content?: string | null;
  tweet_time?: string | number | Date | null;
  raw_payload?: unknown;
  twitter_username?: string | null;
  twitter_name?: string | null;
  profile?: string | null;
  followers?: number | null;
  followings?: number | null;
  tweet_count?: number | null;
  like_count?: number | null;
  listed_count?: number | null;
  verified?: boolean | number | null;
}): string {
  if (tw.raw_payload != null) {
    if (typeof tw.raw_payload === 'string') return tw.raw_payload;
    return JSON.stringify(tw.raw_payload);
  }
  const createdAt = tw.tweet_time instanceof Date
    ? tw.tweet_time.toISOString()
    : tw.tweet_time != null
      ? String(tw.tweet_time)
      : new Date().toISOString();
  const authorId = String(tw.twitter_id ?? '');
  return JSON.stringify({
    data: {
      id: tw.tweet_id,
      text: String(tw.content ?? ''),
      author_id: authorId,
      conversation_id: tw.tweet_id,
      created_at: createdAt,
      edit_history_tweet_ids: [tw.tweet_id],
      entities: {},
      geo: {},
      article: {},
      attachments: {},
    },
    includes: {
      users: authorId ? [{
        id: authorId,
        name: tw.twitter_name ?? tw.twitter_username ?? authorId,
        username: tw.twitter_username ?? authorId,
        profile_image_url: tw.profile ?? '',
        public_metrics: {
          followers_count: tw.followers ?? 0,
          following_count: tw.followings ?? 0,
          tweet_count: tw.tweet_count ?? 0,
          listed_count: tw.listed_count ?? 0,
          like_count: tw.like_count ?? 0,
          media_count: 0,
        },
        verified: Boolean(tw.verified),
      }] : [],
      tweets: [],
    },
  });
}

export async function backupToAllTweets(tweet_id: string, content: string): Promise<void> {
  await pool.execute(
    'INSERT IGNORE INTO `all_tweets` (tweet_id, content) VALUES (?, ?)',
    [tweet_id, content],
  ).catch((e: any) => logger.warn({ err: e?.message, tweet_id }, 'backupToAllTweets failed'));
}

export async function listPending(status: number | null, limit = 100, offset = 0): Promise<any[]> {
  const sql = status !== null
    ? 'SELECT * FROM `bsc_tds_pending_tweet` WHERE status = ? ORDER BY id DESC LIMIT ? OFFSET ?'
    : 'SELECT * FROM `bsc_tds_pending_tweet` ORDER BY id DESC LIMIT ? OFFSET ?';
  const params = status !== null ? [status, limit, offset] : [limit, offset];
  const [rows] = await pool.query(sql, params);
  return rows as any[];
}

export async function retryPending(id: number): Promise<boolean> {
  const [res] = await pool.execute(
    "UPDATE `bsc_tds_pending_tweet` SET status = 0, last_error = NULL, retry_count = 0 WHERE id = ? AND status = 3",
    [id],
  );
  return (res as any).affectedRows > 0;
}
