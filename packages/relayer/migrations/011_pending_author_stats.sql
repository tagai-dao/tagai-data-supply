-- 作者 Twitter 统计（供 tiptag-server newUser 完整入库 account）
ALTER TABLE `bsc_tds_pending_tweet`
  ADD COLUMN `followers` int DEFAULT NULL AFTER `profile`,
  ADD COLUMN `followings` int DEFAULT NULL AFTER `followers`,
  ADD COLUMN `tweet_count` int DEFAULT NULL AFTER `followings`,
  ADD COLUMN `like_count` int DEFAULT NULL AFTER `tweet_count`,
  ADD COLUMN `listed_count` int DEFAULT NULL AFTER `like_count`,
  ADD COLUMN `verified` tinyint(1) DEFAULT NULL AFTER `listed_count`;
