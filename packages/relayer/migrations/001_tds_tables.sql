-- tagai-data-supply 新表（前缀 bsc_tds_，复用 tiptag 库，与链前缀 bsc_ 一致）
-- 沿用 tiptag 手工应用迁移约定：直接对线上库执行此文件。
-- spec §5.2 / §5.1：所有表均含 update_at（ON UPDATE CURRENT_TIMESTAMP）

-- 节点
CREATE TABLE IF NOT EXISTS `bsc_tds_node` (
  `node_id` varchar(64) NOT NULL,
  `token_hash` varchar(128) NOT NULL,
  `label` varchar(128) DEFAULT NULL,
  `status` enum('online','offline','cooldown','disabled') NOT NULL DEFAULT 'offline',
  `timezone` varchar(64) NOT NULL DEFAULT 'UTC',
  `last_heartbeat` datetime DEFAULT NULL,
  `cookie_health` int NOT NULL DEFAULT 100,
  `tagai_account` varchar(64) DEFAULT NULL,
  `tagai_account_type` tinyint DEFAULT NULL,
  `invite_id` varchar(64) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`node_id`),
  KEY `idx_status_health` (`status`, `cookie_health`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tds 抓取节点';

-- 主题
CREATE TABLE IF NOT EXISTS `bsc_tds_topic` (
  `topic_id` varchar(64) NOT NULL,
  `name` varchar(128) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `tick` varchar(32) NOT NULL DEFAULT 'no-tick-of-tiptag',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`topic_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tds 抓取主题';

-- 子任务（spec §5.2：tick 创建必填；cursor varchar(64)）
CREATE TABLE IF NOT EXISTS `bsc_tds_subtask` (
  `subtask_id` varchar(64) NOT NULL,
  `topic_id` varchar(64) NOT NULL,
  `type` enum('hashtag','user_timeline','keyword','list') NOT NULL,
  `mode` enum('continuous','round') NOT NULL DEFAULT 'continuous',
  `params` json NOT NULL,
  `cursor` varchar(64) DEFAULT NULL,
  `cursor_owner_node` varchar(64) DEFAULT NULL,
  `schedule_cron` varchar(64) DEFAULT NULL,
  `window_minutes` int DEFAULT NULL,
  `priority` int NOT NULL DEFAULT 5,
  `tick` varchar(32) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`subtask_id`),
  KEY `idx_topic` (`topic_id`),
  KEY `idx_enabled_mode` (`enabled`, `mode`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tds 子任务';

-- 任务派发
CREATE TABLE IF NOT EXISTS `bsc_tds_assignment` (
  `assignment_id` varchar(64) NOT NULL,
  `subtask_id` varchar(64) NOT NULL,
  `node_id` varchar(64) NOT NULL,
  `assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` enum('assigned','running','done','failed','reclaimed') NOT NULL DEFAULT 'assigned',
  `last_run_at` datetime DEFAULT NULL,
  `result_summary` json DEFAULT NULL,
  `accepted_count` int NOT NULL DEFAULT 0,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`assignment_id`),
  KEY `idx_node_status` (`node_id`, `status`),
  KEY `idx_subtask` (`subtask_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tds 任务派发记录';

-- 原始推文留痕（spec §5.1：去重前暂存）
CREATE TABLE IF NOT EXISTS `bsc_tds_tweet_raw` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `subtask_id` varchar(64) NOT NULL,
  `node_id` varchar(64) NOT NULL,
  `tweet_id` varchar(64) NOT NULL,
  `raw_json` json NOT NULL,
  `promoted` tinyint(1) NOT NULL DEFAULT 0,
  `received_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_received` (`received_at`),
  KEY `idx_tweet` (`tweet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tds 原始推文留痕';

-- 节点指标
CREATE TABLE IF NOT EXISTS `bsc_tds_node_metric` (
  `node_id` varchar(64) NOT NULL,
  `date` date NOT NULL,
  `fetched_count` int NOT NULL DEFAULT 0,
  `deduped_count` int NOT NULL DEFAULT 0,
  `error_count` int NOT NULL DEFAULT 0,
  `update_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`node_id`, `date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tds 节点指标';

-- cookie 健康日志
CREATE TABLE IF NOT EXISTS `bsc_tds_cookie_health_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `node_id` varchar(64) NOT NULL,
  `ts` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `event` enum('ok','rate_limited','auth_failed','error') NOT NULL,
  `detail` text,
  `update_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_node_ts` (`node_id`, `ts`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tds cookie 健康日志';

-- 一次性 invite（spec §5.2：status active/used/revoked）
CREATE TABLE IF NOT EXISTS `bsc_tds_invite` (
  `invite_id` varchar(64) NOT NULL,
  `invite_secret_hash` varchar(128) NOT NULL,
  `label` varchar(128) DEFAULT NULL,
  `node_id` varchar(64) DEFAULT NULL,
  `status` enum('active','used','revoked') NOT NULL DEFAULT 'active',
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`invite_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='tds 一次性 invite';
