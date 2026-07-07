import { pool } from './pool';

/** 读取 TDS 发帖策展 AI system prompt（仅通过存储过程） */
export async function getTdsContentCurationPrompt(): Promise<string | null> {
  const [rows] = await pool.execute<any[]>(
    'CALL tds_get_content_curation_prompt()',
  );
  return rows[0]?.prompt ?? null;
}

/** 更新 TDS 发帖策展 AI system prompt（仅通过存储过程；空值由存储过程拒绝） */
export async function setTdsContentCurationPrompt(value: string): Promise<void> {
  await pool.execute(
    'CALL tds_set_content_curation_prompt(?)',
    [value],
  );
}
