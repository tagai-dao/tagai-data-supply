import { config } from '../config';
import { logger } from '../utils/logger';

export type Fetcher = (url: string, body: any) => Promise<any>;

export interface VerifyResult {
  twitter_id: string;
  twitter_username: string;
  account_type: number;
}

const defaultFetcher: Fetcher = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
};

/** 规范化 TagAI 用户名（trim 后去 @） */
export function normalizeTagaiUsername(raw: string): string {
  return String(raw ?? '').trim().replace(/^@/, '');
}

// spec §3.3: 调 tagai-api /user/verify，仅传 username，account_type 由库记录返回
export async function verifyTagaiAccount(
  twitter_username: string,
  apiBase: string = config.tagaiApiBase,
  fetcher: Fetcher = defaultFetcher,
): Promise<VerifyResult | null> {
  const username = normalizeTagaiUsername(twitter_username);
  if (!username) return null;
  try {
    const url = `${apiBase}/user/verify`;
    const body = { twitter_username: username };
    const r = await fetcher(url, body);
    if (r && r.c === 0 && r.d && r.d.ok && r.d.twitter_id) {
      const accountType = Number(r.d.account_type);
      if (accountType !== 0 && accountType !== 2) return null;
      return {
        twitter_id: String(r.d.twitter_id),
        twitter_username: String(r.d.twitter_username ?? username),
        account_type: accountType,
      };
    }
    return null;
  } catch (e: any) {
    logger.warn({ err: e.message }, 'verifyTagaiAccount failed');
    return null;
  }
}
