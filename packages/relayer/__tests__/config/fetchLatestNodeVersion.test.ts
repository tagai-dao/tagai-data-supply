import {
  pickLatestReleaseVersion,
  resetLatestNodeVersionCache,
  versionFromReleaseTag,
  fetchLatestNodeVersion,
} from '../../src/config/fetchLatestNodeVersion';

describe('fetchLatestNodeVersion', () => {
  const cfg = {
    minMajor: 0,
    githubRepo: 'org/repo',
    releaseTagPrefix: 'node-v',
  };

  beforeEach(() => {
    resetLatestNodeVersionCache();
    jest.restoreAllMocks();
  });

  it('versionFromReleaseTag parses node-v prefix', () => {
    expect(versionFromReleaseTag('node-v1.2.3', 'node-v')).toBe('1.2.3');
    expect(versionFromReleaseTag('v1.0.0', 'node-v')).toBeNull();
  });

  it('pickLatestReleaseVersion skips draft/prerelease and picks max semver', () => {
    const latest = pickLatestReleaseVersion([
      { tag_name: 'node-v0.1.0', draft: false, prerelease: false },
      { tag_name: 'node-v0.2.0', draft: false, prerelease: true },
      { tag_name: 'node-v0.1.5', draft: false, prerelease: false },
      { tag_name: 'other-v9.9.9', draft: false, prerelease: false },
    ], 'node-v');
    expect(latest).toBe('0.1.5');
  });

  it('fetchLatestNodeVersion calls GitHub API and caches result', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ([
        { tag_name: 'node-v1.0.0', draft: false, prerelease: false },
        { tag_name: 'node-v1.2.0', draft: false, prerelease: false },
      ]),
    } as Response);

    const v1 = await fetchLatestNodeVersion(cfg);
    const v2 = await fetchLatestNodeVersion(cfg);

    expect(v1).toBe('1.2.0');
    expect(v2).toBe('1.2.0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.github.com/repos/org/repo/releases');
  });

  it('fetchLatestNodeVersion uses stale cache when GitHub fails after TTL', async () => {
    jest.useFakeTimers();
    process.env.TDS_NODE_RELEASE_CACHE_TTL_MS = '1000';

    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([
          { tag_name: 'node-v0.9.0', draft: false, prerelease: false },
        ]),
      } as Response)
      .mockRejectedValueOnce(new Error('network down'));

    expect(await fetchLatestNodeVersion(cfg)).toBe('0.9.0');
    jest.advanceTimersByTime(2000);
    expect(await fetchLatestNodeVersion(cfg)).toBe('0.9.0');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
    delete process.env.TDS_NODE_RELEASE_CACHE_TTL_MS;
  });

  it('fetchLatestNodeVersion throws when repo missing and no cache', async () => {
    await expect(fetchLatestNodeVersion({ ...cfg, githubRepo: '' }))
      .rejects.toThrow(/TDS_NODE_GITHUB_REPO/);
  });
});
