-- spec §4.4: relayer 用户权限调整
-- 1) bsc_tweet 加 SELECT(tweet_id)（ingestion 先查存在性需要）
-- 2) all_tweets 加 INSERT（原始备份需要；GRANT 幂等）
-- 部署时由 DBA 执行（GRANT 需高权限，relayer 用户自身无权执行）
GRANT SELECT (tweet_id) ON tiptag.bsc_tweet TO 'tds_writer'@'%';
GRANT INSERT ON tiptag.all_tweets TO 'tds_writer'@'%';
FLUSH PRIVILEGES;
