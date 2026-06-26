// 测试默认 env（避免 config 加载时抛 Missing env）
process.env.TDS_DB_HOST = process.env.TDS_DB_HOST || 'localhost';
process.env.TDS_DB_USER = process.env.TDS_DB_USER || 'test';
process.env.TDS_DB_PASSWORD = process.env.TDS_DB_PASSWORD || 'test';
process.env.TDS_DB_DATABASE = process.env.TDS_DB_DATABASE || 'test';
process.env.TDS_ADMIN_TOKEN = process.env.TDS_ADMIN_TOKEN || 'test-admin-token';
