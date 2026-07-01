import 'dotenv/config';

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env ${key}`);
  return v;
}

export const config = {
  db: {
    host: required('TDS_DB_HOST'),
    port: Number(process.env.TDS_DB_PORT ?? 3306),
    user: required('TDS_DB_USER'),
    password: process.env.TDS_DB_PASSWORD ?? '', // 允许空密码（本地 root 无密码场景）
    database: required('TDS_DB_DATABASE'),
  },
  wsPort: Number(process.env.TDS_WS_PORT ?? 7700),
  httpPort: Number(process.env.TDS_HTTP_PORT ?? 7701),
  adminToken: required('TDS_ADMIN_TOKEN'),
  protocolVersion: process.env.TDS_PROTOCOL_VERSION ?? '1',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  tagaiApiBase: process.env.TAGAI_API_BASE ?? 'http://127.0.0.1:3001',
};
