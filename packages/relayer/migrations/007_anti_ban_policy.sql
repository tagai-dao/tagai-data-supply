-- 防封号策略：subtask watermark、node 权重、assignment declined 状态
ALTER TABLE `bsc_tds_subtask`
  ADD COLUMN `watermark_tweet_id` varchar(64) DEFAULT NULL AFTER `cursor`;

ALTER TABLE `bsc_tds_node`
  ADD COLUMN `weight` tinyint NOT NULL DEFAULT 5 COMMENT '调度权重 1-10' AFTER `cookie_health`;

ALTER TABLE `bsc_tds_assignment`
  MODIFY COLUMN `status` enum('assigned','running','done','failed','reclaimed','declined') NOT NULL DEFAULT 'assigned';
