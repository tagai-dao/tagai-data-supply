import { pool } from './pool';
import { NO_TICK_SENTINEL } from '../config/constants';

// spec §7 / §5.2: topic 与 subtask CRUD

export interface TopicRow {
  topic_id: string;
  name: string;
  enabled: number;
  tick: string;
  created_at: Date;
}

export interface SubtaskRow {
  subtask_id: string;
  topic_id: string;
  type: 'hashtag' | 'user_timeline' | 'keyword' | 'list';
  mode: 'continuous' | 'round';
  params: any;
  cursor: string | null;
  cursor_owner_node: string | null;
  watermark_tweet_id: string | null;
  schedule_cron: string | null;
  window_minutes: number | null;
  priority: number;
  tick: string;
  enabled: number;
  created_at: Date;
}

export interface AssignmentRow {
  assignment_id: string;
  subtask_id: string;
  node_id: string;
  assigned_at: Date;
  status: 'assigned' | 'running' | 'done' | 'failed' | 'reclaimed' | 'declined';
  last_run_at: Date | null;
  result_summary: any;
  accepted_count: number;
}

// ---------- topic ----------

export async function createTopic(topic_id: string, name: string, tick: string = NO_TICK_SENTINEL): Promise<void> {
  await pool.execute(
    'INSERT INTO `bsc_tds_topic` (topic_id, name, enabled, tick) VALUES (?, ?, 1, ?)',
    [topic_id, name, tick],
  );
}

export async function listTopics(): Promise<TopicRow[]> {
  const [rows] = await pool.execute<any[]>('SELECT * FROM `bsc_tds_topic` ORDER BY created_at');
  return rows as TopicRow[];
}

// ---------- subtask ----------

export interface CreateSubtaskInput {
  subtask_id: string;
  topic_id: string;
  type: SubtaskRow['type'];
  mode: SubtaskRow['mode'];
  params: object;
  tick: string;                // spec §5.1: 必填
  priority?: number;
  schedule_cron?: string | null;
  window_minutes?: number | null;
}

// spec §5.1: 创建 subtask 必填 tick（空则拒绝）
export function validateSubtaskTick(tick: string | undefined | null): string {
  if (!tick || !String(tick).trim()) {
    throw new Error('tick is required (spec §5.1): 指定归属社区或 no-tick-of-tiptag');
  }
  return String(tick).trim();
}

export async function createSubtask(input: CreateSubtaskInput): Promise<void> {
  const tick = validateSubtaskTick(input.tick);
  await pool.execute(
    `INSERT INTO \`bsc_tds_subtask\`
     (subtask_id, topic_id, type, mode, params, priority, tick, schedule_cron, window_minutes, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    [
      input.subtask_id,
      input.topic_id,
      input.type,
      input.mode,
      JSON.stringify(input.params),
      input.priority ?? 5,
      tick,
      input.schedule_cron ?? null,
      input.window_minutes ?? null,
    ],
  );
}

export async function listEnabledSubtasks(): Promise<SubtaskRow[]> {
  // 联动 topic.enabled：主题禁用时其下子任务也不派发（spec §7 配置驱动）
  const [rows] = await pool.execute<any[]>(
    `SELECT s.* FROM \`bsc_tds_subtask\` s
     INNER JOIN \`bsc_tds_topic\` t ON s.topic_id = t.topic_id
     WHERE s.enabled = 1 AND t.enabled = 1
     ORDER BY s.priority DESC, s.created_at`,
  );
  return rows.map(normalizeSubtask);
}

export async function getSubtask(subtask_id: string): Promise<SubtaskRow | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM `bsc_tds_subtask` WHERE subtask_id = ? LIMIT 1',
    [subtask_id],
  );
  return rows[0] ? normalizeSubtask(rows[0]) : null;
}

function normalizeSubtask(r: any): SubtaskRow {
  return { ...r, params: typeof r.params === 'string' ? JSON.parse(r.params) : r.params };
}

// spec §5.3: 游标持久化（与 assignment 状态变更同事务由调用方保证）
// 注意：cursor 是 MySQL 保留字，必须反引号
// 已废弃：Twitter 分页游标不再持久化；保留函数仅供历史数据/手工运维。
export async function updateSubtaskCursor(subtask_id: string, cursor: string | null, owner_node: string | null): Promise<void> {
  await pool.execute(
    'UPDATE `bsc_tds_subtask` SET `cursor` = ?, cursor_owner_node = ? WHERE subtask_id = ?',
    [cursor, owner_node, subtask_id],
  );
}

/** 更新 subtask watermark（仅当新 tweet_id 更大时推进） */
export async function updateSubtaskWatermark(subtask_id: string, tweet_id: string): Promise<void> {
  if (!tweet_id || !/^\d{15,20}$/.test(tweet_id)) return;
  await pool.execute(
    `UPDATE \`bsc_tds_subtask\`
     SET watermark_tweet_id = ?
     WHERE subtask_id = ?
       AND (watermark_tweet_id IS NULL OR CAST(watermark_tweet_id AS UNSIGNED) < CAST(? AS UNSIGNED))`,
    [tweet_id, subtask_id, tweet_id],
  );
}

export async function setSubtaskEnabled(subtask_id: string, enabled: boolean): Promise<void> {
  await pool.execute(
    'UPDATE `bsc_tds_subtask` SET enabled = ? WHERE subtask_id = ?',
    [enabled ? 1 : 0, subtask_id],
  );
}

// ---------- assignment ----------

export async function createAssignment(assignment_id: string, subtask_id: string, node_id: string): Promise<void> {
  await pool.execute(
    `INSERT INTO \`bsc_tds_assignment\` (assignment_id, subtask_id, node_id, status, last_run_at)
     VALUES (?, ?, ?, 'assigned', NOW())`,
    [assignment_id, subtask_id, node_id],
  );
}

export async function setAssignmentStatus(assignment_id: string, status: AssignmentRow['status'], summary?: object): Promise<void> {
  await pool.execute(
    'UPDATE `bsc_tds_assignment` SET status = ?, result_summary = ? WHERE assignment_id = ?',
    [status, summary ? JSON.stringify(summary) : null, assignment_id],
  );
}

// spec §8.1: 节点是否有在执行的任务（单节点串行）
export async function getNodeActiveAssignment(node_id: string): Promise<AssignmentRow | null> {
  const [rows] = await pool.execute<any[]>(
    "SELECT * FROM `bsc_tds_assignment` WHERE node_id = ? AND status IN ('assigned','running') ORDER BY assigned_at DESC LIMIT 1",
    [node_id],
  );
  return (rows[0] as AssignmentRow) ?? null;
}

export async function getAssignmentById(assignment_id: string): Promise<AssignmentRow | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT * FROM `bsc_tds_assignment` WHERE assignment_id = ? LIMIT 1',
    [assignment_id],
  );
  return (rows[0] as AssignmentRow) ?? null;
}

export async function addAssignmentAcceptedCount(assignment_id: string, delta: number): Promise<number> {
  await pool.execute(
    'UPDATE `bsc_tds_assignment` SET accepted_count = accepted_count + ? WHERE assignment_id = ?',
    [delta, assignment_id],
  );
  const row = await getAssignmentById(assignment_id);
  return row?.accepted_count ?? 0;
}

export async function getAssignmentBySubtaskAndNode(subtask_id: string, node_id: string): Promise<AssignmentRow | null> {
  const [rows] = await pool.execute<any[]>(
    "SELECT * FROM `bsc_tds_assignment` WHERE subtask_id = ? AND node_id = ? AND status IN ('assigned','running') LIMIT 1",
    [subtask_id, node_id],
  );
  return (rows[0] as AssignmentRow) ?? null;
}

// spec §8.1: 公平轮转 — 取各 subtask 最近 last_run_at
export async function getSubtaskLastRunMap(): Promise<Map<string, Date | null>> {
  const [rows] = await pool.execute<any[]>(
    "SELECT subtask_id, MAX(last_run_at) AS last_run FROM `bsc_tds_assignment` GROUP BY subtask_id",
  );
  const m = new Map<string, Date | null>();
  for (const r of rows) m.set(r.subtask_id, r.last_run ?? null);
  return m;
}
