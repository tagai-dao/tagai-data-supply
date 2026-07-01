// spec §8.2: node 选择 — 加权随机 w = health * tz_affinity * (1/(1+load))
// spec §8.3: 节奏控制 — interval + jitter；单节点串行；按节点数自适应

import type { NodeRow } from '../db/client';
import { COOKIE_HEALTH_DISPATCH_THRESHOLD } from '../config/constants';

export interface DispatchableNode extends NodeRow {
  recent_load: number;       // 近期派发密度（计数）
  tz_recent_count: number;   // 近期同 tz 派发计数（错峰用）
}

// spec §8.2: 计算节点权重
export function nodeWeight(n: DispatchableNode): number {
  const health = Math.max(0, n.cookie_health);
  const adminWeight = Math.max(1, Math.min(10, n.weight ?? 5));
  const tzAffinity = 1 / (1 + (n.tz_recent_count ?? 0));
  const loadFactor = 1 / (1 + (n.recent_load ?? 0));
  return adminWeight * health * tzAffinity * loadFactor;
}

// spec §8.2: 候选过滤
export function candidateNodes(nodes: NodeRow[]): NodeRow[] {
  return nodes.filter(
    (n) => n.status === 'online' && n.cookie_health >= COOKIE_HEALTH_DISPATCH_THRESHOLD,
  );
}

// 加权随机选择
export function weightedRandomSelect<T extends { weight: number }>(items: T[], rng: () => number = Math.random): T | null {
  const valid = items.filter((i) => i.weight > 0);
  if (valid.length === 0) return null;
  const total = valid.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const it of valid) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return valid[valid.length - 1];
}

export function selectNode(
  nodes: DispatchableNode[],
  rng: () => number = Math.random,
): DispatchableNode | null {
  const weighted = nodes.map((n) => ({ node: n, weight: nodeWeight(n) }));
  const picked = weightedRandomSelect(weighted, rng);
  return picked ? picked.node : null;
}

// spec §8.3: 节奏控制 — 计算 interval + jitter（秒）
export function dispatchDelaySec(
  minSec: number,
  maxSec: number,
  rng: () => number = Math.random,
): number {
  return minSec + rng() * (maxSec - minSec);
}
