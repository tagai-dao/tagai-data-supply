jest.mock('../../src/db/pool', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
  },
  closePool: jest.fn(),
}));

import { pool } from '../../src/db/pool';
import { tweetExistsInAnyChain, replyExistsInAnyChain, insertPendingTweet, buildAllTweetsContent, backupToAllTweets, mapIncomingToPending } from '../../src/db/pending';

beforeAll(() => {
  Object.assign(process.env, {
    TDS_DB_HOST: 'h', TDS_DB_USER: 'u', TDS_DB_PASSWORD: 'p',
    TDS_DB_DATABASE: 'd', TDS_ADMIN_TOKEN: 't',
  });
});

beforeEach(() => jest.clearAllMocks());

describe('pending DAL', () => {
  it('tweetExistsInAnyChain: 首条链命中即 true', async () => {
    (pool.execute as jest.Mock).mockResolvedValueOnce([[{ '1': 1 }], []]);
    const ok = await tweetExistsInAnyChain('123');
    expect(ok).toBe(true);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(pool.execute).toHaveBeenCalledWith('SELECT 1 FROM `bsc_tweet` WHERE tweet_id = ? LIMIT 1', ['123']);
  });

  it('tweetExistsInAnyChain: BSC 未命中但 RH 命中', async () => {
    (pool.execute as jest.Mock)
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[{ '1': 1 }], []]);
    const ok = await tweetExistsInAnyChain('123');
    expect(ok).toBe(true);
    expect(pool.execute).toHaveBeenNthCalledWith(2, 'SELECT 1 FROM `rh_tweet` WHERE tweet_id = ? LIMIT 1', ['123']);
  });

  it('tweetExistsInAnyChain: 全链未命中返回 false', async () => {
    (pool.execute as jest.Mock)
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);
    const ok = await tweetExistsInAnyChain('123');
    expect(ok).toBe(false);
    expect(pool.execute).toHaveBeenCalledTimes(2);
  });

  it('replyExistsInAnyChain: 首条链命中即 true', async () => {
    (pool.execute as jest.Mock).mockResolvedValueOnce([[{ '1': 1 }], []]);
    const ok = await replyExistsInAnyChain('456');
    expect(ok).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith(
      'SELECT 1 FROM `bsc_relation_reply` WHERE reply_id = ? LIMIT 1',
      ['456'],
    );
  });

  it('replyExistsInAnyChain: 全链未命中返回 false', async () => {
    (pool.execute as jest.Mock)
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);
    const ok = await replyExistsInAnyChain('456');
    expect(ok).toBe(false);
    expect(pool.execute).toHaveBeenCalledTimes(2);
  });

  it('insertPendingTweet: INSERT pending 行', async () => {
    (pool.execute as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await insertPendingTweet({
      tweet_id: '123', kind: 'post', tweet_type: 'original', twitter_id: '111', content: 'hi', tweet_time: new Date(),
      node_id: 'n1', tagai_account: '111', tagai_account_type: 0,
      topic_id: 't1', subtask_id: 's1', tick: 'SPACEX',
    });
    const sql = (pool.execute as jest.Mock).mock.calls[0][0];
    expect(sql).toContain('INSERT IGNORE INTO `tds_pending_tweet`');
    expect(sql).toContain('kind');
  });

  it('mapIncomingToPending: reply 字段映射', () => {
    const row = mapIncomingToPending({
      tweet_id: '200',
      kind: 'reply',
      tweet_type: 'reply',
      twitter_id: '9',
      content: 'reply text',
      reply_count: 3,
      view_count: 500,
      conversation_id: '100',
      parent_tweet_id: '100',
      parent_twitter_id: '8',
      parent_content: 'parent text',
      tweet_time: null,
    }, {
      node_id: 'n1', tagai_account: '111', tagai_account_type: 0,
      topic_id: 't1', subtask_id: 's1', tick: 'SPACEX',
    }, () => new Date('2026-01-01'));
    expect(row.kind).toBe('reply');
    expect(row.reply_count).toBe(3);
    expect(row.view_count).toBe(500);
    expect(row.parent_tweet_id).toBe('100');
    expect(row.conversation_id).toBe('100');
  });

  it('buildAllTweetsContent: 优先 raw_payload（Twitter API v2 JSON）', () => {
    const json = buildAllTweetsContent({
      tweet_id: '1800000000000000002',
      twitter_id: '9',
      content: 'plain text for pending',
      raw_payload: {
        data: { id: '1800000000000000002', text: '@binance tip $BUIDL', author_id: '9' },
        includes: { users: [{ id: '9', username: 'alice' }], tweets: [] },
      },
    });
    const parsed = JSON.parse(json);
    expect(parsed.data.text).toBe('@binance tip $BUIDL');
    expect(parsed.includes.users[0].username).toBe('alice');
  });

  it('buildAllTweetsContent: 无 raw_payload 时构造最小 v2 结构', () => {
    const json = buildAllTweetsContent({
      tweet_id: '1800000000000000002',
      twitter_id: '9',
      content: 'hello',
      twitter_username: 'alice',
    });
    const parsed = JSON.parse(json);
    expect(parsed.data.text).toBe('hello');
    expect(parsed.includes.users[0].username).toBe('alice');
  });

  it('backupToAllTweets: INSERT JSON content', async () => {
    (pool.execute as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await backupToAllTweets('123', '{"data":{"text":"hi"}}');
    expect(pool.execute).toHaveBeenCalledWith(
      'INSERT IGNORE INTO `all_tweets` (tweet_id, content) VALUES (?, ?)',
      ['123', '{"data":{"text":"hi"}}'],
    );
  });
});
