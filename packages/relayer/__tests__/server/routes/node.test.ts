import request from 'supertest';
import { app } from '../../../src/server/app';

// mock db
jest.mock('../../../src/db/client', () => ({
  consumeInvite: jest.fn(),
  createNode: jest.fn(),
  linkInviteNode: jest.fn().mockResolvedValue(undefined),
}));
// mock tokens: 确定性凭据
jest.mock('../../../src/auth/tokens', () => ({
  issueNodeCredentials: jest.fn(() => ({
    node_id: 'node_test1',
    token: 'tok_secret123',
    token_hash: 'hash_test1',
  })),
}));
// mock tagai 验证客户端
jest.mock('../../../src/tagai/client', () => ({
  verifyTagaiAccount: jest.fn().mockResolvedValue(true),
}));

import { consumeInvite, createNode } from '../../../src/db/client';
import { verifyTagaiAccount } from '../../../src/tagai/client';
import { registerLimiter } from '../../../src/server/routes/node';

beforeAll(() => {
  Object.assign(process.env, {
    TDS_DB_HOST: 'h', TDS_DB_USER: 'u', TDS_DB_PASSWORD: 'p',
    TDS_DB_DATABASE: 'd', TDS_ADMIN_TOKEN: 't', TDS_PROTOCOL_VERSION: '1',
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  (verifyTagaiAccount as jest.Mock).mockResolvedValue(true);
  registerLimiter.reset();  // 重置 IP 限频，避免用例间累积
});

const GOOD_BODY = {
  invite_secret: 'good', protocol_version: '1', timezone: 'UTC',
  tagai_account: '111', tagai_account_type: 0,
};

describe('POST /node/register (spec §10.1)', () => {
  it('400 on missing fields', async () => {
    const res = await request(app).post('/node/register').send({ invite_secret: 'x' });
    expect(res.status).toBe(400);
  });

  it('400 on protocol version mismatch', async () => {
    const res = await request(app).post('/node/register').send({
      ...GOOD_BODY, protocol_version: '99',
    });
    expect(res.status).toBe(400);
    expect(res.body.m).toMatch(/protocol version mismatch/);
  });

  it('400 when missing tagai_account', async () => {
    const res = await request(app).post('/node/register').send({
      invite_secret: 'good', protocol_version: '1', timezone: 'UTC',
    });
    expect(res.status).toBe(400);
  });

  it('400 when tagai_account_type not 0 or 2', async () => {
    const res = await request(app).post('/node/register').send({
      ...GOOD_BODY, tagai_account_type: 5,
    });
    expect(res.status).toBe(400);
  });

  it('403 when tagai account not verified', async () => {
    (verifyTagaiAccount as jest.Mock).mockResolvedValueOnce(false);
    (consumeInvite as jest.Mock).mockResolvedValue({ ok: true, invite_id: 'inv_1' });
    const res = await request(app).post('/node/register').send(GOOD_BODY);
    expect(res.status).toBe(403);
    expect(createNode).not.toHaveBeenCalled();
  });

  it('403 on invalid/used invite', async () => {
    (consumeInvite as jest.Mock).mockResolvedValue({ ok: false });
    const res = await request(app).post('/node/register').send(GOOD_BODY);
    expect(res.status).toBe(403);
  });

  it('200 + returns node_id & node_token on success', async () => {
    (consumeInvite as jest.Mock).mockResolvedValue({ ok: true, invite_id: 'inv_1' });
    (createNode as jest.Mock).mockResolvedValue(undefined);
    const res = await request(app).post('/node/register').send({
      ...GOOD_BODY, timezone: 'Asia/Shanghai', label: 'n1',
    });
    expect(res.status).toBe(200);
    expect(res.body.c).toBe(0);
    expect(res.body.d.node_id).toBe('node_test1');
    expect(res.body.d.node_token).toBe('tok_secret123');
    expect(consumeInvite).toHaveBeenCalledWith('good');
    expect(verifyTagaiAccount).toHaveBeenCalledWith('111', 0);
    expect(createNode).toHaveBeenCalledWith(expect.objectContaining({
      node_id: 'node_test1', timezone: 'Asia/Shanghai', label: 'n1', invite_id: 'inv_1',
      tagai_account: '111', tagai_account_type: 0,
    }));
  });
});
