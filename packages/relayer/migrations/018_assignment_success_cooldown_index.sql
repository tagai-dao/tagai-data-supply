-- 018: 加速调度器按完成时间查询“成功且有回传数据”的子任务冷静期
ALTER TABLE `tds_assignment`
  ADD INDEX `idx_status_update_subtask` (`status`, `update_at`, `subtask_id`);
