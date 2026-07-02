import { reclaimStaleAssignments } from '../../src/scheduler/stale';
import { listStaleActiveAssignments, reclaimAssignmentById } from '../../src/db/tasks';
import { redispatchSubtask } from '../../src/scheduler/redispatch';
import { registry } from '../../src/server/connections';

jest.mock('../../src/db/tasks');
jest.mock('../../src/scheduler/redispatch');
jest.mock('../../src/server/connections', () => ({
  registry: { send: jest.fn() },
}));

describe('reclaimStaleAssignments', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reclaims stale rows, sends cancel, and redispatches', async () => {
    (listStaleActiveAssignments as jest.Mock).mockResolvedValue([
      { assignment_id: 'asg_1', subtask_id: 'st1', node_id: 'n1' },
    ]);
    (reclaimAssignmentById as jest.Mock).mockResolvedValue(true);
    (redispatchSubtask as jest.Mock).mockResolvedValue(true);

    const n = await reclaimStaleAssignments();
    expect(n).toBe(1);
    expect(reclaimAssignmentById).toHaveBeenCalledWith('asg_1', 'timeout');
    expect(registry.send).toHaveBeenCalledWith('n1', expect.objectContaining({
      type: 'task_cancel',
      assignment_id: 'asg_1',
      subtask_id: 'st1',
    }));
    expect(redispatchSubtask).toHaveBeenCalledWith('st1', []);
  });

  it('returns 0 when nothing stale', async () => {
    (listStaleActiveAssignments as jest.Mock).mockResolvedValue([]);
    expect(await reclaimStaleAssignments()).toBe(0);
  });
});
