jest.mock('../../src/db/pool', () => ({
  pool: { execute: jest.fn() },
}));

import { pool } from '../../src/db/pool';
import { getSubtasksInSuccessCooldown } from '../../src/db/tasks';

describe('subtask success cooldown', () => {
  beforeEach(() => jest.clearAllMocks());

  it('loads only completed subtasks that returned data within the cooldown window', async () => {
    (pool.execute as jest.Mock).mockResolvedValue([[
      { subtask_id: 's1' },
      { subtask_id: 's2' },
    ]]);

    const ids = await getSubtasksInSuccessCooldown(10);

    expect(ids).toEqual(new Set(['s1', 's2']));
    expect(pool.execute).toHaveBeenCalledWith(
      expect.stringContaining("status = 'done'"),
      [10],
    );
    const sql = (pool.execute as jest.Mock).mock.calls[0][0] as string;
    expect(sql).toContain("JSON_EXTRACT(result_summary, '$.count')");
    expect(sql).toContain('INTERVAL ? MINUTE');
  });
});
