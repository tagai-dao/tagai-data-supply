// spec §8: 调度器主循环
// - 加载 enabled subtask + online nodes
// - 自适应：节点 ≤ 阈值 → 串行队列（随机间隔）；> 阈值 → 并行派发不同 subtask
// - 单节点串行：节点有 active assignment 不再派
// - 派发 task_assign，建 assignment

import { logger } from '../utils/logger';
import {
  listEnabledSubtasks, getSubtaskLastRunMap, getNodeActiveAssignment,
  type SubtaskRow,
} from '../db/tasks';
import { listOnlineNodes } from '../db/client';
import { registry } from '../server/connections';
import { rankSubtasks, type SelectableSubtask } from './selector';
import { candidateNodes, selectNode, dispatchDelaySec, type DispatchableNode } from './dispatcher';
import { dispatchTaskAssign } from './assign';
import { reclaimStaleAssignments } from './stale';
import {
  SERIAL_NODE_THRESHOLD,
  DISPATCH_MIN_INTERVAL_SEC,
  DISPATCH_MAX_INTERVAL_SEC,
} from '../config/constants';

const TICK_MS = 5_000; // 调度循环间隔

export interface SchedulerDeps {
  listEnabledSubtasks: typeof listEnabledSubtasks;
  getSubtaskLastRunMap: typeof getSubtaskLastRunMap;
  listOnlineNodes: typeof listOnlineNodes;
  getNodeActiveAssignment: typeof getNodeActiveAssignment;
  dispatchTaskAssign: typeof dispatchTaskAssign;
  reclaimStaleAssignments: typeof reclaimStaleAssignments;
  send: (nodeId: string, msg: object) => boolean;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

const defaultDeps: SchedulerDeps = {
  listEnabledSubtasks,
  getSubtaskLastRunMap,
  listOnlineNodes,
  getNodeActiveAssignment,
  dispatchTaskAssign,
  reclaimStaleAssignments,
  send: (nodeId, msg) => registry.send(nodeId, msg),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now: () => Date.now(),
};

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private ticking = false; // 串行化 tick，避免并发绕过串行间隔

  constructor(private deps: SchedulerDeps = defaultDeps) {}

  start(): void {
    if (this.timer) return;
    this.running = true;
    this.tick(); // 立即跑一次
    this.timer = setInterval(() => this.tick(), TICK_MS);
    logger.info('scheduler started');
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.ticking) return; // 上一次未完成，跳过（spec §8.3 串行间隔不被并发绕过）
    this.ticking = true;
    try {
      await this.dispatchOnce();
    } catch (e) {
      logger.error(e, 'scheduler tick error');
    } finally {
      this.ticking = false;
    }
  }

  // 单次调度：尝试为空闲节点派发任务
  async dispatchOnce(): Promise<{ dispatched: number }> {
    await this.deps.reclaimStaleAssignments().catch((e) => {
      logger.warn(e, 'reclaim stale assignments failed');
    });

    const subtasks = await this.deps.listEnabledSubtasks();
    if (subtasks.length === 0) return { dispatched: 0 };

    const lastRunMap = await this.deps.getSubtaskLastRunMap();
    const selectable: SelectableSubtask[] = subtasks.map((s) => ({
      ...s,
      last_run_at: lastRunMap.get(s.subtask_id) ?? null,
    }));
    const ranked = rankSubtasks(selectable);

    const onlineNodes = await this.deps.listOnlineNodes();
    const candidates = candidateNodes(onlineNodes) as DispatchableNode[];
    if (candidates.length === 0) return { dispatched: 0 };

    const serialMode = onlineNodes.length <= SERIAL_NODE_THRESHOLD;
    let dispatched = 0;

    for (const subtask of ranked) {
      if (candidates.length === 0) break;
      // 选择一个空闲节点（无 active assignment）
      const free = await this.pickFreeNode(candidates, subtask);
      if (!free) continue;

      const ok = await this.assignAndDispatch(subtask, free);
      if (ok) {
        dispatched++;
        // 从候选移除（本轮不再派给它）
        const idx = candidates.findIndex((c) => c.node_id === free.node_id);
        if (idx >= 0) candidates.splice(idx, 1);
        // spec §8.3: 每次派发后固定间隔 30s（Node 侧另有更严格门禁）
        if (serialMode) {
          const delay = dispatchDelaySec(DISPATCH_MIN_INTERVAL_SEC, DISPATCH_MAX_INTERVAL_SEC);
          await this.deps.sleep(delay * 1000);
        }
      }
    }

    if (dispatched > 0) logger.info({ dispatched, serialMode, online: onlineNodes.length }, 'scheduler dispatched');
    return { dispatched };
  }

  private async pickFreeNode(candidates: DispatchableNode[], _subtask: SubtaskRow): Promise<DispatchableNode | null> {
    // spec §8.1: 单节点串行 — 过滤掉有 active assignment 的节点
    const free: DispatchableNode[] = [];
    for (const c of candidates) {
      const active = await this.deps.getNodeActiveAssignment(c.node_id);
      if (!active) {
        free.push({ ...c, recent_load: 0, tz_recent_count: 0 });
      }
    }
    if (free.length === 0) return null;
    return selectNode(free);
  }

  private async assignAndDispatch(subtask: SubtaskRow, node: DispatchableNode): Promise<boolean> {
    const { ok, assignmentId } = await this.deps.dispatchTaskAssign(
      subtask,
      node.node_id,
      (nodeId, msg) => this.deps.send(nodeId, msg),
    );
    if (!ok) {
      logger.warn({ node_id: node.node_id, subtask_id: subtask.subtask_id }, 'dispatch send failed (node not connected)');
      return false;
    }
    logger.info({ node_id: node.node_id, subtask_id: subtask.subtask_id, assignment_id: assignmentId }, 'task assigned');
    return true;
  }
}

export const scheduler = new Scheduler();
