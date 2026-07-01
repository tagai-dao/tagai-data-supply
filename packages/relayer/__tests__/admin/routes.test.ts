import request from 'supertest';
import { app } from '../../src/server/app';

// mock 数据层
jest.mock('../../src/db/pool', () => ({
  pool: { execute: jest.fn() },
  closePool: jest.fn(),
}));
jest.mock('../../src/db/client', () => ({
  createInvite: jest.fn(),
  listInvites: jest.fn().mockResolvedValue([]),
  listOnlineNodes: jest.fn().mockResolvedValue([]),
  setNodeStatus: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/db/tasks', () => ({
  createTopic: jest.fn(),
  listTopics: jest.fn().mockResolvedValue([]),
  createSubtask: jest.fn(),
  listEnabledSubtasks: jest.fn().mockResolvedValue([]),
  setSubtaskEnabled: jest.fn(),
  validateSubtaskTick: jest.fn((t: string) => {
    if (!t) throw new Error('tick required');
    return t;
  }),
}));
jest.mock('../../src/health/db', () => ({
  reclaimNodeAssignments: jest.fn().mockResolvedValue(1),
  reEnableNode: jest.fn().mockResolvedValue(undefined),
  cleanupRetainedData: jest.fn(),
}));
jest.mock('../../src/auth/tokens', () => ({
  issueInvite: jest.fn(() => ({ invite_id: 'inv_1', invite_secret: 'sec_1', invite_secret_hash: 'h1' })),
}));
jest.mock('../../src/scheduler', () => ({
  scheduler: { start: jest.fn(), stop: jest.fn() },
}));

import { issueInvite } from '../../src/auth/tokens';
import { createSubtask, validateSubtaskTick } from '../../src/db/tasks';
import { reclaimNodeAssignments } from '../../src/health/db';
import { pool } from '../../src/db/pool';

const ADMIN = 'Bearer test-admin-token';

beforeAll(() => {
  Object.assign(process.env, {
    TDS_DB_HOST: 'h', TDS_DB_USER: 'u', TDS_DB_PASSWORD: 'p',
    TDS_DB_DATABASE: 'd', TDS_ADMIN_TOKEN: 'test-admin-token', TDS_PROTOCOL_VERSION: '1',
  });
});

beforeEach(() => jest.clearAllMocks());

describe('admin API (spec §12)', () => {
  it('rejects without admin token', async () => {
    const r = await request(app).get('/admin/topics');
    expect(r.status).toBe(401);
  });

  it('POST /admin/invites returns plaintext secret once', async () => {
    const r = await request(app).post('/admin/invites').set('Authorization', ADMIN);
    expect(r.status).toBe(200);
    expect(r.body.d.invite_secret).toBe('sec_1');
    expect(issueInvite).toHaveBeenCalled();
  });

  it('POST /admin/subtasks: tick required (400 if missing)', async () => {
    const r = await request(app).post('/admin/subtasks').set('Authorization', ADMIN).send({
      topic_id: 't1', type: 'hashtag', mode: 'continuous', params: {},
      // no tick
    });
    expect(r.status).toBe(400);
    expect(r.body.m).toMatch(/tick/);
  });

  it('POST /admin/subtasks: creates with valid tick', async () => {
    const r = await request(app).post('/admin/subtasks').set('Authorization', ADMIN).send({
      topic_id: 't1', type: 'hashtag', mode: 'continuous', params: { q: '#x' }, tick: 'SPACEX',
    });
    expect(r.status).toBe(200);
    expect(validateSubtaskTick).toHaveBeenCalledWith('SPACEX');
    expect(createSubtask).toHaveBeenCalledWith(expect.objectContaining({ tick: 'SPACEX', type: 'hashtag' }));
  });

  it('PATCH /admin/subtasks/:id enable/disable', async () => {
    const r = await request(app).patch('/admin/subtasks/st_1').set('Authorization', ADMIN).send({ enabled: false });
    expect(r.status).toBe(200);
    expect(r.body.d.enabled).toBe(false);
  });

  it('POST /admin/nodes/:id/reclaim', async () => {
    const r = await request(app).post('/admin/nodes/n1/reclaim').set('Authorization', ADMIN);
    expect(r.status).toBe(200);
    expect(reclaimNodeAssignments).toHaveBeenCalledWith('n1');
  });

  it('GET /admin/stats', async () => {
    (pool.execute as jest.Mock)
      .mockResolvedValueOnce([[{ status: 'online', cnt: 1 }], []])
      .mockResolvedValueOnce([[{ cnt: 5 }], []])
      .mockResolvedValueOnce([[{ cnt: 3 }], []])
      .mockResolvedValueOnce([[{ status: 'done', cnt: 2 }], []]);
    const r = await request(app).get('/admin/stats').set('Authorization', ADMIN);
    expect(r.status).toBe(200);
    expect(r.body.d).toHaveProperty('nodes');
    expect(r.body.d).toHaveProperty('pending_total');
    expect(r.body.d).toHaveProperty('pending_done');
  });
});
