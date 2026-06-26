import { applyEvent, initialHealth, CookieEvent } from '../../src/health';

describe('cookie_health algorithm (spec §5.4)', () => {
  const NOW = 1_000_000;

  it('ok increases health up to cap 100', () => {
    let s = { ...initialHealth(), cookie_health: 95 };
    const u = applyEvent(s, 'ok', NOW);
    expect(u.health).toBe(100); // 95+5 cap
  });

  it('rate_limited: -20, cooldown, cooldown_until set', () => {
    const s = initialHealth();
    const u = applyEvent(s, 'rate_limited', NOW);
    expect(u.health).toBe(80);
    expect(u.status).toBe('cooldown');
    expect(u.cooldown_until).toBe(NOW + 15 * 60 * 1000);
  });

  it('auth_failed: health 0, disabled, alert', () => {
    const s = initialHealth();
    const u = applyEvent(s, 'auth_failed', NOW);
    expect(u.health).toBe(0);
    expect(u.status).toBe('disabled');
    expect(u.alert).toMatch(/auth_failed/);
  });

  it('error: consecutive < 3 only penalizes health', () => {
    let s = initialHealth();
    let u = applyEvent(s, 'error', NOW);
    expect(u.consecutive_errors).toBe(1);
    expect(u.status).toBe('online');
    expect(u.health).toBe(85); // 100-15
  });

  it('error: consecutive >= 3 → cooldown', () => {
    let s: any = { cookie_health: 100, status: 'online', cooldown_until: null, consecutive_errors: 2 };
    const u = applyEvent(s, 'error', NOW);
    expect(u.consecutive_errors).toBe(3);
    expect(u.status).toBe('cooldown');
  });

  it('health below threshold (30) → cooldown', () => {
    const s = { ...initialHealth(), cookie_health: 35 };
    const u = applyEvent(s, 'error', NOW); // 35-15=20 < 30
    expect(u.health).toBe(20);
    expect(u.status).toBe('cooldown');
  });

  it('ok after cooldown elapsed → online', () => {
    const s = { cookie_health: 80, status: 'cooldown' as const, cooldown_until: NOW - 1, consecutive_errors: 0 };
    const u = applyEvent(s, 'ok', NOW);
    expect(u.status).toBe('online');
    expect(u.cooldown_until).toBeNull();
  });

  it('health never negative', () => {
    let s = { ...initialHealth(), cookie_health: 5 };
    const u = applyEvent(s, 'rate_limited', NOW);
    expect(u.health).toBe(0);
  });
});
