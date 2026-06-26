import { createHash, randomBytes, randomUUID } from 'crypto';
import { nanoid } from 'nanoid';

// spec §10.1: 节点 token 用 sha256 哈希存储（确定性、可索引 O(1) 查找）。
// bcrypt 不可索引，不适合 API token 场景；sha256 + 唯一索引是标准做法。

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function hashToken(token: string): string {
  return sha256(token);
}

export function generateNodeId(): string {
  return 'node_' + nanoid(16);
}

export function generateInviteId(): string {
  return 'inv_' + nanoid(16);
}

// token = <random>.<random>，明文返回给节点一次，relayer 仅存 sha256
export function generateNodeToken(): string {
  return 'tok_' + randomBytes(24).toString('hex');
}

export function generateInviteSecret(): string {
  return 'inv_' + randomBytes(18).toString('hex');
}

// 生成 node_id 与明文 token，返回 {node_id, token, token_hash}
export function issueNodeCredentials() {
  const node_id = generateNodeId();
  const token = generateNodeToken();
  return { node_id, token, token_hash: hashToken(token) };
}

export function issueInvite() {
  const invite_id = generateInviteId();
  const invite_secret = generateInviteSecret();
  return { invite_id, invite_secret, invite_secret_hash: hashToken(invite_secret) };
}
