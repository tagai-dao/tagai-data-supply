import { Scheduler, SchedulerDeps } from '../../src/scheduler/index';
import { buildTaskAssignMsg } from '../../src/scheduler/redispatch';

function mkSubtask(id: string, mode: 'continuous' | 'round' = 'continuous', cursor: string | null = null) {
  return {
    subtask_id: id, topic_id: 't', type: 'hashtag', mode,
    params: { q: '#x' }, cursor, cursor_owner_node: null, watermark_tweet_id: null,
    schedule_cron: null,
    window_minutes: mode === 'round' ? 30 : null, priority: 5, tick: 'SPACEX', enabled: 1, created_at: new Date(0),
  } as any;
}

function mkNode(id: string, health = 100) {
  return {
    node_id: id, token_hash: 'h', label: null, status: 'online', timezone: 'UTC',
    last_heartbeat: null, cookie_health: health, weight: 5, invite_id: null, created_at: new Date(0),
  } as any;
}

function mkDeps(over: Partial<SchedulerDeps> = {}): SchedulerDeps {
  const dispatchTaskAssign = jest.fn(async (subtask, node_id, send) => {
    const assignmentId = 'asg_test';
    const sent = send(node_id, buildTaskAssignMsg(subtask, assignmentId));
    return { ok: sent, assignmentId };
  });
  return {
    listEnabledSubtasks: jest.fn().mockResolvedValue([]),
    getSubtaskLastRunMap: jest.fn().mockResolvedValue(new Map()),
    getSubtasksInSuccessCooldown: jest.fn().mockResolvedValue(new Set()),
    listOnlineNodes: jest.fn().mockResolvedValue([]),
    getNodeActiveAssignment: jest.fn().mockResolvedValue(null),
    dispatchTaskAssign,
    reclaimStaleAssignments: jest.fn().mockResolvedValue(0),
    send: jest.fn().mockReturnValue(true),
    sleep: jest.fn().mockResolvedValue(undefined),
    now: jest.fn().mockReturnValue(Date.now()),
    ...over,
  };
}

describe('Scheduler (spec §8)', () => {
  it('no subtasks → dispatched 0', async () => {
    const s = new Scheduler(mkDeps({ listEnabledSubtasks: jest.fn().mockResolvedValue([]) }));
    const r = await s.dispatchOnce();
    expect(r.dispatched).toBe(0);
  });

  it('no online nodes → dispatched 0', async () => {
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([mkSubtask('s1')]),
      listOnlineNodes: jest.fn().mockResolvedValue([]),
    });
    const s = new Scheduler(deps);
    const r = await s.dispatchOnce();
    expect(r.dispatched).toBe(0);
  });

  it('does not dispatch a subtask during its success cooldown', async () => {
    const dispatchTaskAssign = jest.fn().mockResolvedValue({ ok: true, assignmentId: 'asg_x' });
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([mkSubtask('s1'), mkSubtask('s2')]),
      getSubtasksInSuccessCooldown: jest.fn().mockResolvedValue(new Set(['s1'])),
      listOnlineNodes: jest.fn().mockResolvedValue([mkNode('n1')]),
      dispatchTaskAssign,
    });

    const r = await new Scheduler(deps).dispatchOnce();

    expect(r.dispatched).toBe(1);
    expect(deps.getSubtasksInSuccessCooldown).toHaveBeenCalledWith(10);
    expect(dispatchTaskAssign).toHaveBeenCalledTimes(1);
    expect(dispatchTaskAssign).toHaveBeenCalledWith(
      expect.objectContaining({ subtask_id: 's2' }),
      expect.any(String),
      expect.any(Function),
    );
  });

  it('serial mode (1 node): assigns one subtask, sends task_assign, sleeps after', async () => {
    const send = jest.fn().mockReturnValue(true);
    const dispatchTaskAssign = jest.fn(async (subtask, node_id, sendFn) => {
      sendFn(node_id, buildTaskAssignMsg(subtask, 'asg_test'));
      return { ok: true, assignmentId: 'asg_test' };
    });
    const sleep = jest.fn().mockResolvedValue(undefined);
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([mkSubtask('s1'), mkSubtask('s2')]),
      listOnlineNodes: jest.fn().mockResolvedValue([mkNode('n1')]), // 1 节点 → serial
      send, dispatchTaskAssign, sleep,
    });
    const s = new Scheduler(deps);
    const r = await s.dispatchOnce();
    // 串行模式：第一任务派发后 sleep；但本节点已 active，第二任务 pickFreeNode 应过滤掉
    expect(r.dispatched).toBe(1);
    expect(dispatchTaskAssign).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][1] as any;
    expect(msg.type).toBe('task_assign');
    expect(msg.subtask_id).toBe('s1');
    expect(msg.params).toEqual({ q: '#x' });
    expect(sleep).toHaveBeenCalled(); // 串行模式施加间隔
  });

  it('parallel mode (3 nodes): dispatches up to node count different subtasks', async () => {
    const send = jest.fn().mockReturnValue(true);
    const sleep = jest.fn().mockResolvedValue(undefined);
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([mkSubtask('s1'), mkSubtask('s2'), mkSubtask('s3')]),
      listOnlineNodes: jest.fn().mockResolvedValue([mkNode('n1'), mkNode('n2'), mkNode('n3')]),
      send, sleep,
    });
    const s = new Scheduler(deps);
    const r = await s.dispatchOnce();
    expect(r.dispatched).toBe(3);
    expect(send).toHaveBeenCalledTimes(3);
    // 并行模式不 sleep
    expect(sleep).not.toHaveBeenCalled();
    // 三个不同节点
    const targets = send.mock.calls.map((c) => c[0]);
    expect(new Set(targets).size).toBe(3);
  });

  it('continuous subtask includes watermark in task_assign', async () => {
    const send = jest.fn().mockReturnValue(true);
    const subtask = mkSubtask('s1', 'continuous');
    subtask.watermark_tweet_id = '1800000000000000001';
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([subtask]),
      listOnlineNodes: jest.fn().mockResolvedValue([mkNode('n1')]),
      send,
    });
    const s = new Scheduler(deps);
    await s.dispatchOnce();
    const msg = send.mock.calls[0][1] as any;
    expect(msg.watermark_tweet_id).toBe('1800000000000000001');
    expect(msg.cursor).toBeUndefined();
  });

  it('round subtask includes round_window', async () => {
    const send = jest.fn().mockReturnValue(true);
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([mkSubtask('s1', 'round')]),
      listOnlineNodes: jest.fn().mockResolvedValue([mkNode('n1')]),
      send,
    });
    const s = new Scheduler(deps);
    await s.dispatchOnce();
    const msg = send.mock.calls[0][1] as any;
    expect(msg.mode).toBe('round');
    expect(msg.round_window).toEqual({ minutes: 30 });
  });

  it('send failure → no successful dispatch', async () => {
    const dispatchTaskAssign = jest.fn().mockResolvedValue({ ok: false, assignmentId: 'asg_x' });
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([mkSubtask('s1')]),
      listOnlineNodes: jest.fn().mockResolvedValue([mkNode('n1')]),
      dispatchTaskAssign,
    });
    const s = new Scheduler(deps);
    const r = await s.dispatchOnce();
    expect(r.dispatched).toBe(0);
    expect(dispatchTaskAssign).toHaveBeenCalledTimes(1);
  });

  it('runs stale reclaim before dispatch', async () => {
    const reclaimStaleAssignments = jest.fn().mockResolvedValue(0);
    const deps = mkDeps({ reclaimStaleAssignments });
    const s = new Scheduler(deps);
    await s.dispatchOnce();
    expect(reclaimStaleAssignments).toHaveBeenCalled();
  });
});
