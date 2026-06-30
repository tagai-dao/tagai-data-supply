-- 邀请码加 label（管理员为邀请码绑定的名字，spec §10.1 增强）
ALTER TABLE `bsc_tds_invite` ADD COLUMN `label` varchar(128) DEFAULT NULL AFTER `invite_secret_hash`;
