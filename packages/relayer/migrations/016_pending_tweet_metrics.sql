-- 帖子互动指标（twikit legacy.reply_count / views.count）
ALTER TABLE `bsc_tds_pending_tweet`
  ADD COLUMN `reply_count` int DEFAULT NULL COMMENT '帖子回复数' AFTER `verified`,
  ADD COLUMN `view_count` bigint DEFAULT NULL COMMENT '帖子浏览量' AFTER `reply_count`;
