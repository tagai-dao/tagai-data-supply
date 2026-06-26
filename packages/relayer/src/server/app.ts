import express from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { nodeRoutes } from './routes/node';
import { adminAuth } from './middleware/adminAuth';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// 节点注册（REST，spec §10.1）
app.use('/node', nodeRoutes);

// 管理 API（固定 token 鉴权，spec §12）—— 路由 P6 填充
app.use('/admin', adminAuth, (_req, res) => res.json({ ok: true }));

if (require.main === module) {
  app.listen(config.httpPort, () => {
    logger.info({ port: config.httpPort }, 'relayer http listening');
  });
}

export { app };
