# tagai-data-supply Node

抓取节点（用户自部署）。spec §11。

## 安装

```bash
cd packages/node
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev,scraper]"
```

## 使用

```bash
tagai-node configure   # 配置 relayer 地址 + invite secret（首次注册）
tagai-node login       # 交互式输入 cookie（ct0 / auth_token）
tagai-node run         # 常驻运行：注册 → WS → 领任务 → 抓取 → 回传
```

## 本地文件

- `~/.tagai_data_supply/` — 配置目录（权限 0700）
  - `cookie.json` — 推特 cookie（敏感，权限 0600）
  - `node_state.json` — 注册后的 node_id + node_token

cookie 仅存节点本地，relayer 不接触原始 cookie（spec §11）。

## 开发

```bash
pytest -q
```
