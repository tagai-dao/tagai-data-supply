import { verifyTagaiAccount, normalizeTagaiUsername } from '../../src/tagai/client';

describe('verifyTagaiAccount', () => {
  it('返回 twitter_id 与 account_type 当 tagai-api 返回 c:0', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      c: 0, d: { ok: true, twitter_id: '999', twitter_username: 'alice', account_type: 0 },
    });
    const r = await verifyTagaiAccount('alice', 'http://mock:3001', fetcher);
    expect(r).toEqual({ twitter_id: '999', twitter_username: 'alice', account_type: 0 });
    expect(fetcher).toHaveBeenCalledWith('http://mock:3001/user/verify', { twitter_username: 'alice' });
  });

  it('strip @ 前缀', async () => {
    const fetcher = jest.fn().mockResolvedValue({
      c: 0, d: { ok: true, twitter_id: '1', twitter_username: 'bob', account_type: 2 },
    });
    await verifyTagaiAccount('@bob', 'http://mock:3001', fetcher);
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), { twitter_username: 'bob' });
  });

  it('返回 null 当 tagai-api 返回非 c:0', async () => {
    const fetcher = jest.fn().mockResolvedValue({ c: 1, m: 'no steem' });
    expect(await verifyTagaiAccount('alice', 'http://mock:3001', fetcher)).toBeNull();
  });

  it('返回 null 当 fetcher 抛异常', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('network'));
    expect(await verifyTagaiAccount('alice', 'http://mock:3001', fetcher)).toBeNull();
  });
});

describe('normalizeTagaiUsername', () => {
  it('去 @ 并 trim', () => {
    expect(normalizeTagaiUsername('  @Alice  ')).toBe('Alice');
  });
});
