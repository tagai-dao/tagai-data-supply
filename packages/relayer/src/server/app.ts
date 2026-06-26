import express from 'express';
import { createServer } from 'http';
import { config } from '../config';
import { logger } from '../utils/logger';
import { nodeRoutes } from './routes/node';
import { adminAuth } from './middleware/adminAuth';
import { createWsServer } from './ws';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// 节点注册（REST，spec §10.1）
app.use('/node', nodeRoutes);

// 管理 API（固定 token 鉴权，spec §12）—— 路由 P6 填充
app.use('/admin', adminAuth, (_req, res) => res.json({ ok: true }));

if (require.main === module) {
  const httpServer = createServer(app);
  // spec §6: WS 与 HTTP 共享端口（http 升级）
  createWsServer(httpServer);
  httpServer.listen(config.httpPort, () => {
    logger.info({ http: config.httpPort, ws: config.httpPort }, 'relayer listening');
  });
}

export { app };

