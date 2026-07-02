jest.mock('../../src/db/pool', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
  },
  closePool: jest.fn(),
}));

import { pool } from '../../src/db/pool';
import { tweetExistsInBscTweet, insertPendingTweet, buildAllTweetsContent, backupToAllTweets } from '../../src/db/pending';

beforeAll(() => {
  Object.assign(process.env, {
    TDS_DB_HOST: 'h', TDS_DB_USER: 'u', TDS_DB_PASSWORD: 'p',
    TDS_DB_DATABASE: 'd', TDS_ADMIN_TOKEN: 't',
  });
});

beforeEach(() => jest.clearAllMocks());

describe('pending DAL', () => {
  it('tweetExistsInBscTweet: SELECT 1 返回 true', async () => {
    (pool.execute as jest.Mock).mockResolvedValueOnce([[{ '1': 1 }], []]);
    const ok = await tweetExistsInBscTweet('123');
    expect(ok).toBe(true);
    expect(pool.execute).toHaveBeenCalledWith('SELECT 1 FROM `bsc_tweet` WHERE tweet_id = ? LIMIT 1', ['123']);
  });

  it('tweetExistsInBscTweet: 空结果返回 false', async () => {
    (pool.execute as jest.Mock).mockResolvedValueOnce([[], []]);
    const ok = await tweetExistsInBscTweet('123');
    expect(ok).toBe(false);
  });

  it('insertPendingTweet: INSERT pending 行', async () => {
    (pool.execute as jest.Mock).mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    await insertPendingTweet({
      tweet_id: '123', twitter_id: '111', content: 'hi', tweet_time: new Date(),
      node_id: 'n1', tagai_account: '111', tagai_account_type: 0,
      topic_id: 't1', subtask_id: 's1', tick: 'SPACEX',
    });
    const sql = (pool.execute as jest.Mock).mock.calls[0][0];
    expect(sql).toContain('INSERT IGNORE INTO `bsc_tds_pending_tweet`');
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
