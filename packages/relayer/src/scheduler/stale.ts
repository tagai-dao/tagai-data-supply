// 超时未完结的 assignment 回收，避免单节点挂死拖住全局调度
import { logger } from '../utils/logger';
import { registry } from '../server/connections';
import { ASSIGNMENT_ACTIVE_TIMEOUT_SEC } from '../config/constants';
import { listStaleActiveAssignments, reclaimAssignmentById } from '../db/tasks';
import { redispatchSubtask } from './redispatch';

/** 回收超时 assignment，并尝试重派 subtask */
export async function reclaimStaleAssignments(): Promise<number> {
  const stale = await listStaleActiveAssignments(ASSIGNMENT_ACTIVE_TIMEOUT_SEC);
  if (stale.length === 0) return 0;

  let reclaimed = 0;
  for (const row of stale) {
    const ok = await reclaimAssignmentById(row.assignment_id, 'timeout');
    if (!ok) continue;
    reclaimed++;

    registry.send(row.node_id, {
      type: 'task_cancel',
      assignment_id: row.assignment_id,
      subtask_id: row.subtask_id,
      reason: 'timeout',
    });

    logger.warn({
      assignment_id: row.assignment_id,
      subtask_id: row.subtask_id,
      node_id: row.node_id,
      timeout_sec: ASSIGNMENT_ACTIVE_TIMEOUT_SEC,
    }, 'stale assignment reclaimed');

    await redispatchSubtask(row.subtask_id, []).catch((e) => {
      logger.warn({ err: (e as Error).message, subtask_id: row.subtask_id }, 'redispatch after stale reclaim failed');
    });
  }

  if (reclaimed > 0) {
    logger.info({ reclaimed, timeout_sec: ASSIGNMENT_ACTIVE_TIMEOUT_SEC }, 'stale assignments reclaimed');
  }
  return reclaimed;
}
