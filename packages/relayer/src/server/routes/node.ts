import { Router, Request, Response } from 'express';
import { config } from '../../config';
import { consumeInvite, createNode } from '../../db/client';
import { issueNodeCredentials } from '../../auth/tokens';
import { IpRateLimiter } from '../ratelimit';
import { logger } from '../../utils/logger';
import { PROTOCOL_VERSION } from '@tds/shared';

// spec §10.1: 注册按 IP 限频（默认 5 次/10 分钟）
const registerLimiter = new IpRateLimiter(
  Number(process.env.TDS_REGISTER_MAX_PER_IP ?? 5),
  Number(process.env.TDS_REGISTER_WINDOW_MS ?? 10 * 60 * 1000),
);

export const nodeRoutes = Router();

nodeRoutes.get('/_ping', (_req, res) => res.json({ ok: true }));

// spec §10.1: 节点注册
nodeRoutes.post('/register', async (req: Request, res: Response) => {
  const ip = (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');

  if (!registerLimiter.allow(ip)) {
    res.status(429).json({ c: 1, m: 'rate limited' });
    return;
  }

  const { invite_secret, protocol_version, timezone, label } = req.body ?? {};
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

  // spec §10.1: 一次性消费 invite
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
    label: label ?? null,
  });

  logger.info({ node_id: cred.node_id, ip }, 'node registered');
  res.json({
    c: 0,
    d: {
      node_id: cred.node_id,
      node_token: cred.token, // 明文仅此一次返回
      protocol_version: PROTOCOL_VERSION,
    },
  });
});
