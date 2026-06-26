// spec §5.4: cookie_health 算法（纯逻辑，可测试）
import {
  COOKIE_HEALTH_INITIAL,
  COOKIE_HEALTH_OK_GAIN,
  COOKIE_HEALTH_RATE_LIMITED_PENALTY,
  COOKIE_HEALTH_ERROR_PENALTY,
  COOKIE_HEALTH_CONSECUTIVE_ERROR_THRESHOLD,
  COOKIE_HEALTH_DISPATCH_THRESHOLD,
} from '../config/constants';

export type CookieEvent = 'ok' | 'rate_limited' | 'auth_failed' | 'error';

export interface HealthState {
  cookie_health: number;
  status: 'online' | 'offline' | 'cooldown' | 'disabled';
  cooldown_until: number | null; // epoch ms
  consecutive_errors: number;
}

export interface HealthUpdate {
  health: number;
  status: HealthState['status'];
  cooldown_until: number | null;
  consecutive_errors: number;
  alert?: string; // 触发告警的事件
}

export function initialHealth(): HealthState {
  return {
    cookie_health: COOKIE_HEALTH_INITIAL,
    status: 'online',
    cooldown_until: null,
    consecutive_errors: 0,
  };
}

// spec §5.4: 应用一次 cookie 事件
export function applyEvent(state: HealthState, event: CookieEvent, now: number): HealthUpdate {
  let health = state.cookie_health;
  let status = state.status;
  let cooldown_until = state.cooldown_until;
  let consecutive_errors = state.consecutive_errors;
  let alert: string | undefined;

  switch (event) {
    case 'ok':
      health = Math.min(COOKIE_HEALTH_INITIAL, health + COOKIE_HEALTH_OK_GAIN);
      consecutive_errors = 0;
      // 若在 cooldown 且已过冷却时间 → 恢复 online
      if (status === 'cooldown' && cooldown_until && now >= cooldown_until) {
        status = 'online';
        cooldown_until = null;
      }
      break;
    case 'rate_limited':
      health = Math.max(0, health - COOKIE_HEALTH_RATE_LIMITED_PENALTY);
      consecutive_errors = 0;
      status = 'cooldown';
      cooldown_until = now + 15 * 60 * 1000; // spec §5.4: cooldown 15 分钟
      break;
    case 'auth_failed':
      health = 0;
      status = 'disabled';
      cooldown_until = null;
      consecutive_errors = 0;
      alert = 'cookie auth_failed — node disabled,需用户更新 cookie';
      break;
    case 'error':
      consecutive_errors += 1;
      health = Math.max(0, health - COOKIE_HEALTH_ERROR_PENALTY);
      if (consecutive_errors >= COOKIE_HEALTH_CONSECUTIVE_ERROR_THRESHOLD) {
        status = 'cooldown';
        cooldown_until = now + 15 * 60 * 1000;
      }
      break;
  }

  // health 低于阈值 → 暂停派发（用 cooldown 表达）
  if (status === 'online' && health < COOKIE_HEALTH_DISPATCH_THRESHOLD) {
    status = 'cooldown';
    cooldown_until = now + 15 * 60 * 1000;
  }

  return { health, status, cooldown_until, consecutive_errors, alert };
}

// spec §9: re-enable 时重置为 60（渐进验证）
export function reEnableHealth(): Partial<HealthUpdate> {
  return { health: 60, status: 'online', cooldown_until: null, consecutive_errors: 0 };
}
