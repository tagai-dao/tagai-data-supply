import { BSC_TWEET_INSERT_COLUMNS, buildInsertTweetSql, REQUIRED_INSERT_COLUMNS } from '../../src/db/client';

describe('bsc_tweet insert contract (spec §5.1)', () => {
  it('includes tick column (NOT NULL)', () => {
    expect(BSC_TWEET_INSERT_COLUMNS).toContain('tick');
  });

  it('includes day_number and tweet_id', () => {
    expect(BSC_TWEET_INSERT_COLUMNS).toContain('tweet_id');
    expect(BSC_TWEET_INSERT_COLUMNS).toContain('day_number');
  });

  it('builds INSERT IGNORE against bsc_tweet', () => {
    const sql = buildInsertTweetSql();
    expect(sql).toContain('INSERT IGNORE INTO `bsc_tweet`');
    // 8 columns -> 8 placeholders
    expect((sql.match(/\?/g) ?? []).length).toBe(BSC_TWEET_INSERT_COLUMNS.length);
  });

  it('REQUIRED_INSERT_COLUMNS matches BSC_TWEET_INSERT_COLUMNS', () => {
    expect(REQUIRED_INSERT_COLUMNS).toEqual([...BSC_TWEET_INSERT_COLUMNS]);
  });
});
