import { Router, Request, Response } from 'express';
import { config } from '../../config';
import { consumeInvite, createNode, linkInviteNode } from '../../db/client';
import { issueNodeCredentials } from '../../auth/tokens';
import { verifyTagaiAccount } from '../../tagai/client';
import { IpRateLimiter } from '../ratelimit';
import { logger } from '../../utils/logger';
import { PROTOCOL_VERSION } from '@tds/shared';

// spec §10.1: 注册按 IP 限频（默认 5 次/10 分钟）
export const registerLimiter = new IpRateLimiter(
  Number(process.env.TDS_REGISTER_MAX_PER_IP ?? 5),
  Number(process.env.TDS_REGISTER_WINDOW_MS ?? 10 * 60 * 1000),
);

export const nodeRoutes = Router();

nodeRoutes.get('/_ping', (_req, res) => res.json({ ok: true }));

// setup 预检：验证收益账号，不消费 invite（仅需 username，类型由 tagai-api 库记录返回）
nodeRoutes.post('/verify-account', async (req: Request, res: Response) => {
  const { tagai_username } = req.body ?? {};
  if (!tagai_username) {
    res.status(400).json({ c: 1, m: 'tagai_username required' });
    return;
  }
  const verified = await verifyTagaiAccount(String(tagai_username));
  if (!verified) {
    res.status(403).json({
      c: 1,
      m: 'tagai account not verified: user not found, steem not bound, or tagclaw inactive',
    });
    return;
  }
  res.json({
    c: 0,
    d: {
      ok: true,
      twitter_id: verified.twitter_id,
      twitter_username: verified.twitter_username,
      account_type: verified.account_type,
    },
  });
});

// spec §10.1: 节点注册
nodeRoutes.post('/register', async (req: Request, res: Response) => {
  const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');

  if (!registerLimiter.allow(ip)) {
    res.status(429).json({ c: 1, m: 'rate limited' });
    return;
  }

  const { invite_secret, protocol_version, timezone, label, tagai_username, tagai_account_type } = req.body ?? {};
  if (!invite_secret || !protocol_version || !timezone) {
    res.status(400).json({ c: 1, m: 'missing fields' });
    return;
  }

  // spec §6: 协议版本协商
  if (protocol_version !== config.protocolVersion) {
    res.status(400).json({
      c: 1,
      m: `protocol version mismatch: server=${config.protocolVersion}, node=${protocol_version}`,
    });
    return;
  }

  // spec §3.3: 绑定 tagai 收益账号（twitter_username），验证后存 twitter_id + account_type
  if (!tagai_username) {
    res.status(400).json({ c: 1, m: 'tagai_username required' });
    return;
  }
  const verified = await verifyTagaiAccount(String(tagai_username));
  if (!verified) {
    res.status(403).json({ c: 1, m: 'tagai account not verified (not bound to steem or inactive)' });
    return;
  }
  const accountType = verified.account_type;

  // spec §10.1: 一次性消费 invite（验证通过后再消费，减少无效 invite 消耗）
  const consumed = await consumeInvite(invite_secret);
  if (!consumed.ok || !consumed.invite_id) {
    res.status(403).json({ c: 1, m: 'invalid or used invite' });
    return;
  }

  const cred = issueNodeCredentials();
  await createNode({
    node_id: cred.node_id,
    token_hash: cred.token_hash,
    invite_id: consumed.invite_id,
    timezone,
    // label 优先用节点自报，否则继承邀请码绑定的名字
    label: label ?? consumed.label ?? null,
    tagai_account: verified.twitter_id,
    tagai_account_type: accountType,
  });
  // 回填 invite.node_id，建立 invite↔node 双向关联
  await linkInviteNode(consumed.invite_id, cred.node_id);

  logger.info({ node_id: cred.node_id, ip, tagai_username: verified.twitter_username }, 'node registered');
  res.json({
    c: 0,
    d: {
      node_id: cred.node_id,
      node_token: cred.token, // 明文仅此一次返回
      protocol_version: PROTOCOL_VERSION,
    },
  });
});
