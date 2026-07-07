import { pool } from './pool';

/** mysql2 执行 CALL 时，首个 result set 可能是 RowDataPacket[]，而非单行对象 */
function extractCallFirstRow(raw: unknown): Record<string, unknown> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const head = raw[0];
  if (Array.isArray(head)) return head[0] as Record<string, unknown> | undefined;
  if (head && typeof head === 'object') return head as Record<string, unknown>;
  return undefined;
}

/** 读取 TDS 发帖策展 AI system prompt（仅通过存储过程） */
export async function getTdsContentCurationPrompt(): Promise<string | null> {
  const [raw] = await pool.execute('CALL tds_get_content_curation_prompt()');
  const row = extractCallFirstRow(raw);
  const prompt = row?.prompt;
  return prompt != null ? String(prompt) : null;
}

/** 更新 TDS 发帖策展 AI system prompt（仅通过存储过程；空值由存储过程拒绝） */
export async function setTdsContentCurationPrompt(value: string): Promise<void> {
  await pool.execute(
    'CALL tds_set_content_curation_prompt(?)',
    [value],
  );
}

export { extractCallFirstRow };
