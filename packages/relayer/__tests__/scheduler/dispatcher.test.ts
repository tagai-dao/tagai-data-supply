import {
  nodeWeight, candidateNodes, weightedRandomSelect, selectNode, dispatchDelaySec, DispatchableNode,
} from '../../src/scheduler/dispatcher';
import type { NodeRow } from '../../src/db/client';

function mkNode(id: string, over: Partial<DispatchableNode> = {}): DispatchableNode {
  return {
    node_id: id, token_hash: 'h', label: null, status: 'online', timezone: 'UTC',
    last_heartbeat: null, cookie_health: 100, invite_id: null, created_at: new Date(0),
    recent_load: 0, tz_recent_count: 0,
    ...over,
  } as any;
}

describe('dispatcher (spec §8.2/§8.3)', () => {
  it('nodeWeight: health=0 → weight 0', () => {
    expect(nodeWeight(mkNode('n', { cookie_health: 0 }))).toBe(0);
  });

  it('nodeWeight: higher health → higher weight', () => {
    const w1 = nodeWeight(mkNode('n', { cookie_health: 30 }));
    const w2 = nodeWeight(mkNode('n', { cookie_health: 100 }));
    expect(w2).toBeGreaterThan(w1);
  });

  it('nodeWeight: higher load → lower weight', () => {
    const w1 = nodeWeight(mkNode('n', { recent_load: 0 }));
    const w2 = nodeWeight(mkNode('n', { recent_load: 10 }));
    expect(w2).toBeLessThan(w1);
  });

  it('nodeWeight: higher admin weight → higher weight', () => {
    const w1 = nodeWeight(mkNode('n', { weight: 3, cookie_health: 100 }));
    const w2 = nodeWeight(mkNode('n', { weight: 9, cookie_health: 100 }));
    expect(w2).toBeGreaterThan(w1);
  });

  it('nodeWeight: same tz concentration → lower weight (错峰)', () => {
    const w1 = nodeWeight(mkNode('n', { tz_recent_count: 0 }));
    const w2 = nodeWeight(mkNode('n', { tz_recent_count: 5 }));
    expect(w2).toBeLessThan(w1);
  });

  it('candidateNodes filters offline and low health', () => {
    const nodes: NodeRow[] = [
      mkNode('a', { status: 'online', cookie_health: 100 }),
      mkNode('b', { status: 'offline', cookie_health: 100 }),
      mkNode('c', { status: 'online', cookie_health: 10 }),
    ] as any;
    const cands = candidateNodes(nodes);
    expect(cands.map((n) => n.node_id)).toEqual(['a']);
  });

  it('weightedRandomSelect respects weights with seeded rng', () => {
    const items = [{ k: 'a', weight: 0 }, { k: 'b', weight: 100 }];
    // rng=0 → 选第一个有效项 b
    expect(weightedRandomSelect(items, () => 0)?.k).toBe('b');
  });

  it('weightedRandomSelect returns null when all weight 0', () => {
    expect(weightedRandomSelect([{ k: 'a', weight: 0 }], () => 0)).toBeNull();
  });

  it('selectNode returns null on empty', () => {
    expect(selectNode([], () => 0)).toBeNull();
  });

  it('selectNode prefers high-weight node', () => {
    const a = mkNode('a', { cookie_health: 100 });
    const b = mkNode('b', { cookie_health: 30 });
    // 多次随机，高权重应多数胜出
    let aCount = 0;
    for (let i = 0; i < 100; i++) {
      if (selectNode([a, b], Math.random)?.node_id === 'a') aCount++;
    }
    expect(aCount).toBeGreaterThan(60);
  });

  it('dispatchDelaySec fixed 30s interval', () => {
    expect(dispatchDelaySec(30, 30, () => 0.5)).toBeCloseTo(30, 1);
  });
});
