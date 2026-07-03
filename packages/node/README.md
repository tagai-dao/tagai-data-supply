# tagai-node

tagai-data-supply 的抓取节点。

它运行在你的电脑或 VPS 上，用自己的推特登录态（cookie）连接到中心 Relayer，领取抓取任务、抓取推文、回传统一入库。cookie 只存在你本机，不会被上传。

## 安装

**一条命令（推荐，无需 Python）：**

```bash
curl -fsSL https://raw.githubusercontent.com/tagai-dao/tagai-data-supply/main/scripts/install-node.sh | bash
```

脚本会自动：检测平台 → 从 Relayer 获取最新版 → 下载二进制到 `~/.local/bin` → **写入 `~/.zshrc` PATH** → 进入 `tagai-node setup` 向导。

安装后请执行 `source ~/.zshrc`（或新开终端），再使用 `tagai-node`。

已配置过的用户，一条命令后台运行：

```bash
curl -fsSL https://raw.githubusercontent.com/tagai-dao/tagai-data-supply/main/scripts/install-node.sh | bash -s -- run -d
```

### 方式 A：手动下载二进制

从 [GitHub Releases](https://github.com/tagai-dao/tagai-data-supply/releases) 下载对应平台文件，放入 PATH：

```bash
# 示例：macOS Apple Silicon（当前最新 0.1.1）
mkdir -p ~/bin
curl -fsSL -o ~/bin/tagai-node \
  "https://github.com/tagai-dao/tagai-data-supply/releases/download/node-v0.1.1/tagai-node-darwin-arm64"
chmod +x ~/bin/tagai-node
export PATH="$HOME/bin:$PATH"
tagai-node setup
```

Linux x64 用 `tagai-node-linux-amd64`，Windows 用 `tagai-node-windows-amd64.exe`。

更新：`tagai-node update`（会先 stop 再下载替换二进制）。

### 方式 B：源码 / pip（开发者）

抓取依赖 **twikit-ng**（`import twikit` 兼容，修复 2026 年 X 改版）；勿与旧版 `twikit` 混装。

```bash
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[scraper]"      # 安装 twikit-ng
```

更新：`tagai-node update`（pip 升级）或重新 `pip install -e .`。

验证爬虫与 cookie：

```bash
tagai-node test-scraper
```

或者从项目 Release 页面下载对应平台（Windows / macOS / Linux）的预编译二进制，无需 Python 环境。

## 使用

需要先从 Relayer 管理员处获取一个一次性邀请码。`setup` 向导会引导完成全部配置（收益账号 + 抓取 cookie），**无需再单独 configure/login**。

```bash
# 首次：安装脚本已自动进入 setup；或手动
tagai-node setup

# 常驻运行（前台）
tagai-node run

# 后台运行（关闭终端也不影响）
tagai-node run -d

# 查看实时日志
tagai-node logs -f

# 停止后台节点
tagai-node stop
```

前台运行时日志会写入 `~/.tagai_data_supply/logs/node.log`，终端与 `tagai-node logs -f` 会按类型着色（任务/连接/状态等）。文件内仍为纯文本。

每 5 分钟（可用 `--status-interval` 调整）会自动播报一次节点状态：连接、今日配额、养号池、当前任务等。任务接收、分页抓取、完成上报也会写入日志。

## 如何获取推特 cookie

1. 浏览器登录 twitter.com（或 x.com）。
2. 打开开发者工具 → Application/存储 → Cookies。
3. 复制 `ct0` 和 `auth_token` 两个值，在 `tagai-node login` 时填入。

## 本地文件

`~/.tagai_data_supply/`（权限 0700）：
- `cookie.json` — 推特 cookie（权限 0600）
- `node_state.json` — 注册凭据
- `logs/node.log` — 运行日志（滚动，约 10MB × 3）
- `runtime/status.json` — 当前状态快照（供 `tagai-node status`）
- `runtime/node.pid` — 后台进程 PID（`run -d` 时写入）

可设置环境变量 `TDS_NODE_HOME` 改变配置目录位置。

## 子命令

| 命令 | 作用 |
|---|---|
| `configure` | 配置 Relayer 地址并用邀请码注册 |
| `login` | 交互式输入推特 cookie |
| `run` | 常驻运行：连接、领任务、抓取、回传 |
| `run -d` | 后台运行 |
| `logs` | 查看日志（`-f` 跟踪） |
| `stop` | 停止后台节点 |
| `status` | 查看当前状态 |
| `version` / `-v` | 查看当前版本与 Relayer 最新版 |
| `update` | 更新 CLI（二进制自替换或 pip 升级） |

## 许可证

MIT
