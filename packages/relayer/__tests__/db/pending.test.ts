jest.mock('../../src/db/pool', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
  },
  closePool: jest.fn(),
}));

import { pool } from '../../src/db/pool';
import { tweetExistsInBscTweet, insertPendingTweet } from '../../src/db/pending';

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
});
