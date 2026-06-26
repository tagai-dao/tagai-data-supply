import { sha256, hashToken, generateNodeId, generateNodeToken, issueNodeCredentials, issueInvite } from '../../src/auth/tokens';

describe('tokens (spec §10.1)', () => {
  it('sha256 is deterministic', () => {
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abc')).toHaveLength(64);
  });

  it('hashToken equals sha256', () => {
    expect(hashToken('xyz')).toBe(sha256('xyz'));
  });

  it('generateNodeId has node_ prefix', () => {
    expect(generateNodeId()).toMatch(/^node_[A-Za-z0-9_-]{16}$/);
  });

  it('generateNodeToken produces unique tokens', () => {
    const a = generateNodeToken();
    const b = generateNodeToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^tok_/);
  });

  it('issueNodeCredentials: token hash matches token', () => {
    const c = issueNodeCredentials();
    expect(c.token_hash).toBe(sha256(c.token));
    expect(c.node_id).toMatch(/^node_/);
  });

  it('issueInvite: secret hash matches secret', () => {
    const i = issueInvite();
    expect(i.invite_secret_hash).toBe(sha256(i.invite_secret));
    expect(i.invite_id).toMatch(/^inv_/);
  });
});
