// spec §2: PM2 部署（沿用 tiptag 约定）
module.exports = {
  apps: [
    {
      name: 'tagai-data-supply-relayer',
      script: 'dist/server/app.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
