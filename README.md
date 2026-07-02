# tagai-data-supply

分布式推特（Twitter/X）数据抓取工具。

它把"抓取"这件事拆成两层：一个中心 **Relayer** 负责调度与入库，若干用户自部署的 **Node** 负责实际抓取。Node 用你自己的推特登录态（cookie）抓取，多节点并行、单节点串行，自动错峰、限频、去重，把抓到的推文回传统一写入数据库。

## 为什么这样做

- **抗封号**：抓取请求分散在大量真实用户的账号与 IP 上，由 Relayer 统一控制节奏（时间间隔、时区错峰、频率上限），单个节点不会短时间内密集请求。
- **可扩展**：想加大抓取量，多跑几个 Node 即可，吞吐随节点数线性增长。
- **去重入库**：Relayer 侧基于推文 ID 统一去重，写入结构化表，不重复、不遗漏。
- **任务可拆解**：一个主题（如 SPACEX）可拆成 hashtag、官推时间线、特定账号发文等多个子任务，分别调度。

## 工作方式

1. **Relayer**（你需要自己部署一台）接收抓取任务配置，拆成子任务，按策略分发给在线的 Node。
2. **Node**（每个抓取者在自己电脑/VPS 上运行）用自己的推特 cookie 登录，领取任务、抓取推文、回传给 Relayer。
3. Relayer 收到回传后去重、入库，并准备下一轮任务。

Node 与 Relayer 之间用 WebSocket 长连接通信（Node 主动连出，对 NAT 友好）。cookie 只存在 Node 本地，Relayer 不接触你的登录凭据。

## 功能

- **任务拆解**：一个主题 → 多个子任务（hashtag 搜索 / 用户时间线 / 关键词搜索）。
- **混合调度**：热点子任务持续滚动抓取，长尾子任务按周期批量抓取。
- **自适应分发**：节点少时串行派发保证安全；节点多时并行派发提升吞吐。单节点同一时刻只跑一个任务。
- **抗风控**：任务间随机间隔、时区错峰、cookie 健康分驱动冷却与暂停。
- **去重入库**：基于推文 ID 终判去重，写入结构化表，附带原始数据留痕。
- **节点管理**：一次性邀请码注册、节点状态/健康监控、失效回收与重派。
- **管理后台 API**：通过 HTTP 接口管理任务、节点、邀请码，查看数据状态。
- **Cookie 健康监测**：自动识别限流 / 失效，触发冷却或告警，等待更新后恢复。

## 安装

### Relayer（中心服务，部署者）

需要 Node.js ≥ 18 和一个 MySQL 数据库（默认复用 tiptag 库）。

```bash
cd tagai-data-supply
yarn install
yarn build:shared
yarn build:relayer

# 配置环境变量
cd packages/relayer
cp .env.example .env   # 填写数据库、ADMIN_TOKEN 等

# 初始化数据库表
mysql -u <user> -p <database> < migrations/001_tds_tables.sql

# 启动（开发）
yarn dev
# 或生产用 PM2
pm2 start ecosystem.config.cjs
```

### Node（抓取节点，抓取者）

需要 Python ≥ 3.10。

**一条命令安装（推荐）：**

```bash
# 在已克隆仓库内
bash scripts/install-node.sh

# 或指定远程仓库
TDS_REPO=https://github.com/tagai-dao/tagai-data-supply.git bash scripts/install-node.sh
```

安装后自动进入 `tagai-node setup` 向导（收益账号 @用户名 + 抓取用小号 cookie，分开配置）。

**开发者手动安装：**

```bash
cd packages/node
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[scraper]"
tagai-node setup
```

## 使用

### 1. 在 Relayer 创建邀请码

部署 Relayer 后，生成一个一次性邀请码发给抓取者：

```bash
curl -X POST http://<relayer-host>:<port>/admin/invites \
  -H "Authorization: Bearer <ADMIN_TOKEN>"
```

### 2. 配置抓取任务

```bash
# 创建主题
curl -X POST http://<relayer>/admin/topics \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"name":"SPACEX","tick":"SPACEX"}'

# 创建子任务（tick 指定推文归属的社区，必填）
curl -X POST http://<relayer>/admin/subtasks \
  -H "Authorization: Bearer <ADMIN_TOKEN>" -H "Content-Type: application/json" \
  -d '{"topic_id":"<topic_id>","type":"hashtag","mode":"continuous","params":{"q":"#spacex"},"tick":"SPACEX"}'
```

子任务类型：`hashtag`（标签搜索）、`user_timeline`（用户时间线）、`keyword`（关键词搜索）、`list`。

### 3. 在 Node 上注册并运行

抓取者拿到邀请码后，在自己的机器上：

```bash
tagai-node setup       # 交互式：relayer 地址、邀请码、收益 @用户名、抓取 cookie
tagai-node run         # 常驻运行：连接 Relayer，领任务，抓取，回传
tagai-node status      # 查看状态
tagai-node status --json   # JSON 状态（供 agent 只读）
```

本地文件存放在 `~/.tagai_data_supply/`（权限 0700）：
- `manifest.json` — 节点注册凭据与 relayer 地址
- `runtime/status.json` — 运行状态快照
- `cookie.json` — 推特 cookie（权限 0600，仅本机可读）

### 4. 查看状态

```bash
curl http://<relayer>/admin/stats -H "Authorization: Bearer <ADMIN_TOKEN>"
```

返回在线节点数、已抓取推文数、去重数、各任务状态等。

## 如何获取推特 cookie

1. 浏览器登录 twitter.com（或 x.com）。
2. 打开开发者工具 → Application/存储 → Cookies。
3. 复制 `ct0` 和 `auth_token` 两个值，在 `tagai-node login` 时填入。

cookie 只存在你本机，不会被上传。

## 项目结构

```
tagai-data-supply/
  packages/
    shared/    # relayer 与 node 共享的消息协议定义
    relayer/   # 中心服务（Node.js + TypeScript）
    node/      # 抓取节点（Python）
```

## 许可证

MIT
