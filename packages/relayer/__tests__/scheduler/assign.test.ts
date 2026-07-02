import { dispatchTaskAssign } from '../../src/scheduler/assign';
import { createAssignment, setAssignmentStatus } from '../../src/db/tasks';

jest.mock('../../src/db/tasks');

describe('dispatchTaskAssign', () => {
  const subtask = {
    subtask_id: 'st1', type: 'hashtag', mode: 'continuous', params: { q: '#x' },
    watermark_tweet_id: null, window_minutes: null,
  } as any;

  beforeEach(() => jest.clearAllMocks());

  it('creates assignment before send', async () => {
    const order: string[] = [];
    (createAssignment as jest.Mock).mockImplementation(async () => { order.push('create'); });
    const send = jest.fn(() => { order.push('send'); return true; });

    const r = await dispatchTaskAssign(subtask, 'n1', send);
    expect(r.ok).toBe(true);
    expect(r.assignmentId).toMatch(/^asg_/);
    expect(order).toEqual(['create', 'send']);
    expect(createAssignment).toHaveBeenCalledWith(r.assignmentId, 'st1', 'n1');
  });

  it('marks assignment failed when send fails', async () => {
    const send = jest.fn().mockReturnValue(false);
    const r = await dispatchTaskAssign(subtask, 'n1', send);
    expect(r.ok).toBe(false);
    expect(setAssignmentStatus).toHaveBeenCalledWith(
      r.assignmentId,
      'failed',
      { reason: 'send_failed' },
    );
  });
});
