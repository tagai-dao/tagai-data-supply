-- spec §4.4: ingestion 对 reply 去重需查 bsc_relation_reply.reply_id
-- 部署时由 DBA 执行（GRANT 需高权限，relayer 用户自身无权执行）
GRANT SELECT (reply_id) ON tiptag.bsc_relation_reply TO 'tds_writer'@'%';
FLUSH PRIVILEGES;
