import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { config } from '../config';
import { logger } from '../utils/logger';
import { nodeRoutes } from './routes/node';
import { adminAuth } from './middleware/adminAuth';
import { createWsServer } from './ws';
import { scheduler } from '../scheduler';
import { cleanupRetainedData } from '../health/db';
import { adminRoutes } from '../admin/routes';
import { asyncHandler } from './middleware/asyncHandler';

// 全局兜底：任何未捕获的 async 异常不崩进程（DB 抖动等）
process.on('unhandledRejection', (err) => {
  logger.error({ err: (err as Error)?.message }, 'unhandledRejection (not crashing)');
});
process.on('uncaughtException', (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'uncaughtException (not crashing)');
});

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// 节点注册（REST，spec §10.1）
app.use('/node', nodeRoutes);

// 管理 API（固定 token 鉴权，spec §12）
app.use('/admin', adminAuth, adminRoutes);

// 管理后台 SPA 静态托管（构建产物）。
// dev 模式 __dirname=src/server → src/admin/public；
// 生产模式 __dirname=dist/server → dist/admin/public（build:all 会拷贝）
const WEB_CANDIDATES = [
  path.join(__dirname, '..', 'admin', 'public'),       // dev: src/server -> src/admin/public
  path.join(__dirname, '..', '..', 'src', 'admin', 'public'), // dist/server -> src/admin/public
];
const WEB_DIR = WEB_CANDIDATES.find((d) => fs.existsSync(path.join(d, 'index.html')));
if (WEB_DIR) {
  app.use(express.static(WEB_DIR));
  // SPA history fallback：非 API 路由统一返回 index.html
  app.get(/^(?!\/(health|node|admin|ws|assets)).*/, (_req, res) => {
    res.sendFile(path.join(WEB_DIR, 'index.html'));
  });
  logger.info({ webDir: WEB_DIR }, 'admin web UI mounted at /');
} else {
  logger.warn('admin web UI not built — run `yarn build:web` in packages/relayer');
}

// 统一错误处理：路由内抛错返回 500 而非崩进程
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err: err?.message, stack: err?.stack }, 'request error');
  res.status(500).json({ c: 1, m: err?.message || 'internal error' });
});

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



