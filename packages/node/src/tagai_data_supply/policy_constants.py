"""Node 防封号策略常量（由 Node 本地执行，Relayer 不干预时区/间隔）。"""

# 本地静默时段：0:00–8:00（按 tz_offset）
QUIET_HOUR_START = 0
QUIET_HOUR_END = 8

# 任务完成后随机冷却（分钟）
MIN_COOLDOWN_MINUTES = 3
MAX_COOLDOWN_MINUTES = 30

# 每日抓取推文上限（API 返回条数累计）
DAILY_TWEET_LIMIT = 3000

# 单次 assignment 翻页
MAX_PAGES_PER_TASK = 3
PAGE_INTERVAL_SEC = 3
