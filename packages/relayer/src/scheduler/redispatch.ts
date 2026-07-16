// 节点拒绝任务后立即换节点重派
import { logger } from '../utils/logger';
import { registry } from '../server/connections';
import { listOnlineNodes } from '../db/client';
import {
  getSubtask, getNodeActiveAssignment, getSubtasksInSuccessCooldown, type SubtaskRow,
} from '../db/tasks';
import { candidateNodes, selectNode, type DispatchableNode } from './dispatcher';
import { dispatchTaskAssign } from './assign';
import { SUBTASK_SUCCESS_COOLDOWN_MINUTES } from '../config/constants';

export function buildTaskAssignMsg(subtask: SubtaskRow, assignmentId: string): Record<string, unknown> {
  const msg: Record<string, unknown> = {
    type: 'task_assign',
    assignment_id: assignmentId,
    subtask_id: subtask.subtask_id,
    task_type: subtask.type,
    params: subtask.params,
    mode: subtask.mode,
  };
  if (subtask.mode === 'round' && subtask.window_minutes) {
    msg.round_window = { minutes: subtask.window_minutes };
  }
  if (subtask.watermark_tweet_id) {
    msg.watermark_tweet_id = subtask.watermark_tweet_id;
  }
  return msg;
}

export function sendTaskAssign(nodeId: string, msg: Record<string, unknown>): boolean {
  return registry.send(nodeId, msg);
}

/** 拒绝后立即尝试换节点重派同一 subtask */
export async function redispatchSubtask(subtask_id: string, excludeNodeIds: string[]): Promise<boolean> {
  const subtask = await getSubtask(subtask_id);
  if (!subtask || !subtask.enabled) return false;

  const coolingSubtaskIds = await getSubtasksInSuccessCooldown(SUBTASK_SUCCESS_COOLDOWN_MINUTES);
  if (coolingSubtaskIds.has(subtask_id)) {
    logger.debug({ subtask_id }, 'redispatch skipped: subtask in success cooldown');
    return false;
  }

  const online = await listOnlineNodes();
  const candidates = candidateNodes(online).filter((n) => !excludeNodeIds.includes(n.node_id));
  const free: DispatchableNode[] = [];
  for (const c of candidates) {
    const active = await getNodeActiveAssignment(c.node_id);
    if (!active) {
      free.push({ ...c, recent_load: 0, tz_recent_count: 0 });
    }
  }
  const node = selectNode(free);
  if (!node) {
    logger.debug({ subtask_id, excludeNodeIds }, 'redispatch: no free node');
    return false;
  }

  const { ok, assignmentId } = await dispatchTaskAssign(
    subtask,
    node.node_id,
    (nodeId, msg) => registry.send(nodeId, msg),
  );
  if (!ok) return false;

  logger.info({
    subtask_id,
    assignment_id: assignmentId,
    node_id: node.node_id,
    excluded: excludeNodeIds,
  }, 'redispatched after decline');
  return true;
}
