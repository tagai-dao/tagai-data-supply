# tagai-data-supply

分布式推特数据抓取工具：Relayer（TS，中心协调 + 调度 + 入库）协调若干用户自部署的 Node（Python，cookie 逆向爬取），通过 WebSocket 长连接分发任务、回传去重入库到 tiptag MySQL `bsc_tweet`。

设计稿：`../docs/superpowers/specs/2026-06-26-tagai-data-supply-design.md`
实现计划：`../docs/superpowers/plans/2026-06-26-tagai-data-supply.md`

## 子项目

| 包 | 说明 | 语言 |
|---|---|---|
| `packages/shared` | WS/REST 协议 JSON Schema 单一源 + 生成的 TS 类型 | TS |
| `packages/relayer` | 中心协调服务（REST + WS + 调度 + 入库 + 内置管理后台） | TS |
| `packages/node` | 抓取节点（用户自部署，twikit + websockets） | Python |

## 开发命令

### Relayer + Shared (TS)
```bash
cd tagai-data-supply
yarn install
yarn build:shared
yarn build:relayer
yarn workspace @tds/relayer run dev        # 开发模式
yarn workspace @tds/relayer run verify-schema  # 核对线上 bsc_tweet schema
```

### Node (Python)
```bash
cd packages/node
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
tagai-node --help
pytest -q
```

## 部署
Relayer 用 PM2（`packages/relayer/ecosystem.config.cjs`），沿用 tiptag 约定。
