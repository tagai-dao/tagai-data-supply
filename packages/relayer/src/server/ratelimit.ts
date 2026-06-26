// spec §10.1: 注册按 IP 限频，缓解 invite secret 泄露后被批量注册。
// 简单滑动窗口：每 IP 在 windowMs 内最多 max 次。

interface Bucket {
  count: number;
  resetAt: number;
}

export class IpRateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly sweepIntervalMs = 60_000;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {
    // 定期清理过期 bucket，防内存泄漏
    setInterval(() => this.sweep(), this.sweepIntervalMs).unref?.();
  }

  /** 返回 true 表示允许，false 表示超限。 */
  allow(ip: string, now = Date.now()): boolean {
    const b = this.buckets.get(ip);
    if (!b || b.resetAt <= now) {
      this.buckets.set(ip, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (b.count >= this.max) return false;
    b.count += 1;
    return true;
  }

  private sweep(now = Date.now()): void {
    for (const [ip, b] of this.buckets) {
      if (b.resetAt <= now) this.buckets.delete(ip);
    }
  }

  // 测试/重置用
  reset(): void {
    this.buckets.clear();
  }
}
