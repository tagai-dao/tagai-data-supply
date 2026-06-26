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
