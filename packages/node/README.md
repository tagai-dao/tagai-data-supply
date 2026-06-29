# tagai-node

tagai-data-supply 的抓取节点。

它运行在你的电脑或 VPS 上，用自己的推特登录态（cookie）连接到中心 Relayer，领取抓取任务、抓取推文、回传统一入库。cookie 只存在你本机，不会被上传。

## 安装

需要 Python ≥ 3.10。

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[scraper]"
```

或者从项目 Release 页面下载对应平台（Windows / macOS / Linux）的预编译二进制，无需 Python 环境。

## 使用

需要先从 Relayer 管理员处获取一个一次性邀请码。

```bash
# 1. 配置 Relayer 地址并用邀请码注册
tagai-node configure --http-base http://<relayer-host>:<port> --invite-secret <邀请码>

# 2. 填入推特 cookie（ct0 / auth_token）
tagai-node login

# 3. 常驻运行
tagai-node run
```

运行后节点会自动连接 Relayer、领取任务、抓取并回传。保持终端运行即可；断开会自动重连。

## 如何获取推特 cookie

1. 浏览器登录 twitter.com（或 x.com）。
2. 打开开发者工具 → Application/存储 → Cookies。
3. 复制 `ct0` 和 `auth_token` 两个值，在 `tagai-node login` 时填入。

## 本地文件

`~/.tagai_data_supply/`（权限 0700）：
- `cookie.json` — 推特 cookie（权限 0600）
- `node_state.json` — 注册凭据

可设置环境变量 `TDS_NODE_HOME` 改变配置目录位置。

## 子命令

| 命令 | 作用 |
|---|---|
| `configure` | 配置 Relayer 地址并用邀请码注册 |
| `login` | 交互式输入推特 cookie |
| `run` | 常驻运行：连接、领任务、抓取、回传 |

## 许可证

MIT
