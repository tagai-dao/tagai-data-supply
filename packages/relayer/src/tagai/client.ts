import { config } from '../config';
import { logger } from '../utils/logger';

export type Fetcher = (url: string, body: any) => Promise<any>;

// 默认 fetcher（用全局 fetch，Node 18+ 内置）
const defaultFetcher: Fetcher = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};

// spec §3.3: 调 tagai-api /user/verify 验证账号。
// apiBase 可注入便于测试（config 在导入时预加载，测试无法靠 env 覆盖）。
export async function verifyTagaiAccount(
  twitter_id: string,
  account_type: number,
  apiBase: string = config.tagaiApiBase,
  fetcher: Fetcher = defaultFetcher,
): Promise<boolean> {
  try {
    const url = `${apiBase}/user/verify`;
    const body = { twitter_id, account_type };
    const r = await fetcher(url, body);
    return !!(r && r.c === 0 && r.d && r.d.ok);
  } catch (e: any) {
    logger.warn({ err: e.message }, 'verifyTagaiAccount failed');
    return false;
  }
}
