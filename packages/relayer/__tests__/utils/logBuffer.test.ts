import { appendLogRecord, clearLogBuffer, queryLogs } from '../../src/utils/logBuffer';

beforeEach(() => clearLogBuffer());

describe('logBuffer', () => {
  it('append and query by level', () => {
    appendLogRecord({ level: 30, time: 1000, msg: 'task assigned' });
    appendLogRecord({ level: 20, time: 2000, msg: 'task_decline', node_id: 'n1' });
    const all = queryLogs({ limit: 10 });
    expect(all.items).toHaveLength(2);

    const debugOnly = queryLogs({ levels: ['debug'], limit: 10 });
    expect(debugOnly.items).toHaveLength(1);
    expect(debugOnly.items[0].msg).toBe('task_decline');
    expect(debugOnly.items[0].fields.node_id).toBe('n1');
  });

  it('query with keyword and sinceId', () => {
    appendLogRecord({ level: 30, time: 1000, msg: 'scheduler dispatched' });
    appendLogRecord({ level: 30, time: 2000, msg: 'task assigned', subtask_id: 'st1' });
    const all = queryLogs({ limit: 10 });
    expect(all.items).toHaveLength(2);

    const since = queryLogs({ sinceId: all.items[0].id, limit: 10 });
    expect(since.items).toHaveLength(1);
    expect(since.items[0].msg).toBe('task assigned');

    const search = queryLogs({ q: 'scheduler', limit: 10 });
    expect(search.items).toHaveLength(1);
    expect(search.items[0].msg).toBe('scheduler dispatched');
  });
});
