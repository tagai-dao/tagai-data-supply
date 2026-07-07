// 从 GitHub Releases 解析最新 node-v* 版本（带内存缓存）

import type { NodeReleaseConfig } from './nodeRelease';

const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;

interface GithubRelease {
  tag_name?: string;
  draft?: boolean;
  prerelease?: boolean;
}

interface VersionCache {
  version: string;
  expiresAt: number;
}

let cache: VersionCache | null = null;

/** 测试用：清空缓存 */
export function resetLatestNodeVersionCache(): void {
  cache = null;
}

function cacheTtlMs(): number {
  const raw = process.env.TDS_NODE_RELEASE_CACHE_TTL_MS;
  if (!raw) return DEFAULT_CACHE_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CACHE_TTL_MS;
}

function parseSemver(text: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa && !pb) return 0;
  if (!pa) return -1;
  if (!pb) return 1;
  for (let i = 0; i < 3; i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

/** 从 release tag（如 node-v0.1.2）提取 semver 字符串 */
export function versionFromReleaseTag(tagName: string, prefix: string): string | null {
  if (!tagName.startsWith(prefix)) return null;
  const version = tagName.slice(prefix.length).replace(/^v/, '');
  return parseSemver(version) ? version : null;
}

/** 在 release 列表中取符合 prefix 的最高 semver */
export function pickLatestReleaseVersion(
  releases: GithubRelease[],
  prefix: string,
): string | null {
  let best: string | null = null;
  for (const rel of releases) {
    if (rel.draft || rel.prerelease) continue;
    const tag = rel.tag_name;
    if (!tag) continue;
    const version = versionFromReleaseTag(tag, prefix);
    if (!version) continue;
    if (best == null || compareSemver(version, best) > 0) {
      best = version;
    }
  }
  return best;
}

async function fetchGithubReleases(repo: string): Promise<GithubRelease[]> {
  const url = `https://api.github.com/repos/${repo}/releases?per_page=100`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'tagai-data-supply-relayer',
  };
  const token = process.env.TDS_NODE_GITHUB_TOKEN?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  if (!resp.ok) {
    throw new Error(`GitHub releases API ${resp.status} for ${repo}`);
  }
  const data = await resp.json();
  if (!Array.isArray(data)) {
    throw new Error('GitHub releases API returned non-array');
  }
  return data as GithubRelease[];
}

/**
 * 解析最新 Node CLI 版本号。
 * 成功结果缓存；GitHub 失败时若有未过期缓存则沿用 stale 值。
 */
export async function fetchLatestNodeVersion(cfg: NodeReleaseConfig): Promise<string> {
  const repo = cfg.githubRepo.trim();
  if (!repo) {
    throw new Error('TDS_NODE_GITHUB_REPO is not configured');
  }

  const now = Date.now();
  if (cache && now < cache.expiresAt) {
    return cache.version;
  }

  try {
    const releases = await fetchGithubReleases(repo);
    const latest = pickLatestReleaseVersion(releases, cfg.releaseTagPrefix);
    if (!latest) {
      throw new Error(`no ${cfg.releaseTagPrefix}* release found in ${repo}`);
    }
    cache = { version: latest, expiresAt: now + cacheTtlMs() };
    return latest;
  } catch (err) {
    if (cache) {
      return cache.version;
    }
    throw err;
  }
}
