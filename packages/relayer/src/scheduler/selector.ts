// spec §8.1: subtask 选择 — priority DESC + 公平轮转（最久未执行优先）
import type { SubtaskRow } from '../db/tasks';

export interface SelectableSubtask extends SubtaskRow {
  last_run_at: Date | null; // 来自 assignment 聚合
}

// 排除某节点已持有游标的 continuous subtask（避免重复派发同一游标）由调用方过滤，
// 这里只做 priority + 公平排序。
export function rankSubtasks(list: SelectableSubtask[]): SelectableSubtask[] {
  return [...list].sort((a, b) => {
    // priority 高的优先（DESC）
    if (b.priority !== a.priority) return b.priority - a.priority;
    // last_run_at 早的（或 null）优先
    const ta = a.last_run_at ? a.last_run_at.getTime() : 0;
    const tb = b.last_run_at ? b.last_run_at.getTime() : 0;
    return ta - tb;
  });
}

export function pickNextSubtask(list: SelectableSubtask[]): SelectableSubtask | null {
  if (list.length === 0) return null;
  return rankSubtasks(list)[0];
}
