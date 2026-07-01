import { ASSIGNMENT_MAX_TWEETS } from '../config/constants';
import type { AssignmentRow } from '../db/tasks';

export type GateRejectReason =
  | 'missing_assignment_id'
  | 'assignment_not_found'
  | 'wrong_node'
  | 'wrong_subtask'
  | 'invalid_status'
  | 'quota_exhausted';

export interface GateResult {
  ok: boolean;
  reason?: GateRejectReason;
  assignment?: AssignmentRow;
  /** 本批最多处理的 tweet 条数（含去重前 received） */
  maxTweets?: number;
}

/** 校验 task_result 是否对应合法 assignment，并计算本批可收条数上限。 */
export function gateTaskResult(
  assignment: AssignmentRow | null | undefined,
  nodeId: string,
  subtaskId: string,
  tweetCount: number,
  status: 'done' | 'failed',
  maxTotal = ASSIGNMENT_MAX_TWEETS,
): GateResult {
  if (!assignment) {
    return { ok: false, reason: 'assignment_not_found' };
  }
  if (assignment.node_id !== nodeId) {
    return { ok: false, reason: 'wrong_node' };
  }
  if (assignment.subtask_id !== subtaskId) {
    return { ok: false, reason: 'wrong_subtask' };
  }
  if (assignment.status !== 'assigned' && assignment.status !== 'running') {
    return { ok: false, reason: 'invalid_status' };
  }
  if (status === 'failed') {
    return { ok: true, assignment, maxTweets: 0 };
  }
  const accepted = assignment.accepted_count ?? 0;
  const remaining = maxTotal - accepted;
  if (remaining <= 0) {
    return { ok: false, reason: 'quota_exhausted' };
  }
  const maxTweets = Math.min(tweetCount, remaining);
  return { ok: true, assignment, maxTweets };
}
