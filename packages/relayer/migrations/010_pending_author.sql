-- 推文作者信息（供 tiptag-server newUser 入库 account 表）
ALTER TABLE `bsc_tds_pending_tweet`
  ADD COLUMN `twitter_username` varchar(64) DEFAULT NULL AFTER `twitter_id`,
  ADD COLUMN `twitter_name` varchar(128) DEFAULT NULL AFTER `twitter_username`,
  ADD COLUMN `profile` varchar(512) DEFAULT NULL AFTER `twitter_name`;
