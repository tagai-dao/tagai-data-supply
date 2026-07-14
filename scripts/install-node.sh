#!/usr/bin/env bash
# tagai-node 一键安装（GitHub Release 二进制，无需 Python）
#
# 安装并进入配置向导：
#   curl -fsSL https://raw.githubusercontent.com/tagai-dao/tagai-data-supply/main/scripts/install-node.sh | bash
#
# 安装后后台运行（需已 setup）：
#   curl -fsSL .../install-node.sh | bash -s -- run -d
#
# 开发者源码安装：
#   curl -fsSL .../install-node.sh | bash -s -- --dev
set -euo pipefail

TDS_GITHUB_REPO="${TDS_GITHUB_REPO:-tagai-dao/tagai-data-supply}"
TDS_RELEASE_PREFIX="${TDS_RELEASE_PREFIX:-node-v}"
TDS_RELAYER_HTTP="${TDS_RELAYER_HTTP:-https://tds-relayer.tagai.fun}"
TDS_BIN_DIR="${TDS_BIN_DIR:-${HOME}/.local/bin}"
TDS_NODE_VERSION="${TDS_NODE_VERSION:-}"
TDS_REPO="${TDS_REPO:-}"
TDS_BRANCH="${TDS_BRANCH:-main}"
PY="${PYTHON:-python3}"

INSTALL_MODE="binary"
SETUP_ARGS=()

usage() {
  cat <<'EOF'
用法: install-node.sh [选项] [-- setup 参数...]

选项:
  --dev          从源码 pip 安装（开发者，需 Python 3.10+）
  -h, --help     显示帮助

默认: 下载 GitHub Release 二进制到 ~/.local/bin，写入 shell PATH，并执行 tagai-node setup

示例:
  curl -fsSL .../install-node.sh | bash
  curl -fsSL .../install-node.sh | bash -s -- run -d
  curl -fsSL .../install-node.sh | bash -s -- --dev
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) INSTALL_MODE="source"; shift ;;
    -h|--help) usage; exit 0 ;;
    --) shift; SETUP_ARGS=("$@"); break ;;
    *) SETUP_ARGS=("$@"); break ;;
  esac
done

ensure_path() {
  mkdir -p "$TDS_BIN_DIR"
  case ":${PATH}:" in
    *":${TDS_BIN_DIR}:"*) ;;
    *)
      export PATH="${TDS_BIN_DIR}:${PATH}"
      echo "==> 已将 ${TDS_BIN_DIR} 加入当前会话 PATH"
      ;;
  esac

  local path_line="export PATH=\"${TDS_BIN_DIR}:\$PATH\""
  _append_path_to_rc() {
    local rc="$1"
    [[ -n "$rc" ]] || return
    if grep -qsF "${TDS_BIN_DIR}" "$rc" 2>/dev/null; then
      return
    fi
    touch "$rc"
    {
      echo ""
      echo "# tagai-node (tagai-data-supply)"
      echo "$path_line"
    } >> "$rc"
    echo "==> 已写入 ${rc}（新开终端即可全局使用 tagai-node）"
  }

  case "${SHELL:-}" in
    */zsh) _append_path_to_rc "${HOME}/.zshrc" ;;
    */bash)
      if [[ "$(uname -s)" == "Darwin" ]]; then
        _append_path_to_rc "${HOME}/.bash_profile"
      else
        _append_path_to_rc "${HOME}/.bashrc"
      fi
      ;;
    *)
      # curl | bash 时 SHELL 可能不准；macOS 默认 zsh，同时尝试常见配置
      _append_path_to_rc "${HOME}/.zshrc"
      if [[ "$(uname -s)" != "Darwin" ]]; then
        _append_path_to_rc "${HOME}/.bashrc"
      fi
      ;;
  esac
}

detect_asset() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"
  case "${os}-${arch}" in
    Linux-x86_64|Linux-amd64) echo "tagai-node-linux-amd64" ;;
    Linux-aarch64|Linux-arm64) echo "tagai-node-linux-arm64" ;;
    Darwin-arm64) echo "tagai-node-darwin-arm64" ;;
    Darwin-x86_64) echo "tagai-node-darwin-amd64" ;;
    MINGW*-x86_64|MSYS*-x86_64|CYGWIN*-x86_64) echo "tagai-node-windows-amd64.exe" ;;
    *)
      echo "错误: 不支持的平台 ${os}/${arch}" >&2
      exit 1
      ;;
  esac
}

fetch_latest_version() {
  if [[ -n "$TDS_NODE_VERSION" ]]; then
    echo "$TDS_NODE_VERSION"
    return
  fi
  local ver
  ver="$(curl -fsSL "${TDS_RELAYER_HTTP%/}/node/version" 2>/dev/null \
    | sed -n 's/.*"latest"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    | head -1 || true)"
  if [[ -z "$ver" ]]; then
    echo "警告: 无法从 Relayer 获取最新版本，使用 0.1.6" >&2
    ver="0.1.6"
  fi
  echo "$ver"
}

install_binary() {
  local asset version tag dest url
  asset="$(detect_asset)"
  version="$(fetch_latest_version)"
  tag="${TDS_RELEASE_PREFIX}${version}"
  dest="${TDS_BIN_DIR}/tagai-node"
  url="https://github.com/${TDS_GITHUB_REPO}/releases/download/${tag}/${asset}"

  echo "==> TagAI 数据节点安装（二进制 ${version}, ${asset}）"
  echo "==> 下载 ${url}"
  curl -fsSL -o "${dest}.new" "$url"
  chmod +x "${dest}.new"
  if [[ "$(uname -s)" == "Darwin" ]]; then
    xattr -d com.apple.quarantine "${dest}.new" 2>/dev/null || true
  fi
  mv -f "${dest}.new" "${dest}"
  ensure_path
  echo "==> 已安装: ${dest}"
  "${dest}" -v || true
}

install_source() {
  echo "==> TagAI 数据节点安装（源码 / pip，开发者模式）"
  if ! command -v "$PY" >/dev/null 2>&1; then
    echo "错误: 需要 Python 3.10+（$PY 未找到）" >&2
    exit 1
  fi

  local install_src="" tmpdir=""
  cleanup() { [[ -n "$tmpdir" && -d "$tmpdir" ]] && rm -rf "$tmpdir"; }
  trap cleanup EXIT

  if [[ -f "$(dirname "$0")/../packages/node/pyproject.toml" ]]; then
    install_src="$(cd "$(dirname "$0")/.." && pwd)/packages/node"
    echo "==> 使用本地仓库: $install_src"
  elif [[ -n "$TDS_REPO" ]]; then
    tmpdir="$(mktemp -d)"
    echo "==> 克隆 $TDS_REPO ($TDS_BRANCH) ..."
    git clone --depth 1 --branch "$TDS_BRANCH" "$TDS_REPO" "$tmpdir/repo"
    install_src="$tmpdir/repo/packages/node"
  else
    TDS_REPO="https://github.com/${TDS_GITHUB_REPO}.git"
    tmpdir="$(mktemp -d)"
    echo "==> 克隆 $TDS_REPO ($TDS_BRANCH) ..."
    git clone --depth 1 --branch "$TDS_BRANCH" "$TDS_REPO" "$tmpdir/repo"
    install_src="$tmpdir/repo/packages/node"
  fi

  "$PY" -m pip install -q -U pip
  "$PY" -m pip install -q -e "${install_src}[scraper]"
  ensure_path
  if ! command -v tagai-node >/dev/null 2>&1; then
    ln -sf "$("$PY" -c 'import sys; print(sys.prefix)')/bin/tagai-node" "${TDS_BIN_DIR}/tagai-node" 2>/dev/null || true
  fi
}

run_tagai_node() {
  if [[ ${#SETUP_ARGS[@]} -eq 0 ]]; then
    echo "==> 进入配置向导（tagai-node setup）..."
    exec tagai-node setup
  fi
  exec tagai-node "${SETUP_ARGS[@]}"
}

if [[ "$INSTALL_MODE" == "source" ]]; then
  install_source
else
  install_binary
fi
run_tagai_node
