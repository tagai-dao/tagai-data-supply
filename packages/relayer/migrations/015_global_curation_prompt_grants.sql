-- relayer 管理后台读写 global.tds_content_curation_prompt 仅通过存储过程
-- 部署时由 DBA 执行（GRANT 需高权限，relayer 用户自身无权执行）
-- 请将 tiptag 替换为实际库名

DROP PROCEDURE IF EXISTS tds_get_content_curation_prompt;
DROP PROCEDURE IF EXISTS tds_set_content_curation_prompt;

DELIMITER //

CREATE PROCEDURE tds_get_content_curation_prompt()
BEGIN
  SELECT `val` AS prompt
  FROM `global`
  WHERE `name` = 'tds_content_curation_prompt'
  LIMIT 1;
END //

CREATE PROCEDURE tds_set_content_curation_prompt(IN p_val TEXT)
BEGIN
  IF p_val IS NULL OR TRIM(p_val) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'prompt cannot be empty';
  END IF;

  INSERT INTO `global` (`name`, `val`)
  VALUES ('tds_content_curation_prompt', p_val)
  ON DUPLICATE KEY UPDATE `val` = p_val;
END //

DELIMITER ;

GRANT EXECUTE ON PROCEDURE tiptag.tds_get_content_curation_prompt TO 'tds_writer'@'%';
GRANT EXECUTE ON PROCEDURE tiptag.tds_set_content_curation_prompt TO 'tds_writer'@'%';
FLUSH PRIVILEGES;
