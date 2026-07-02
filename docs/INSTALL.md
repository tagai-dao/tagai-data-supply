# tagai-data-supply 部署与运维

## Relayer 部署（PM2，spec §2）

### 前置
- Node.js >= 18
- MySQL（复用 tiptag 库 `tiptag`）
- 独立 DB 用户 `tds_writer`（权限：`bsc_tds_*` 全权 + `bsc_tweet` SELECT(tweet_id) + `all_tweets` INSERT）

```sql
CREATE USER 'tds_writer'@'%' IDENTIFIED BY '<pwd>';
GRANT ALL PRIVILEGES ON tiptag.bsc_tds_* TO 'tds_writer'@'%';
GRANT SELECT (tweet_id) ON tiptag.bsc_tweet TO 'tds_writer'@'%';
GRANT INSERT ON tiptag.all_tweets TO 'tds_writer'@'%';
FLUSH PRIVILEGES;
```

### 建表
```bash
mysql -u tds_writer -p tiptag < packages/relayer/migrations/001_tds_tables.sql
# 增量迁移（按序号执行至最新）
mysql -u tds_writer -p tiptag < packages/relayer/migrations/011_pending_author_stats.sql
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
- `TAGAI_API_BASE`：tagai-api 地址（node 注册时验证收益账号 username）
- `TDS_ALERT_WEBHOOK`：告警 webhook（可选）

## tiptag-server：推文入社区 + 策展

```bash
cd tiptag-server
yarn start-tds-post-curation
```

轮询 `bsc_tds_pending_tweet`，发帖入社区并策展（不扣 OP/VP）。

## Node 部署（用户自部署）

### 一条命令安装（推荐）

在已克隆仓库内：

```bash
bash scripts/install-node.sh
```

或指定远程仓库：

```bash
TDS_REPO=https://github.com/tagai-dao/tagai-data-supply.git bash scripts/install-node.sh
```

安装完成后自动进入 `tagai-node setup` 向导（收益账号 + 抓取 cookie 分开填写）。

### 常用命令

| 命令 | 作用 |
|------|------|
| `tagai-node setup` | 交互式配置（分步校验） |
| `tagai-node run` | 常驻抓取 |
| `tagai-node status` | 人类可读状态 |
| `tagai-node status --json` | JSON 状态（供 agent 只读） |
| `tagai-node set-timezone --offset 8` | 修改本地时区偏移（静默 0:00–8:00） |

**Node 防封号策略（Node 自主执行，Relayer 不干预时区）：**

| 策略 | 值 |
|------|-----|
| 任务完成后冷却 | 随机 **3–30 分钟** 后才接受下一任务 |
| 本地静默时段 | **0:00–8:00**（按 `tz_offset`，setup 时设置，如东八区填 `8`） |
| 单次任务翻页 | 最多 **3 页**，页间 **3 秒**；本页最远推文早于 **24 小时** 则停止翻页 |
| 每日抓取上限 | **3000 条**（API 返回条数累计） |
| watermark | Relayer 按 subtask 存最新已入库 `tweet_id`；Node 每次从 Latest 第一页开始，遇到 `tweet_id <= watermark` 即停翻页 |

Node 拒绝任务时发 `task_decline`，Relayer **静默换人**（不扣 health）。

**养号模拟（默认开启，`tagai-node social --disable` 可关）：**

| 行为 | 规则 |
|------|------|
| 发帖 | 间隔 **30 小时**，内容从抓取池随机摘句，白天 **8:00–22:00** 随机发；失败跳过等下一轮 |
| 点赞 | 每天 **1–5** 次，白天随机时间；50% 任务池 / 50% Home 时间线 |

本地数据：`~/.tagai_data_supply/`（manifest.json、runtime/status.json、runtime/scheduler_state.json、runtime/social_state.json、runtime/interaction_pool.json、cookie.json）

### 方式 B：pip 安装（开发者）
```bash
git clone <repo> && cd tagai-data-supply/packages/node
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,scraper]"
```

### 方式 B：预编译二进制（全平台，spec §11/P7）
从 GitHub Releases 下载对应平台 `tagai-node` 二进制。

### 配置流程
```bash
# 1. 管理员在 relayer 后台生成 invite
# 2. 节点安装并 setup（收益账号用 TagAI @用户名，抓取用小号 cookie）
tagai-node setup
# 3. 运行
tagai-node run
tagai-node status --json   # 只读状态，可自行让 agent 监控
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
- **无状态**：relayer 调度状态全在 `bsc_tds_*`，重启自动 reconcile；抓取前沿由 `watermark_tweet_id` 接续。
- **cookie 失效**：节点 `auth_failed` → `disabled` + 告警；用户本地更新 cookie 后 `tagai-node run` 重新 `hello`，或后台 `POST /admin/nodes/:id/reenable`。
- **任务回收**：节点离线/disabled 时其 active assignment 自动 reclaim，调度器重派（各 Node 仍从 Latest 第一页 + 当前 watermark 开始）。
- **数据保留**：`bsc_tds_cookie_health_log` 30d / `bsc_tds_node_metric` 90d，relayer 每日清理。
- **已知限制**：relayer 单实例（主备 RPO/RTO 待评估）；任务重派重试上限（spec §10.2 限次3）尚未硬性强制，靠调度器自然重派。

## 已知风险（spec §16）
- twikit 随 Twitter 改版可能失效 → P2 spike 验证 + 备选（直接 HTTP / 备选库）。
- cookie 本地明文（0600）→ keychain 增强为可选。
