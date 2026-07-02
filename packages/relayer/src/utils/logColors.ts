/** 终端日志语义着色（配合 pino 自定义 pretty 输出） */

const RESET = '\x1b[0m';
const DIM = '\x1b[2m';

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  brightGreen: '\x1b[92m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
} as const;

type ColorName = keyof typeof COLORS;

const LEVEL_NUM_TO_LABEL: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
};

const LEVEL_COLORS: Record<string, ColorName> = {
  trace: 'white',
  debug: 'white',
  info: 'white',
  warn: 'yellow',
  error: 'red',
  fatal: 'red',
};

const INFO_RULES: Array<{ pattern: RegExp; color: ColorName }> = [
  { pattern: /handleTaskResult failed|request error|verify-schema failed/i, color: 'red' },
  { pattern: /task assigned|ingest|promoted|task_result/i, color: 'green' },
  { pattern: /ws authed|node registered|ws server listening/i, color: 'brightGreen' },
  { pattern: /scheduler dispatched|scheduler started|scheduler tick/i, color: 'blue' },
  { pattern: /ws closed|assignments reclaimed|redispatch|stale assignment/i, color: 'magenta' },
  { pattern: /task_decline|dispatch send failed|task_result rejected|cookie health alert/i, color: 'yellow' },
  { pattern: /invite created|subtask created/i, color: 'cyan' },
  { pattern: /ws hello timeout|ws offline timeout|ws error|ws unknown/i, color: 'yellow' },
  { pattern: /retained data cleanup|alert emitted/i, color: 'white' },
];

export function useColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}

function wrap(color: ColorName, text: string, enabled: boolean): string {
  if (!enabled) return text;
  return `${COLORS[color]}${text}${RESET}`;
}

function messageColor(levelLabel: string, msg: string): ColorName {
  const lvl = levelLabel.toLowerCase();
  if (lvl === 'error' || lvl === 'fatal') return 'red';
  if (lvl === 'warn') return 'yellow';
  for (const rule of INFO_RULES) {
    if (rule.pattern.test(msg)) return rule.color;
  }
  return 'white';
}

function formatTime(epochMs: number): string {
  const d = new Date(epochMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatFields(log: Record<string, unknown>): string {
  const skip = new Set(['level', 'time', 'pid', 'hostname', 'msg']);
  const parts: string[] = [];
  for (const [k, v] of Object.entries(log)) {
    if (skip.has(k) || v === undefined || v === null) continue;
    const val = typeof v === 'object' ? JSON.stringify(v) : String(v);
    parts.push(`${k}=${val}`);
  }
  return parts.length ? ` ${parts.join(' ')}` : '';
}

/** 将 pino JSON 日志格式化为彩色单行 */
export function formatPinoLogLine(log: Record<string, unknown>): string {
  const enabled = useColor();
  const levelNum = Number(log.level ?? 30);
  const levelLabel = LEVEL_NUM_TO_LABEL[levelNum] ?? 'INFO';
  const msg = String(log.msg ?? '');
  const time = formatTime(Number(log.time ?? Date.now()));
  const fields = formatFields(log);

  const timePart = enabled ? `${DIM}${COLORS.white}${time}${RESET}` : time;
  const levelPart = wrap(LEVEL_COLORS[levelLabel.toLowerCase()] ?? 'white', `[${levelLabel}]`, enabled);
  const msgPart = wrap(messageColor(levelLabel, msg), msg, enabled);
  const fieldsPart = enabled ? `${DIM}${fields}${RESET}` : fields;

  return `${timePart} ${levelPart} ${msgPart}${fieldsPart}`;
}

/** pino-pretty messageFormat 兼容导出 */
export function formatPinoMessage(
  log: Record<string, unknown>,
  messageKey: string,
  levelLabel: string,
): string {
  const enabled = useColor();
  const msg = String(log[messageKey] ?? '');
  return wrap(messageColor(levelLabel, msg), msg, enabled);
}
