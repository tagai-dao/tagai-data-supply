// 统一派单：先落库再 send，避免 Node 秒拒时 task_decline 早于 createAssignment
import { nanoid } from 'nanoid';
import { createAssignment, setAssignmentStatus, type SubtaskRow } from '../db/tasks';
import { buildTaskAssignMsg } from './redispatch';

export interface DispatchResult {
  ok: boolean;
  assignmentId: string;
}

/** 创建 assignment 并下发 task_assign；send 失败时将 assignment 标为 failed */
export async function dispatchTaskAssign(
  subtask: SubtaskRow,
  node_id: string,
  send: (nodeId: string, msg: object) => boolean,
): Promise<DispatchResult> {
  const assignmentId = 'asg_' + nanoid(16);
  const msg = buildTaskAssignMsg(subtask, assignmentId);

  await createAssignment(assignmentId, subtask.subtask_id, node_id);

  const sent = send(node_id, msg);
  if (!sent) {
    await setAssignmentStatus(assignmentId, 'failed', { reason: 'send_failed' });
    return { ok: false, assignmentId };
  }

  return { ok: true, assignmentId };
}
