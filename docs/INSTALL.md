# tagai-data-supply 部署与运维

## Relayer 部署（PM2，spec §2）

### 前置
- Node.js >= 18
- MySQL（复用 tiptag 库 `tiptag`）
- 独立 DB 用户 `tds_writer`（权限：`tds_*` 全权 + `bsc_tweet` 仅 INSERT）

```sql
CREATE USER 'tds_writer'@'%' IDENTIFIED BY '<pwd>';
GRANT ALL PRIVILEGES ON tiptag.tds_* TO 'tds_writer'@'%';
GRANT INSERT ON tiptag.bsc_tweet TO 'tds_writer'@'%';
FLUSH PRIVILEGES;
```

### 建表
```bash
mysql -u tds_writer -p tiptag < packages/relayer/migrations/001_tds_tables.sql
```

### 核对线上 bsc_tweet schema（spec §5.1 Critical）
```bash
cd packages/relayer
cp .env.example .env  # 填 DB 凭据、ADMIN_TOKEN
yarn install
yarn build:shared
yarn build
yarn verify-schema
# 必须输出 "bsc_tweet schema OK"；若缺 UNIQUE(tweet_id) 则去重策略需改
```

### 启动（PM2）
```bash
cd packages/relayer
pm2 start ecosystem.config.cjs
pm2 logs tagai-data-supply-relayer
pm2 save
```

环境变量见 `.env.example`。关键：
- `TDS_ADMIN_TOKEN`：管理 API 固定 token
- `TDS_PROTOCOL_VERSION`：协议版本（与 node 一致）
- `TDS_ALERT_WEBHOOK`：告警 webhook（可选）

## Node 部署（用户自部署，spec §11）

### 方式 A：pip 安装
```bash
git clone <repo> && cd tagai-data-supply/packages/node
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,scraper]"
```

### 方式 B：预编译二进制（全平台，spec §11/P7）
从 GitHub Releases 下载对应平台 `tagai-node` 二进制。

### 配置流程
```bash
# 1. 管理员在 relayer 后台生成 invite，获得 invite_secret
# 2. 节点配置 + 注册
tagai-node configure --http-base http://<relayer>:7701 --invite-secret <invite_secret>
# 3. 登录 cookie（ct0 / auth_token）
tagai-node login
# 4. 运行
tagai-node run
```

本地文件 `~/.tagai_data_supply/`（权限 0700）：
- `cookie.json`（0600）
- `node_state.json`（0600）

## 管理 API（spec §12）

```bash
# 生成 invite
curl -X POST http://<relayer>:7701/admin/invites -H "Authorization: Bearer $ADMIN_TOKEN"
# 创建 topic
curl -X POST http://<relayer>:7701/admin/topics -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"name":"SPACEX","tick":"SPACEX"}'
# 创建 subtask（tick 必填）
curl -X POST http://<relayer>:7701/admin/subtasks -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"topic_id":"topic_xxx","type":"hashtag","mode":"continuous","params":{"q":"#spacex"},"tick":"SPACEX"}'
# 数据状态
curl http://<relayer>:7701/admin/stats -H "Authorization: Bearer $ADMIN_TOKEN"
```

## 运维要点
- **无状态**：relayer 调度状态全在 `tds_*`，重启自动 reconcile；调度器重启后从 DB 游标接续。
- **cookie 失效**：节点 `auth_failed` → `disabled` + 告警；用户本地更新 cookie 后 `tagai-node run` 重新 `hello`，或后台 `POST /admin/nodes/:id/reenable`。
- **任务回收**：节点离线/disabled 时其 active assignment 自动 reclaim，调度器重派（从 DB cursor 恢复）。
- **数据保留**：`tds_tweet_raw` 7d / `cookie_health_log` 30d / `node_metric` 90d，relayer 每日清理。
- **已知限制**：relayer 单实例（主备 RPO/RTO 待评估）；任务重派重试上限（spec §10.2 限次3）尚未硬性强制，靠调度器自然重派。

## 已知风险（spec §16）
- twikit 随 Twitter 改版可能失效 → P2 spike 验证 + 备选（直接 HTTP / 备选库）。
- cookie 本地明文（0600）→ keychain 增强为可选。
