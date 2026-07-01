import request from 'supertest';
import { app } from '../../../src/server/app';

jest.mock('../../../src/db/client', () => ({
  consumeInvite: jest.fn(),
  createNode: jest.fn(),
  linkInviteNode: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/auth/tokens', () => ({
  issueNodeCredentials: jest.fn(() => ({
    node_id: 'node_test1',
    token: 'tok_secret123',
    token_hash: 'hash_test1',
  })),
}));
jest.mock('../../../src/tagai/client', () => ({
  verifyTagaiAccount: jest.fn().mockResolvedValue({ twitter_id: '111', twitter_username: 'alice' }),
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
  (verifyTagaiAccount as jest.Mock).mockResolvedValue({ twitter_id: '111', twitter_username: 'alice' });
  registerLimiter.reset();
});

const GOOD_BODY = {
  invite_secret: 'good', protocol_version: '1', timezone: 'UTC',
  tagai_username: 'alice', tagai_account_type: 0,
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

  it('400 when missing tagai_username', async () => {
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
    (verifyTagaiAccount as jest.Mock).mockResolvedValueOnce(null);
    const res = await request(app).post('/node/register').send(GOOD_BODY);
    expect(res.status).toBe(403);
    expect(consumeInvite).not.toHaveBeenCalled();
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
    expect(verifyTagaiAccount).toHaveBeenCalledWith('alice', 0);
    expect(consumeInvite).toHaveBeenCalledWith('good');
    expect(createNode).toHaveBeenCalledWith(expect.objectContaining({
      node_id: 'node_test1', timezone: 'Asia/Shanghai', label: 'n1', invite_id: 'inv_1',
      tagai_account: '111', tagai_account_type: 0,
    }));
  });
});
