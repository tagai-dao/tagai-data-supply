import pino from 'pino';
import { Writable } from 'stream';
import { formatPinoLogLine } from './logColors';
import { createLogCaptureStream } from './logBuffer';

function shouldUsePretty(): boolean {
  if (process.env.LOG_FORMAT === 'json') return false;
  if (process.env.LOG_FORMAT === 'pretty') return true;
  return process.env.NODE_ENV !== 'production';
}

function buildPrettyStream(): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      const text = chunk.toString().trim();
      if (!text) {
        cb();
        return;
      }
      for (const line of text.split('\n')) {
        if (!line) continue;
        try {
          const log = JSON.parse(line) as Record<string, unknown>;
          process.stdout.write(`${formatPinoLogLine(log)}\n`);
        } catch {
          process.stdout.write(`${line}\n`);
        }
      }
      cb();
    },
  });
}

const stdoutLevel = (process.env.LOG_LEVEL ?? 'info') as pino.Level;

// 根 logger 用 trace，使缓冲可收录 debug；终端/文件仍按 LOG_LEVEL 过滤
export const logger = pino(
  { level: 'trace' },
  pino.multistream([
    { level: 'trace', stream: createLogCaptureStream() },
    {
      level: stdoutLevel,
      stream: shouldUsePretty() ? buildPrettyStream() : process.stdout,
    },
  ]),
);
