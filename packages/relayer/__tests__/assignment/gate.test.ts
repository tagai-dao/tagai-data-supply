import { gateTaskResult } from '../../src/assignment/gate';
import type { AssignmentRow } from '../../src/db/tasks';

const asg = (over: Partial<AssignmentRow> = {}): AssignmentRow => ({
  assignment_id: 'asg_1',
  subtask_id: 'st_1',
  node_id: 'n1',
  assigned_at: new Date(),
  status: 'assigned',
  last_run_at: null,
  result_summary: null,
  accepted_count: 0,
  ...over,
});

describe('gateTaskResult', () => {
  it('拒绝：assignment 不存在', () => {
    expect(gateTaskResult(null, 'n1', 'st_1', 10, 'done').reason).toBe('assignment_not_found');
  });

  it('拒绝：非派发节点', () => {
    const r = gateTaskResult(asg({ node_id: 'n1' }), 'n2', 'st_1', 10, 'done');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('wrong_node');
  });

  it('拒绝：subtask 不匹配', () => {
    const r = gateTaskResult(asg({ subtask_id: 'st_1' }), 'n1', 'st_2', 10, 'done');
    expect(r.reason).toBe('wrong_subtask');
  });

  it('拒绝：assignment 已 done', () => {
    const r = gateTaskResult(asg({ status: 'done' }), 'n1', 'st_1', 10, 'done');
    expect(r.reason).toBe('invalid_status');
  });

  it('拒绝：quota 已满', () => {
    const r = gateTaskResult(asg({ accepted_count: 200 }), 'n1', 'st_1', 10, 'done');
    expect(r.reason).toBe('quota_exhausted');
  });

  it('允许：failed 不占 quota', () => {
    const r = gateTaskResult(asg(), 'n1', 'st_1', 50, 'failed');
    expect(r.ok).toBe(true);
    expect(r.maxTweets).toBe(0);
  });

  it('截断：剩余 quota 小于本批条数', () => {
    const r = gateTaskResult(asg({ accepted_count: 190 }), 'n1', 'st_1', 20, 'done');
    expect(r.ok).toBe(true);
    expect(r.maxTweets).toBe(10);
  });
});
