// spec §12: 管理 API（/admin/*，固定 token 鉴权）
import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { issueInvite } from '../auth/tokens';
import { createInvite, listOnlineNodes, setNodeStatus, listInvites } from '../db/client';
import { pool } from '../db/pool';
import {
  createTopic, listTopics, createSubtask, listEnabledSubtasks, setSubtaskEnabled,
  validateSubtaskTick, type CreateSubtaskInput,
} from '../db/tasks';
import { reclaimNodeAssignments, reEnableNode } from '../health/db';
import { logger } from '../utils/logger';
import { asyncHandler } from '../server/middleware/asyncHandler';

export const adminRoutes = Router();

// ---- invite ----
adminRoutes.post('/invites', asyncHandler(async (req, res: Response) => {
  const { label } = req.body ?? {};
  const i = issueInvite();
  await createInvite(i.invite_id, i.invite_secret_hash, label ?? null);
  logger.info({ invite_id: i.invite_id, label: label ?? null }, 'invite created');
  res.json({ c: 0, d: { invite_id: i.invite_id, invite_secret: i.invite_secret, label: label ?? null } });
}));

adminRoutes.get('/invites', asyncHandler(async (_req, res) => {
  const invites = await listInvites();
  res.json({ c: 0, d: invites });
}));

// ---- topic ----
adminRoutes.get('/topics', asyncHandler(async (_req, res) => {
  const topics = await listTopics();
  res.json({ c: 0, d: topics });
}));

adminRoutes.post('/topics', asyncHandler(async (req, res) => {
  const { name, tick } = req.body ?? {};
  if (!name) { res.status(400).json({ c: 1, m: 'name required' }); return; }
  const topic_id = 'topic_' + nanoid(12);
  await createTopic(topic_id, name, tick);
  res.json({ c: 0, d: { topic_id, name, tick: tick ?? 'no-tick-of-tiptag' } });
}));

// 编辑主题（name/tick/enabled，任选字段）
adminRoutes.patch('/topics/:id', asyncHandler(async (req, res) => {
  const { name, tick, enabled } = req.body ?? {};
  const sets: string[] = [];
  const vals: any[] = [];
  if (typeof name === 'string' && name.trim()) { sets.push('name = ?'); vals.push(name.trim()); }
  if (typeof tick === 'string' && tick.trim()) { sets.push('tick = ?'); vals.push(tick.trim()); }
  if (typeof enabled === 'boolean') { sets.push('enabled = ?'); vals.push(enabled ? 1 : 0); }
  if (sets.length === 0) {
    res.status(400).json({ c: 1, m: 'no fields to update' });
    return;
  }
  vals.push(req.params.id);
  await pool.execute(`UPDATE \`bsc_tds_topic\` SET ${sets.join(', ')} WHERE topic_id = ?`, vals);
  res.json({ c: 0, d: { topic_id: req.params.id } });
}));

// ---- subtask ----
adminRoutes.get('/subtasks', asyncHandler(async (_req, res) => {
  const subtasks = await listEnabledSubtasks();
  res.json({ c: 0, d: subtasks });
}));

adminRoutes.post('/subtasks', asyncHandler(async (req, res) => {
  const b = req.body ?? {};
  // spec §5.1: tick 必填
  try {
    validateSubtaskTick(b.tick);
  } catch (e: any) {
    res.status(400).json({ c: 1, m: e.message });
    return;
  }
  const input: CreateSubtaskInput = {
    subtask_id: 'st_' + nanoid(12),
    topic_id: b.topic_id,
    type: b.type,
    mode: b.mode ?? 'continuous',
    params: b.params ?? {},
    tick: b.tick,
    priority: b.priority ?? 5,
    schedule_cron: b.schedule_cron ?? null,
    window_minutes: b.window_minutes ?? null,
  };
  if (!input.topic_id || !input.type) {
    res.status(400).json({ c: 1, m: 'topic_id and type required' });
    return;
  }
  await createSubtask(input);
  logger.info({ subtask_id: input.subtask_id, tick: input.tick }, 'subtask created');
  res.json({ c: 0, d: input });
}));

adminRoutes.patch('/subtasks/:id', asyncHandler(async (req, res) => {
  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    res.status(400).json({ c: 1, m: 'enabled (bool) required' });
    return;
  }
  await setSubtaskEnabled(req.params.id, enabled);
  res.json({ c: 0, d: { subtask_id: req.params.id, enabled } });
}));

// ---- node ----
adminRoutes.get('/nodes', asyncHandler(async (_req, res) => {
  const [rows] = await pool.execute(
    'SELECT node_id, label, status, timezone, cookie_health, last_heartbeat, created_at FROM `bsc_tds_node` ORDER BY created_at DESC',
  );
  res.json({ c: 0, d: rows });
}));

adminRoutes.post('/nodes/:id/reclaim', asyncHandler(async (req, res) => {
  const n = await reclaimNodeAssignments(req.params.id);
  res.json({ c: 0, d: { node_id: req.params.id, reclaimed: n } });
}));

adminRoutes.post('/nodes/:id/reenable', asyncHandler(async (req, res) => {
  await reEnableNode(req.params.id);
  res.json({ c: 0, d: { node_id: req.params.id, status: 'online' } });
}));

adminRoutes.post('/nodes/:id/disable', asyncHandler(async (req, res) => {
  await setNodeStatus(req.params.id, 'disabled');
  await reclaimNodeAssignments(req.params.id);
  res.json({ c: 0, d: { node_id: req.params.id, status: 'disabled' } });
}));

// ---- 数据状态 ----
adminRoutes.get('/stats', asyncHandler(async (_req, res) => {
  const [nodes] = await pool.execute<any[]>(
    "SELECT status, COUNT(*) AS cnt FROM `bsc_tds_node` GROUP BY status",
  );
  const [tweets] = await pool.execute<any[]>(
    'SELECT COUNT(*) AS cnt FROM `bsc_tds_tweet_raw`',
  );
  const [promoted] = await pool.execute<any[]>(
    "SELECT COUNT(*) AS cnt FROM `bsc_tds_tweet_raw` WHERE promoted = 1",
  );
  const [assignments] = await pool.execute<any[]>(
    "SELECT status, COUNT(*) AS cnt FROM `bsc_tds_assignment` GROUP BY status",
  );
  res.json({
    c: 0,
    d: {
      nodes: Object.fromEntries(nodes.map((r: any) => [r.status, r.cnt])),
      raw_total: tweets[0]?.cnt ?? 0,
      promoted: promoted[0]?.cnt ?? 0,
      assignments: Object.fromEntries(assignments.map((r: any) => [r.status, r.cnt])),
    },
  });
}));
