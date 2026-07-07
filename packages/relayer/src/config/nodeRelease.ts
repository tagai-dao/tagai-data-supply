// Node CLI 发布信息（GitHub Release 二进制 + 版本门禁）

export interface NodeReleaseConfig {
  minMajor: number;
  githubRepo: string;
  releaseTagPrefix: string;
}

export function nodeReleaseConfig(): NodeReleaseConfig {
  return {
    minMajor: Number(process.env.TDS_NODE_MIN_MAJOR ?? 0),
    githubRepo: process.env.TDS_NODE_GITHUB_REPO ?? '',
    releaseTagPrefix: process.env.TDS_NODE_RELEASE_TAG_PREFIX ?? 'node-v',
  };
}

/** 各平台 Release 资产文件名（与 CI 上传一致） */
const ASSET_NAMES: Record<string, string> = {
  linux_amd64: 'tagai-node-linux-amd64',
  linux_arm64: 'tagai-node-linux-arm64',
  darwin_amd64: 'tagai-node-darwin-amd64',
  darwin_arm64: 'tagai-node-darwin-arm64',
  windows_amd64: 'tagai-node-windows-amd64.exe',
};

/** 构建 GitHub Release 下载 URL 表 */
export function buildNodeDownloadMap(
  cfg: NodeReleaseConfig,
  latestVersion: string,
): Record<string, string> {
  const repo = cfg.githubRepo.trim();
  if (!repo) return {};
  const tag = `${cfg.releaseTagPrefix}${latestVersion}`;
  const base = `https://github.com/${repo}/releases/download/${tag}`;
  const out: Record<string, string> = {};
  for (const [key, name] of Object.entries(ASSET_NAMES)) {
    out[key] = `${base}/${name}`;
  }
  return out;
}

/** 解析 node_version 字符串的 major */
export function parseNodeMajor(nodeVersion: string | undefined | null): number | null {
  if (!nodeVersion || typeof nodeVersion !== 'string') return null;
  const m = /^v?(\d+)/.exec(nodeVersion.trim());
  return m ? Number(m[1]) : null;
}

/** major 是否满足 Relayer 最低要求 */
export function isNodeMajorAllowed(nodeVersion: string | undefined | null, minMajor: number): boolean {
  if (minMajor <= 0) return true;
  const major = parseNodeMajor(nodeVersion);
  if (major == null) return true;
  return major >= minMajor;
}

export { ASSET_NAMES };
