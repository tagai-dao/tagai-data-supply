import pino from 'pino';
import { Writable } from 'stream';
import { formatPinoLogLine } from './logColors';

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

const level = process.env.LOG_LEVEL ?? 'info';

export const logger = shouldUsePretty()
  ? pino({ level }, buildPrettyStream())
  : pino({ level });
