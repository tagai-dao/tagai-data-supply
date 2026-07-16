// 业务链表（按链分表）；TDS 基础设施表为共享 tds_*，无链前缀
export const TWEET_TABLE = 'bsc_tweet'; // verify-schema / 遗留 insert 默认表
/** 全链去重：任一链已入库则跳过 pending */
export const TWEET_TABLES = ['bsc_tweet', 'rh_tweet'] as const;
export const RELATION_REPLY_TABLES = ['bsc_relation_reply', 'rh_relation_reply'] as const;

// spec §5.1: 无社区归属时的 tick 哨兵
export const NO_TICK_SENTINEL = 'no-tick-of-tiptag';

// spec §5.4: cookie_health 阈值与算法常量
export const COOKIE_HEALTH_INITIAL = 100;
export const COOKIE_HEALTH_DISPATCH_THRESHOLD = 30;
export const COOKIE_HEALTH_REENABLE = 60;
export const COOKIE_HEALTH_OK_GAIN = 5;
export const COOKIE_HEALTH_RATE_LIMITED_PENALTY = 20;
export const COOKIE_HEALTH_ERROR_PENALTY = 15;
export const COOKIE_HEALTH_CONSECUTIVE_ERROR_THRESHOLD = 3;
export const COOKIE_COOLDOWN_MINUTES = 15;

// spec §8.3: 串行/并行切换阈值
export const SERIAL_NODE_THRESHOLD = 2;

// spec §8.3: 节奏控制（Relayer 派发间隔，Node 侧另有更严格门禁）
export const DISPATCH_MIN_INTERVAL_SEC = 30;
export const DISPATCH_MAX_INTERVAL_SEC = 30;

// 子任务成功完成且确实回传数据后，暂停再次派发的时间
export const SUBTASK_SUCCESS_COOLDOWN_MINUTES = 10;

// spec §8.5: 心跳与回收
export const HEARTBEAT_PING_INTERVAL_SEC = 30;
export const NODE_OFFLINE_TIMEOUT_SEC = 60;
export const RECLAIM_GRACE_PERIOD_SEC = 10;
export const TASK_MAX_RETRIES = 3;
// assignment 处于 assigned/running 超过该秒数无结果 → 回收并重派
export const ASSIGNMENT_ACTIVE_TIMEOUT_SEC = 120;

// 单次 assignment（派发给某 node 的一轮）最多入库 pending 条数
export const ASSIGNMENT_MAX_TWEETS = 200;

// spec §5.5: 数据保留期（天）
export const RETENTION = {
  cookie_health_log: 30,
  node_metric: 90,
} as const;
