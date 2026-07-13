jest.mock('../../src/db/pool', () => ({ pool: { execute: jest.fn(), query: jest.fn() }, closePool: jest.fn() }));
jest.mock('../../src/db/client', () => ({ createInvite: jest.fn(), listOnlineNodes: jest.fn(), setNodeStatus: jest.fn(), listInvites: jest.fn().mockResolvedValue([]) }));
jest.mock('../../src/db/tasks', () => ({ createTopic: jest.fn(), listTopics: jest.fn().mockResolvedValue([]), createSubtask: jest.fn(), listEnabledSubtasks: jest.fn().mockResolvedValue([]), setSubtaskEnabled: jest.fn(), validateSubtaskTick: jest.fn() }));
jest.mock('../../src/health/db', () => ({ reclaimNodeAssignments: jest.fn(), reEnableNode: jest.fn(), cleanupRetainedData: jest.fn() }));
jest.mock('../../src/auth/tokens', () => ({ issueInvite: jest.fn() }));
jest.mock('../../src/scheduler', () => ({ scheduler: { start: jest.fn(), stop: jest.fn() } }));

import request from 'supertest';
import { app } from '../../src/server/app';
import { pool } from '../../src/db/pool';

const ADMIN = 'Bearer test-admin-token';
beforeAll(() => { Object.assign(process.env, { TDS_DB_HOST:'h',TDS_DB_USER:'u',TDS_DB_PASSWORD:'p',TDS_DB_DATABASE:'d',TDS_ADMIN_TOKEN:'test-admin-token',TDS_PROTOCOL_VERSION:'1' }); });
beforeEach(() => jest.clearAllMocks());

it('GET /admin/pending 默认查 status=3', async () => {
  (pool.query as jest.Mock).mockResolvedValueOnce([[{ id: 1, tweet_id: 't1', status: 3, last_error: 'x' }], []]);
  const r = await request(app).get('/admin/pending').set('Authorization', ADMIN);
  expect(r.status).toBe(200);
  expect(r.body.d).toHaveLength(1);
  const sql = (pool.query as jest.Mock).mock.calls[0][0];
  expect(sql).toContain('p.status = ?');
  expect(sql).toContain('tds_node');
});

it('POST /admin/pending/:id/retry → status 回 0', async () => {
  (pool.execute as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
  const r = await request(app).post('/admin/pending/1/retry').set('Authorization', ADMIN);
  expect(r.status).toBe(200);
  expect(r.body.d.retried).toBe(true);
});
