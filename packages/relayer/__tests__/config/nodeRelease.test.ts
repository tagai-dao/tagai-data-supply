import { buildNodeDownloadMap, isNodeMajorAllowed, parseNodeMajor } from '../../src/config/nodeRelease';

describe('nodeRelease config', () => {
  it('buildNodeDownloadMap from github repo', () => {
    const m = buildNodeDownloadMap({
      minMajor: 1,
      githubRepo: 'org/repo',
      releaseTagPrefix: 'node-v',
    }, '1.0.0');
    expect(m.linux_amd64).toBe(
      'https://github.com/org/repo/releases/download/node-v1.0.0/tagai-node-linux-amd64',
    );
    expect(m.windows_amd64).toContain('.exe');
  });

  it('isNodeMajorAllowed', () => {
    expect(parseNodeMajor('1.2.3')).toBe(1);
    expect(isNodeMajorAllowed('0.9.0', 1)).toBe(false);
    expect(isNodeMajorAllowed('1.0.0', 1)).toBe(true);
    expect(isNodeMajorAllowed(undefined, 1)).toBe(true);
  });
});
