import express from 'express';
import { createServer } from 'http';
import { config } from '../config';
import { logger } from '../utils/logger';
import { nodeRoutes } from './routes/node';
import { adminAuth } from './middleware/adminAuth';
import { createWsServer } from './ws';
import { scheduler } from '../scheduler';
import { cleanupRetainedData } from '../health/db';

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
  // spec §8: 启动调度器
  scheduler.start();
  // spec §5.5: 数据保留清理 job（每天一次）
  const cleanupTimer = setInterval(() => { cleanupRetainedData().catch(() => {}); }, 24 * 60 * 60 * 1000);
  cleanupTimer.unref?.();
  const shutdown = () => { scheduler.stop(); clearInterval(cleanupTimer); process.exit(0); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export { app };


