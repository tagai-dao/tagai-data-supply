import { formatPinoLogLine, formatPinoMessage, useColor } from '../../src/utils/logColors';

describe('logColors', () => {
  const orig = process.env.NO_COLOR;

  afterEach(() => {
    if (orig === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = orig;
  });

  it('useColor false when NO_COLOR set', () => {
    process.env.NO_COLOR = '1';
    expect(useColor()).toBe(false);
  });

  it('formatPinoLogLine plain when NO_COLOR', () => {
    process.env.NO_COLOR = '1';
    const line = formatPinoLogLine({
      level: 30,
      time: Date.UTC(2026, 6, 1, 7, 35, 8),
      msg: 'task assigned',
      node_id: 'n1',
    });
    expect(line).toContain('[INFO]');
    expect(line).toContain('task assigned');
    expect(line).toContain('node_id=n1');
    expect(line).not.toContain('\x1b[');
  });

  it('formatPinoLogLine adds ansi for semantic msg when color enabled', () => {
    delete process.env.NO_COLOR;
    const prev = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    const line = formatPinoLogLine({
      level: 30,
      time: Date.UTC(2026, 6, 1, 7, 35, 8),
      msg: 'task assigned',
    });
    Object.defineProperty(process.stdout, 'isTTY', { value: prev, configurable: true });
    expect(line).toContain('\x1b[');
    expect(line).toContain('task assigned');
  });

  it('formatPinoMessage colors error red', () => {
    delete process.env.NO_COLOR;
    const prev = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    const out = formatPinoMessage({ msg: 'request error' }, 'msg', 'ERROR');
    Object.defineProperty(process.stdout, 'isTTY', { value: prev, configurable: true });
    expect(out).toContain('\x1b[31m');
  });
});
