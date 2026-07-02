import { buildTaskAssignMsg, redispatchSubtask } from '../../src/scheduler/redispatch';
import { getSubtask, getNodeActiveAssignment } from '../../src/db/tasks';
import { listOnlineNodes } from '../../src/db/client';
import { dispatchTaskAssign } from '../../src/scheduler/assign';

jest.mock('../../src/db/tasks');
jest.mock('../../src/db/client');
jest.mock('../../src/scheduler/assign');

describe('redispatch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('buildTaskAssignMsg includes watermark only (no twitter cursor)', () => {
    const msg = buildTaskAssignMsg({
      subtask_id: 'st1', type: 'hashtag', mode: 'continuous', params: { q: '#x' },
      cursor: 'c1', watermark_tweet_id: '999', enabled: 1,
    } as any, 'asg_1');
    expect(msg.watermark_tweet_id).toBe('999');
    expect(msg.cursor).toBeUndefined();
  });

  it('redispatchSubtask picks another node', async () => {
    (getSubtask as jest.Mock).mockResolvedValue({
      subtask_id: 'st1', type: 'hashtag', mode: 'continuous', params: {}, enabled: 1,
    });
    (listOnlineNodes as jest.Mock).mockResolvedValue([
      { node_id: 'n1', status: 'online', cookie_health: 100, weight: 5 },
      { node_id: 'n2', status: 'online', cookie_health: 100, weight: 8 },
    ]);
    (getNodeActiveAssignment as jest.Mock).mockResolvedValue(null);
    (dispatchTaskAssign as jest.Mock).mockResolvedValue({ ok: true, assignmentId: 'asg_new' });

    const ok = await redispatchSubtask('st1', ['n1']);
    expect(ok).toBe(true);
    expect(dispatchTaskAssign).toHaveBeenCalledWith(
      expect.objectContaining({ subtask_id: 'st1' }),
      'n2',
      expect.any(Function),
    );
  });
});
