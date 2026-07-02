"""Node 防封号策略常量（由 Node 本地执行，Relayer 不干预时区/间隔）。"""

# 本地静默时段：0:00–8:00（按 tz_offset）
QUIET_HOUR_START = 0
QUIET_HOUR_END = 8

# 任务完成后随机冷却（分钟）
MIN_COOLDOWN_MINUTES = 3
MAX_COOLDOWN_MINUTES = 30

# 每日抓取推文上限（API 返回条数累计）
DAILY_TWEET_LIMIT = 3000

# 单次 assignment 翻页（测试阶段暂限 1 页，上线前改回 3）
MAX_PAGES_PER_TASK = 1
PAGE_INTERVAL_SEC = 3
# 本页最远推文早于该小时数则停止翻页
PAGE_MAX_TWEET_AGE_HOURS = 24
# 单任务内回复父帖 get_tweet_by_id 补拉上限
MAX_PARENT_FETCHES_PER_TASK = 5

# 养号模拟（SocialSimulator）
POST_INTERVAL_HOURS = 30
SOCIAL_DAYTIME_START = 8
SOCIAL_DAYTIME_END = 22
DAILY_LIKES_MIN = 1
DAILY_LIKES_MAX = 5
LIKE_SOURCE_TASK_RATIO = 0.5  # 任务池 vs Home 时间线
INTERACTION_POOL_MAX = 500
LIKED_IDS_MAX = 2000
POST_TEXT_MAX_LEN = 280
