-- 017: TDS 基础设施表去链前缀 + tds_writer 权限调整
-- 前置：与 tiptag-server src/db/sql/v16.sql 二选一执行 rename（勿重复 RENAME）
-- GRANT 需 DBA / 高权限账号执行；tds_writer 自身无权 GRANT

-- ========== 1) 表 rename（若 v16 已执行可整段注释掉）==========
-- RENAME TABLE
--   `bsc_tds_node` TO `tds_node`,
--   `bsc_tds_topic` TO `tds_topic`,
--   `bsc_tds_subtask` TO `tds_subtask`,
--   `bsc_tds_assignment` TO `tds_assignment`,
--   `bsc_tds_node_metric` TO `tds_node_metric`,
--   `bsc_tds_cookie_health_log` TO `tds_cookie_health_log`,
--   `bsc_tds_invite` TO `tds_invite`,
--   `bsc_tds_pending_tweet` TO `tds_pending_tweet`;

-- ========== 2) 新表权限（显式表名，避免通配符歧义）==========
GRANT ALL PRIVILEGES ON tiptag.tds_node TO 'tds_writer'@'%';
GRANT ALL PRIVILEGES ON tiptag.tds_topic TO 'tds_writer'@'%';
GRANT ALL PRIVILEGES ON tiptag.tds_subtask TO 'tds_writer'@'%';
GRANT ALL PRIVILEGES ON tiptag.tds_assignment TO 'tds_writer'@'%';
GRANT ALL PRIVILEGES ON tiptag.tds_node_metric TO 'tds_writer'@'%';
GRANT ALL PRIVILEGES ON tiptag.tds_cookie_health_log TO 'tds_writer'@'%';
GRANT ALL PRIVILEGES ON tiptag.tds_invite TO 'tds_writer'@'%';
GRANT ALL PRIVILEGES ON tiptag.tds_pending_tweet TO 'tds_writer'@'%';

-- 全链去重 SELECT
GRANT SELECT (tweet_id) ON tiptag.bsc_tweet TO 'tds_writer'@'%';
GRANT SELECT (tweet_id) ON tiptag.rh_tweet TO 'tds_writer'@'%';
GRANT SELECT (reply_id) ON tiptag.bsc_relation_reply TO 'tds_writer'@'%';
GRANT SELECT (reply_id) ON tiptag.rh_relation_reply TO 'tds_writer'@'%';

-- 已有权限保持（幂等）
GRANT INSERT ON tiptag.all_tweets TO 'tds_writer'@'%';

-- 可选：回收旧表权限（表已 rename 后通常自动失效；若仍有旧名权限可清理）
-- REVOKE ALL PRIVILEGES ON tiptag.bsc_tds_node FROM 'tds_writer'@'%';
-- …对其余 bsc_tds_* 同理

FLUSH PRIVILEGES;
