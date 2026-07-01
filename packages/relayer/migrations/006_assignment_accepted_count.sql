-- 单次派发（assignment）已入库 pending 计数，防灌水
ALTER TABLE `bsc_tds_assignment`
  ADD COLUMN `accepted_count` int NOT NULL DEFAULT 0 AFTER `result_summary`;
