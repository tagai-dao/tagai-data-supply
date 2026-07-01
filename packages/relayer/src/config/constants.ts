// spec §5.1: 硬编码 bsc_ 前缀（与 tagai-api 一致）
export const TWEET_TABLE = 'bsc_tweet';

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

// spec §8.5: 心跳与回收
export const HEARTBEAT_PING_INTERVAL_SEC = 30;
export const NODE_OFFLINE_TIMEOUT_SEC = 60;
export const RECLAIM_GRACE_PERIOD_SEC = 10;
export const TASK_MAX_RETRIES = 3;

// 单次 assignment（派发给某 node 的一轮）最多入库 pending 条数
export const ASSIGNMENT_MAX_TWEETS = 200;

// spec §5.5: 数据保留期（天）
export const RETENTION = {
  cookie_health_log: 30,
  node_metric: 90,
} as const;
