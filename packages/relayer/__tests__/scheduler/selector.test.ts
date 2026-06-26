import { rankSubtasks, pickNextSubtask, SelectableSubtask } from '../../src/scheduler/selector';

function mk(id: string, priority: number, lastRun: number | null): SelectableSubtask {
  return {
    subtask_id: id, topic_id: 't', type: 'hashtag', mode: 'continuous',
    params: {}, cursor: null, cursor_owner_node: null, schedule_cron: null,
    window_minutes: null, priority, tick: 'X', enabled: 1, created_at: new Date(0),
    last_run_at: lastRun ? new Date(lastRun) : null,
  } as any;
}

describe('subtask selector (spec §8.1)', () => {
  it('higher priority first', () => {
    const r = rankSubtasks([mk('a', 1, null), mk('b', 9, null), mk('c', 5, null)]);
    expect(r.map((s) => s.subtask_id)).toEqual(['b', 'c', 'a']);
  });

  it('same priority: oldest last_run first (null = oldest)', () => {
    const r = rankSubtasks([
      mk('a', 5, 200),
      mk('b', 5, null),
      mk('c', 5, 100),
    ]);
    expect(r.map((s) => s.subtask_id)).toEqual(['b', 'c', 'a']);
  });

  it('pickNextSubtask returns null on empty', () => {
    expect(pickNextSubtask([])).toBeNull();
  });

  it('pickNextSubtask returns top ranked', () => {
    expect(pickNextSubtask([mk('a', 1, null), mk('b', 9, null)])?.subtask_id).toBe('b');
  });
});
