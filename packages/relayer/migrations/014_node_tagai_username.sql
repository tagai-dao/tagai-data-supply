-- 节点绑定的 TagAI 推特用户名（策展账号展示用）
ALTER TABLE `bsc_tds_node`
  ADD COLUMN `tagai_username` varchar(64) DEFAULT NULL AFTER `tagai_account_type`;
