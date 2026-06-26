// spec §4/§5/§13: 回传数据处理
// 流程：raw 留痕 → 校验 → 事务内 INSERT IGNORE bsc_tweet + promote 标记 → 更新游标 → metrics
// 数据真实性：先入 tds_tweet_raw，过校验门再 promote（spec §13）

import { pool } from '../db/pool';
import { insertTweet, type TweetInsert } from '../db/client';
import { getSubtask, updateSubtaskCursor, setAssignmentStatus } from '../db/tasks';
import { NO_TICK_SENTINEL } from '../config/constants';
import { logger } from '../utils/logger';

export interface IncomingTweet {
  tweet_id: string;
  twitter_id: string;
  content: string;
  tweet_time: string | number | null;
  tags?: string | null;
  video_link?: string | null;
  [k: string]: unknown;
}

export interface TaskResultInput {
  subtask_id: string;
  node_id: string;
  assignment_id?: string;
  status: 'done' | 'failed';
  tweets?: IncomingTweet[];
  next_cursor?: string | null;
  error?: string;
  cookie_status?: string;
}

// spec §13: tweet_id 合法性校验（snowflake 数字字符串）
export function isValidTweetId(id: unknown): boolean {
  return typeof id === 'string' && /^\d{15,20}$/.test(id);
}

// spec §5.1: day_number 计算（沿用 tiptag 约定：自某基准日的天数）
// tiptag 用 day_number 标识日期分组。这里用 YYYYMMDD 整数。
export function dayNumber(d: Date = new Date()): number {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return y * 10000 + m * 100 + day;
}

function toTweetTime(t: IncomingTweet['tweet_time']): Date | string {
  if (t == null) return new Date();
  if (typeof t === 'number') {
    // 秒 or 毫秒
    return t > 1e12 ? new Date(t) : new Date(t * 1000);
  }
  return t;
}

export interface IngestResult {
  received: number;
  promoted: number;
  deduped: number;
  invalid: number;
  cursorAdvanced: boolean;
}

export async function ingestTaskResult(input: TaskResultInput): Promise<IngestResult> {
  const subtask = await getSubtask(input.subtask_id);
  if (!subtask) {
    logger.warn({ subtask_id: input.subtask_id }, 'task_result for unknown subtask');
    return { received: 0, promoted: 0, deduped: 0, invalid: 0, cursorAdvanced: false };
  }
  const tick = subtask.tick || NO_TICK_SENTINEL;

  let received = 0, promoted = 0, deduped = 0, invalid = 0;

  if (input.status === 'done' && input.tweets) {
    for (const tw of input.tweets) {
      received++;
      // spec §13: 校验
      if (!isValidTweetId(tw.tweet_id)) {
        invalid++;
        continue;
      }
      // spec §5.1: raw 留痕
      await storeRaw(input.subtask_id, input.node_id, tw);

      // spec §13: promote 到 bsc_tweet（INSERT IGNORE 终判去重）
      const insert: TweetInsert = {
        tweet_id: tw.tweet_id,
        twitter_id: String(tw.twitter_id ?? ''),
        content: String(tw.content ?? ''),
        tweet_time: toTweetTime(tw.tweet_time),
        tick,
        tags: tw.tags ?? null,
        day_number: dayNumber(),
        video_link: tw.video_link ?? null,
      };
      const ok = await insertTweet(insert);
      if (ok) promoted++;
      else deduped++;
      await markRawPromoted(tw.tweet_id);
    }
  }

  // spec §5.3: 游标推进（continuous）
  let cursorAdvanced = false;
  if (input.status === 'done' && input.next_cursor) {
    await updateSubtaskCursor(input.subtask_id, String(input.next_cursor), input.node_id);
    cursorAdvanced = true;
  }

  // 更新 assignment 状态
  if (input.assignment_id) {
    await setAssignmentStatus(
      input.assignment_id,
      input.status === 'done' ? 'done' : 'failed',
      { count: received, promoted, deduped, invalid, error: input.error },
    );
  }

  // metrics（best-effort）
  await bumpMetric(input.node_id, promoted, deduped, input.status === 'failed' ? 1 : 0).catch(() => {});

  logger.info(
    { subtask_id: input.subtask_id, node_id: input.node_id, received, promoted, deduped, invalid, cursorAdvanced },
    'task_result ingested',
  );
  return { received, promoted, deduped, invalid, cursorAdvanced };
}

async function storeRaw(subtask_id: string, node_id: string, tw: IncomingTweet): Promise<void> {
  await pool.execute(
    'INSERT INTO `tds_tweet_raw` (subtask_id, node_id, tweet_id, raw_json, promoted) VALUES (?, ?, ?, ?, 0)',
    [subtask_id, node_id, tw.tweet_id, JSON.stringify(tw)],
  );
}

async function markRawPromoted(tweet_id: string): Promise<void> {
  await pool.execute(
    'UPDATE `tds_tweet_raw` SET promoted = 1 WHERE tweet_id = ? AND promoted = 0',
    [tweet_id],
  );
}

async function bumpMetric(node_id: string, promoted: number, deduped: number, errors: number): Promise<void> {
  // upsert 当日 metric
  await pool.execute(
    `INSERT INTO \`tds_node_metric\` (node_id, date, fetched_count, deduped_count, error_count)
     VALUES (?, CURRENT_DATE, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       fetched_count = fetched_count + VALUES(fetched_count),
       deduped_count = deduped_count + VALUES(deduped_count),
       error_count = error_count + VALUES(error_count)`,
    [node_id, promoted, deduped, errors],
  );
}
