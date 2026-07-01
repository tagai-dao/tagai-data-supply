#!/usr/bin/env bash
# tagai-data-supply 节点一键安装：下载/安装 tagai-node 并进入 setup 向导
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/<org>/<repo>/main/scripts/install-node.sh | bash
#   curl -fsSL .../install-node.sh | bash -s -- --repo https://github.com/org/tagai-data-supply.git
set -euo pipefail

TDS_REPO="${TDS_REPO:-}"
TDS_BRANCH="${TDS_BRANCH:-main}"
PY="${PYTHON:-python3}"

echo "==> TagAI 数据节点安装"

if ! command -v "$PY" >/dev/null 2>&1; then
  echo "错误: 需要 Python 3.10+（$PY 未找到）" >&2
  exit 1
fi

INSTALL_SRC=""
cleanup() { [ -n "${TMPDIR:-}" ] && [ -d "$TMPDIR" ] && rm -rf "$TMPDIR"; }
trap cleanup EXIT

# 从 git 克隆或本地仓库安装
if [ -f "$(dirname "$0")/../packages/node/pyproject.toml" ]; then
  INSTALL_SRC="$(cd "$(dirname "$0")/.." && pwd)/packages/node"
  echo "==> 使用本地仓库: $INSTALL_SRC"
elif [ -n "$TDS_REPO" ]; then
  TMPDIR="$(mktemp -d)"
  echo "==> 克隆 $TDS_REPO ($TDS_BRANCH) ..."
  git clone --depth 1 --branch "$TDS_BRANCH" "$TDS_REPO" "$TMPDIR/repo"
  INSTALL_SRC="$TMPDIR/repo/packages/node"
else
  echo "错误: 请设置 TDS_REPO 或在已克隆的 tagai-data-supply 仓库内运行此脚本" >&2
  echo "示例: TDS_REPO=https://github.com/your-org/tagai-data-supply.git bash install-node.sh" >&2
  exit 1
fi

echo "==> 安装 Python 包（含 scraper）..."
"$PY" -m pip install -q -U pip
"$PY" -m pip install -q -e "$INSTALL_SRC[scraper]"

if ! command -v tagai-node >/dev/null 2>&1; then
  USER_BIN="${HOME}/.local/bin"
  mkdir -p "$USER_BIN"
  if [ -x "$("$PY" -c 'import sys; print(sys.prefix)')/bin/tagai-node" ]; then
    ln -sf "$("$PY" -c 'import sys; print(sys.prefix)')/bin/tagai-node" "$USER_BIN/tagai-node" 2>/dev/null || true
  fi
  if ! command -v tagai-node >/dev/null 2>&1; then
    echo "提示: 将以下目录加入 PATH: $USER_BIN"
  fi
fi

echo "==> 安装完成，进入配置向导..."
exec tagai-node setup "$@"
