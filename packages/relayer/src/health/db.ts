// spec §5.4/§9/§10.2: cookie 健康的 DB 应用 + 任务回收 + 清理
import { pool } from '../db/pool';
import { applyEvent, reEnableHealth, type CookieEvent, type HealthState } from './index';
import { logger } from '../utils/logger';
import { TASK_MAX_RETRIES, RETENTION } from '../config/constants';

// 读取节点健康状态（从 DB 重建内存视图）
export async function getNodeHealth(node_id: string): Promise<HealthState | null> {
  const [rows] = await pool.execute<any[]>(
    'SELECT cookie_health, status FROM `tds_node` WHERE node_id = ?',
    [node_id],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    cookie_health: r.cookie_health,
    status: r.status,
    cooldown_until: null,
    consecutive_errors: 0,
  };
}

// spec §5.4: 应用 cookie 事件 → 更新 DB + 写日志 + 告警
export async function applyCookieEvent(node_id: string, event: CookieEvent, detail?: string): Promise<void> {
  const state = await getNodeHealth(node_id);
  if (!state) return;
  const now = Date.now();
  const upd = applyEvent(state, event, now);

  await pool.execute(
    'UPDATE `tds_node` SET cookie_health = ?, status = ? WHERE node_id = ?',
    [upd.health, upd.status, node_id],
  );
  await pool.execute(
    'INSERT INTO `tds_cookie_health_log` (node_id, event, detail) VALUES (?, ?, ?)',
    [node_id, event, detail ?? null],
  ).catch(() => {});

  if (upd.alert) {
    logger.warn({ node_id, event, alert: upd.alert }, 'cookie health alert');
    await emitAlert(node_id, upd.alert).catch(() => {});
  }

  // auth_failed / disabled → 回收该节点未完成任务（spec §10.2）
  if (upd.status === 'disabled') {
    await reclaimNodeAssignments(node_id);
  }
}

// spec §9: re-enable
export async function reEnableNode(node_id: string): Promise<void> {
  const upd = reEnableHealth();
  await pool.execute(
    'UPDATE `tds_node` SET cookie_health = ?, status = ? WHERE node_id = ?',
    [upd.health as number, upd.status as string, node_id] as any[],
  );
}

// spec §10.2: 回收节点的 active assignment（标记 reclaimed，使 subtask 可重派）
export async function reclaimNodeAssignments(node_id: string): Promise<number> {
  const [res] = await pool.execute<any>(
    "UPDATE `tds_assignment` SET status = 'reclaimed' WHERE node_id = ? AND status IN ('assigned','running')",
    [node_id],
  );
  const affected = res.affectedRows ?? 0;
  if (affected > 0) logger.info({ node_id, reclaimed: affected }, 'assignments reclaimed');
  return affected;
}

// spec §5.5: 数据保留清理 job
export async function cleanupRetainedData(): Promise<void> {
  await pool.execute(`DELETE FROM \`tds_tweet_raw\` WHERE received_at < DATE_SUB(NOW(), INTERVAL ${RETENTION.tweet_raw} DAY)`);
  await pool.execute(`DELETE FROM \`tds_cookie_health_log\` WHERE ts < DATE_SUB(NOW(), INTERVAL ${RETENTION.cookie_health_log} DAY)`);
  await pool.execute(`DELETE FROM \`tds_node_metric\` WHERE date < DATE_SUB(CURDATE(), INTERVAL ${RETENTION.node_metric} DAY)`);
  logger.info('retained data cleanup done');
}

// 告警通道 stub（spec §13: P5 交付，webhook/IM）
export async function emitAlert(node_id: string, msg: string): Promise<void> {
  const webhook = process.env.TDS_ALERT_WEBHOOK;
  if (!webhook) return;
  // 真实实现用 fetch POST 到 webhook；此处仅记录
  logger.info({ node_id, webhook: !!webhook, msg }, 'alert emitted (stub)');
}

export { TASK_MAX_RETRIES };
