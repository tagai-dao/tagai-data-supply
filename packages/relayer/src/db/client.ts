import { pool } from './pool';
import { TWEET_TABLE } from '../config/constants';

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
