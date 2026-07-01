import { isValidTweetId, dayNumber } from '../../src/ingestion';

describe('ingestion helpers (spec §5/§13)', () => {
  it('isValidTweetId accepts snowflake-like ids', () => {
    expect(isValidTweetId('1234567890123456789')).toBe(true);
  });

  it('isValidTweetId rejects non-numeric / too short / wrong type', () => {
    expect(isValidTweetId('abc')).toBe(false);
    expect(isValidTweetId('123')).toBe(false); // too short
    expect(isValidTweetId(1234567890123456789)).toBe(false); // number not string
    expect(isValidTweetId(null)).toBe(false);
  });

  it('dayNumber returns YYYYMMDD integer', () => {
    const d = new Date(Date.UTC(2026, 5, 26)); // 2026-06-26
    expect(dayNumber(d)).toBe(20260626);
  });
});

jest.mock('../../src/db/pool', () => ({
  pool: { execute: jest.fn(), query: jest.fn() },
  closePool: jest.fn(),
}));
jest.mock('../../src/db/client', () => ({
  insertTweet: jest.fn(),   // 保留 mock 以断言"不再调用"
  findNodeById: jest.fn(),
}));
jest.mock('../../src/db/tasks', () => ({
  getSubtask: jest.fn(),
  updateSubtaskCursor: jest.fn(),
  setAssignmentStatus: jest.fn(),
  addAssignmentAcceptedCount: jest.fn().mockResolvedValue(1),
}));
jest.mock('../../src/db/pending', () => ({
  tweetExistsInBscTweet: jest.fn(),
  insertPendingTweet: jest.fn(),
  backupToAllTweets: jest.fn(),
}));

import { ingestTaskResult } from '../../src/ingestion';
import { insertTweet, findNodeById } from '../../src/db/client';
import { getSubtask } from '../../src/db/tasks';
import { tweetExistsInBscTweet, insertPendingTweet, backupToAllTweets } from '../../src/db/pending';

beforeAll(() => {
  Object.assign(process.env, {
    TDS_DB_HOST: 'h', TDS_DB_USER: 'u', TDS_DB_PASSWORD: 'p',
    TDS_DB_DATABASE: 'd', TDS_ADMIN_TOKEN: 't',
  });
});

beforeEach(() => jest.clearAllMocks());

describe('ingestTaskResult (spec §4.2)', () => {
  it('推文已在 bsc_tweet → 跳过，deduped++', async () => {
    (getSubtask as jest.Mock).mockResolvedValue({ tick: 'SPACEX', topic_id: 't1' });
    (findNodeById as jest.Mock).mockResolvedValue({ tagai_account: '111', tagai_account_type: 0 });
    (tweetExistsInBscTweet as jest.Mock).mockResolvedValue(true);
    const r = await ingestTaskResult({
      subtask_id: 's1', node_id: 'n1', assignment_id: 'asg_1', status: 'done',
      tweets: [{ tweet_id: '1800000000000000001', twitter_id: '9', content: 'hi', tweet_time: null }],
    });
    expect(r.deduped).toBe(1);
    expect(insertPendingTweet).not.toHaveBeenCalled();
    expect(insertTweet).not.toHaveBeenCalled();
  });

  it('insertPendingTweet 返回 false（UNIQUE 重复）→ deduped++', async () => {
    (getSubtask as jest.Mock).mockResolvedValue({ tick: 'SPACEX', topic_id: 't1' });
    (findNodeById as jest.Mock).mockResolvedValue({ tagai_account: '111', tagai_account_type: 0 });
    (tweetExistsInBscTweet as jest.Mock).mockResolvedValue(false);
    (insertPendingTweet as jest.Mock).mockResolvedValue(false);
    const r = await ingestTaskResult({
      subtask_id: 's1', node_id: 'n1', assignment_id: 'asg_1', status: 'done',
      tweets: [{ tweet_id: '1800000000000000004', twitter_id: '9', content: 'hi', tweet_time: null }],
    });
    expect(r.deduped).toBe(1);
    expect(r.promoted).toBe(0);
    expect(backupToAllTweets).not.toHaveBeenCalled();
  });

  it('推文不在 bsc_tweet → 写 pending + all_tweets，promoted++', async () => {
    (getSubtask as jest.Mock).mockResolvedValue({ tick: 'SPACEX', topic_id: 't1' });
    (findNodeById as jest.Mock).mockResolvedValue({ tagai_account: '111', tagai_account_type: 0 });
    (tweetExistsInBscTweet as jest.Mock).mockResolvedValue(false);
    (insertPendingTweet as jest.Mock).mockResolvedValue(true);
    const r = await ingestTaskResult({
      subtask_id: 's1', node_id: 'n1', assignment_id: 'asg_1', status: 'done',
      tweets: [{ tweet_id: '1800000000000000002', twitter_id: '9', content: 'hi', tweet_time: null }],
    });
    expect(r.promoted).toBe(1);
    expect(insertPendingTweet).toHaveBeenCalledWith(expect.objectContaining({
      tweet_id: '1800000000000000002', tagai_account: '111', tagai_account_type: 0, tick: 'SPACEX',
    }));
    expect(backupToAllTweets).toHaveBeenCalled();
  });

  it('node 无绑定账号 → 推文不写 pending（跳过）', async () => {
    (getSubtask as jest.Mock).mockResolvedValue({ tick: 'SPACEX' });
    (findNodeById as jest.Mock).mockResolvedValue({ tagai_account: null, tagai_account_type: null });
    (tweetExistsInBscTweet as jest.Mock).mockResolvedValue(false);
    const r = await ingestTaskResult({
      subtask_id: 's1', node_id: 'n1', assignment_id: 'asg_1', status: 'done',
      tweets: [{ tweet_id: '1800000000000000003', twitter_id: '9', content: 'hi', tweet_time: null }],
    });
    expect(insertPendingTweet).not.toHaveBeenCalled();
    expect(tweetExistsInBscTweet).not.toHaveBeenCalled();
    expect(r.promoted).toBe(0);
    expect(r.skipped).toBe(1);
  });
});
