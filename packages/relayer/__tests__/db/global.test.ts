import { extractCallFirstRow } from '../../src/db/global';

describe('extractCallFirstRow', () => {
  it('handles mysql2 CALL nested result set', () => {
    const raw = [[{ prompt: 'hello' }], { fieldCount: 0 }];
    expect(extractCallFirstRow(raw)?.prompt).toBe('hello');
  });

  it('handles flat row array', () => {
    const raw = [{ prompt: 'hello' }];
    expect(extractCallFirstRow(raw)?.prompt).toBe('hello');
  });

  it('returns undefined for empty result', () => {
    expect(extractCallFirstRow([[]])).toBeUndefined();
    expect(extractCallFirstRow([])).toBeUndefined();
  });
});
