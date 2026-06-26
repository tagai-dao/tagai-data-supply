import { Router } from 'express';

// spec §10.1: 节点注册路由。P0 为 stub，P1 实现 POST /register。
export const nodeRoutes = Router();

nodeRoutes.get('/_ping', (_req, res) => res.json({ ok: true }));
