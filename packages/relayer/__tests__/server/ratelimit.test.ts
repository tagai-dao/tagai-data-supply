import { IpRateLimiter } from '../../src/server/ratelimit';

describe('IpRateLimiter (spec §10.1)', () => {
  it('allows up to max within window', () => {
    const rl = new IpRateLimiter(3, 1000);
    expect(rl.allow('1.2.3.4', 0)).toBe(true);
    expect(rl.allow('1.2.3.4', 0)).toBe(true);
    expect(rl.allow('1.2.3.4', 0)).toBe(true);
    expect(rl.allow('1.2.3.4', 0)).toBe(false);
  });

  it('tracks IPs independently', () => {
    const rl = new IpRateLimiter(2, 1000);
    expect(rl.allow('1.1.1.1', 0)).toBe(true);
    expect(rl.allow('2.2.2.2', 0)).toBe(true);
    expect(rl.allow('1.1.1.1', 0)).toBe(true);
    expect(rl.allow('1.1.1.1', 0)).toBe(false);
    expect(rl.allow('2.2.2.2', 0)).toBe(true);
  });

  it('resets after window elapses', () => {
    const rl = new IpRateLimiter(1, 1000);
    expect(rl.allow('9.9.9.9', 0)).toBe(true);
    expect(rl.allow('9.9.9.9', 500)).toBe(false);
    expect(rl.allow('9.9.9.9', 1001)).toBe(true);
  });
});
