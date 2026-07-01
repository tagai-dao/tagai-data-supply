import { Scheduler, SchedulerDeps } from '../../src/scheduler/index';

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
  return {
    listEnabledSubtasks: jest.fn().mockResolvedValue([]),
    getSubtaskLastRunMap: jest.fn().mockResolvedValue(new Map()),
    listOnlineNodes: jest.fn().mockResolvedValue([]),
    getNodeActiveAssignment: jest.fn().mockResolvedValue(null),
    createAssignment: jest.fn().mockResolvedValue(undefined),
    updateSubtaskCursor: jest.fn().mockResolvedValue(undefined),
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

  it('serial mode (1 node): assigns one subtask, sends task_assign, sleeps after', async () => {
    const send = jest.fn().mockReturnValue(true);
    const createAssignment = jest.fn().mockResolvedValue(undefined);
    const updateSubtaskCursor = jest.fn().mockResolvedValue(undefined);
    const sleep = jest.fn().mockResolvedValue(undefined);
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([mkSubtask('s1'), mkSubtask('s2')]),
      listOnlineNodes: jest.fn().mockResolvedValue([mkNode('n1')]), // 1 节点 → serial
      send, createAssignment, updateSubtaskCursor, sleep,
    });
    const s = new Scheduler(deps);
    const r = await s.dispatchOnce();
    // 串行模式：第一任务派发后 sleep；但本节点已 active，第二任务 pickFreeNode 应过滤掉
    expect(r.dispatched).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const msg = send.mock.calls[0][1] as any;
    expect(msg.type).toBe('task_assign');
    expect(msg.subtask_id).toBe('s1');
    expect(msg.assignment_id).toMatch(/^asg_/);
    expect(msg.params).toEqual({ q: '#x' });
    expect(createAssignment).toHaveBeenCalledTimes(1);
    expect(updateSubtaskCursor).toHaveBeenCalled();
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

  it('continuous subtask includes cursor in task_assign', async () => {
    const send = jest.fn().mockReturnValue(true);
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([mkSubtask('s1', 'continuous', '12345')]),
      listOnlineNodes: jest.fn().mockResolvedValue([mkNode('n1')]),
      send,
    });
    const s = new Scheduler(deps);
    await s.dispatchOnce();
    const msg = send.mock.calls[0][1] as any;
    expect(msg.cursor).toBe('12345');
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

  it('send failure → no assignment created', async () => {
    const send = jest.fn().mockReturnValue(false);
    const createAssignment = jest.fn();
    const deps = mkDeps({
      listEnabledSubtasks: jest.fn().mockResolvedValue([mkSubtask('s1')]),
      listOnlineNodes: jest.fn().mockResolvedValue([mkNode('n1')]),
      send, createAssignment,
    });
    const s = new Scheduler(deps);
    const r = await s.dispatchOnce();
    expect(r.dispatched).toBe(0);
    expect(createAssignment).not.toHaveBeenCalled();
  });
});
