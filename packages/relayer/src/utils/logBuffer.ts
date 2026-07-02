/** 进程内日志环形缓冲，供管理后台查询（含 debug）。 */
import { Writable } from 'stream';
import { formatPinoLogLine } from './logColors';

const MAX_ENTRIES = 5000;

const LEVEL_NUM_TO_LABEL: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export interface LogRecord {
  id: number;
  time: number;
  level: string;
  msg: string;
  fields: Record<string, unknown>;
  line: string;
}

let nextId = 1;
const entries: LogRecord[] = [];

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

function normalize(log: Record<string, unknown>): LogRecord {
  const levelNum = Number(log.level ?? 30);
  const level = LEVEL_NUM_TO_LABEL[levelNum] ?? 'info';
  const skip = new Set(['level', 'time', 'pid', 'hostname', 'msg']);
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(log)) {
    if (!skip.has(k) && v !== undefined && v !== null) fields[k] = v;
  }
  return {
    id: nextId++,
    time: Number(log.time ?? Date.now()),
    level,
    msg: String(log.msg ?? ''),
    fields,
    line: stripAnsi(formatPinoLogLine(log)),
  };
}

/** 写入一条 pino JSON 日志 */
export function appendLogRecord(log: Record<string, unknown>): void {
  entries.push(normalize(log));
  while (entries.length > MAX_ENTRIES) entries.shift();
}

/** 供 pino multistream 挂载 */
export function createLogCaptureStream(): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          appendLogRecord(JSON.parse(line) as Record<string, unknown>);
        } catch {
          // 非 JSON 行忽略
        }
      }
      cb();
    },
  });
}

export interface LogQuery {
  levels?: string[];
  q?: string;
  sinceId?: number;
  limit?: number;
}

export function queryLogs(query: LogQuery = {}): { items: LogRecord[]; latestId: number } {
  const levels = query.levels?.map((l) => l.toLowerCase()).filter(Boolean);
  const q = query.q?.trim().toLowerCase();
  const sinceId = query.sinceId ?? 0;
  const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);

  let rows = entries.filter((e) => e.id > sinceId);
  if (levels && levels.length > 0) {
    rows = rows.filter((e) => levels.includes(e.level));
  }
  if (q) {
    rows = rows.filter((e) => {
      const hay = `${e.line} ${JSON.stringify(e.fields)}`.toLowerCase();
      return hay.includes(q);
    });
  }
  const latestId = entries.length ? entries[entries.length - 1].id : 0;
  return { items: rows.slice(-limit), latestId };
}

/** 测试用 */
export function clearLogBuffer(): void {
  entries.length = 0;
  nextId = 1;
}

export function logBufferSize(): number {
  return entries.length;
}
