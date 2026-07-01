import { verifyTagaiAccount } from '../../src/tagai/client';

describe('verifyTagaiAccount', () => {
  it('返回 true 当 tagai-api 返回 c:0', async () => {
    const fetcher = jest.fn().mockResolvedValue({ c: 0, d: { ok: true } });
    const ok = await verifyTagaiAccount('111', 0, 'http://mock:3001', fetcher);
    expect(ok).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('http://mock:3001/user/verify', { twitter_id: '111', account_type: 0 });
  });

  it('返回 false 当 tagai-api 返回非 c:0', async () => {
    const fetcher = jest.fn().mockResolvedValue({ c: 1, m: 'no steem' });
    const ok = await verifyTagaiAccount('111', 0, 'http://mock:3001', fetcher);
    expect(ok).toBe(false);
  });

  it('返回 false 当 fetcher 抛异常', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('network'));
    const ok = await verifyTagaiAccount('111', 0, 'http://mock:3001', fetcher);
    expect(ok).toBe(false);
  });
});
