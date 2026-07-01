// spec §4/§5/§13: 回传数据处理
// 流程：校验 assignment → 先查 bsc_tweet → 写 pending 表 + all_tweets 备份 → 推进 watermark → metrics

import { pool } from '../db/pool';
import { findNodeById } from '../db/client';
import {
  getSubtask, setAssignmentStatus, addAssignmentAcceptedCount,
  updateSubtaskWatermark,
} from '../db/tasks';
import { tweetExistsInBscTweet, insertPendingTweet, backupToAllTweets } from '../db/pending';
import { NO_TICK_SENTINEL, ASSIGNMENT_MAX_TWEETS } from '../config/constants';
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
  assignment_id: string;
  status: 'done' | 'failed';
  tweets?: IncomingTweet[];
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

function toOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toOptionalBool(v: unknown): boolean | null {
  if (v == null) return null;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return null;
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
  skipped: number;
  watermarkAdvanced: boolean;
}

export async function ingestTaskResult(input: TaskResultInput): Promise<IngestResult> {
  const subtask = await getSubtask(input.subtask_id);
  if (!subtask) {
    logger.warn({ subtask_id: input.subtask_id }, 'task_result for unknown subtask');
    return { received: 0, promoted: 0, deduped: 0, invalid: 0, skipped: 0, watermarkAdvanced: false };
  }
  const tick = subtask.tick || NO_TICK_SENTINEL;
  // spec §4.3: 按 node_id 取绑定 tagai 账号
  const node = await findNodeById(input.node_id);
  const tagaiAccount = node?.tagai_account ?? null;
  const tagaiAccountType = node?.tagai_account_type ?? null;

  let received = 0, promoted = 0, deduped = 0, invalid = 0, skipped = 0;

  if (input.status === 'done' && input.tweets) {
    for (const tw of input.tweets) {
      received++;
      if (!isValidTweetId(tw.tweet_id)) { invalid++; continue; }

      // spec §4.3: node 无绑定账号 → 跳过（无法策展）
      if (!tagaiAccount || tagaiAccountType === null) {
        skipped++;
        logger.warn({ node_id: input.node_id, tweet_id: tw.tweet_id }, 'node has no tagai account, skip');
        continue;
      }

      // spec §4.2: 先查 bsc_tweet 是否已存在
      if (await tweetExistsInBscTweet(tw.tweet_id)) { deduped++; continue; }

      // 写 pending 表 + all_tweets 备份
      const inserted = await insertPendingTweet({
        tweet_id: tw.tweet_id,
        twitter_id: String(tw.twitter_id ?? ''),
        twitter_username: tw.twitter_username != null ? String(tw.twitter_username) : null,
        twitter_name: tw.twitter_name != null ? String(tw.twitter_name) : null,
        profile: tw.profile != null ? String(tw.profile) : null,
        followers: toOptionalInt(tw.followers),
        followings: toOptionalInt(tw.followings),
        tweet_count: toOptionalInt(tw.tweet_count),
        like_count: toOptionalInt(tw.like_count),
        listed_count: toOptionalInt(tw.listed_count),
        verified: toOptionalBool(tw.verified),
        content: String(tw.content ?? ''),
        tweet_time: toTweetTime(tw.tweet_time),
        node_id: input.node_id,
        tagai_account: tagaiAccount,
        tagai_account_type: tagaiAccountType,
        topic_id: subtask.topic_id ?? null,
        subtask_id: input.subtask_id,
        tick,
      });
      if (inserted) {
        promoted++;
        await backupToAllTweets(tw.tweet_id, String(tw.content ?? ''));
      } else {
        deduped++;  // pending UNIQUE 兜底
      }
    }
  }

  // watermark：用本批有效 tweet 中最大的 tweet_id 推进 subtask 前沿（各 Node 下次从最新开始抓）
  let watermarkAdvanced = false;
  if (input.status === 'done' && input.tweets?.length) {
    let maxId: string | null = null;
    for (const tw of input.tweets) {
      if (!isValidTweetId(tw.tweet_id)) continue;
      if (!maxId || BigInt(tw.tweet_id) > BigInt(maxId)) {
        maxId = tw.tweet_id;
      }
    }
    if (maxId) {
      await updateSubtaskWatermark(input.subtask_id, maxId);
      watermarkAdvanced = true;
    }
  }

  // assignment 累计入库计数（仅 promoted 计入 quota）
  let acceptedTotal = 0;
  if (promoted > 0) {
    acceptedTotal = await addAssignmentAcceptedCount(input.assignment_id, promoted);
  }

  const summary = { count: received, promoted, deduped, invalid, skipped, error: input.error, accepted_total: acceptedTotal };
  const assignmentDone =
    input.status === 'failed'
    || input.status === 'done'
    || acceptedTotal >= ASSIGNMENT_MAX_TWEETS;
  await setAssignmentStatus(
    input.assignment_id,
    assignmentDone ? (input.status === 'failed' ? 'failed' : 'done') : 'running',
    summary,
  );

  // metrics（best-effort）；fetched_count 语义：加入 pending 队列数（promoted）
  await bumpMetric(input.node_id, promoted, deduped, input.status === 'failed' ? 1 : 0).catch(() => {});

  logger.info(
    {
      subtask_id: input.subtask_id,
      assignment_id: input.assignment_id,
      node_id: input.node_id,
      received,
      promoted,
      deduped,
      invalid,
      skipped,
      acceptedTotal,
      watermarkAdvanced,
    },
    'task_result ingested',
  );
  return { received, promoted, deduped, invalid, skipped, watermarkAdvanced };
}

async function bumpMetric(node_id: string, promoted: number, deduped: number, errors: number): Promise<void> {
  await pool.execute(
    `INSERT INTO \`bsc_tds_node_metric\` (node_id, date, fetched_count, deduped_count, error_count)
     VALUES (?, CURRENT_DATE, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       fetched_count = fetched_count + VALUES(fetched_count),
       deduped_count = deduped_count + VALUES(deduped_count),
       error_count = error_count + VALUES(error_count)`,
    [node_id, promoted, deduped, errors],
  );
}
