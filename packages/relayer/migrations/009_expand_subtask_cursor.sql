-- X/Twitter 分页 cursor 为长 base64 串，varchar(64) 不足
ALTER TABLE `bsc_tds_subtask`
  MODIFY COLUMN `cursor` TEXT DEFAULT NULL;
