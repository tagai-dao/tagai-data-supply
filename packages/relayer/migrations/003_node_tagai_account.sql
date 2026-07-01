-- bsc_tds_node 加绑定 tagai 账号字段（spec §3.1）
ALTER TABLE `bsc_tds_node`
  ADD COLUMN `tagai_account` varchar(64) DEFAULT NULL AFTER `cookie_health`,
  ADD COLUMN `tagai_account_type` tinyint DEFAULT NULL AFTER `tagai_account`;
