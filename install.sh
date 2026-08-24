#!/usr/bin/env bash
# Install one DSH Codex preset into this machine's user preset root.
#
# The default remains codex-mode. Select the hybrid or Harness-compatible mode
# explicitly. Nothing is overwritten without --force, and --force keeps a
# timestamped recoverable backup instead of deleting the prior install.

set -euo pipefail

PRESET_ID="codex-mode"
FORCE=0
HARNESS_PACKAGE="@shuind/dsh-codex-harness@0.1.13"
HARNESS_PLUGIN_ADDED=0

usage() {
  cat <<'EOF'
用法: ./install.sh [--preset <codex-mode|codex-ptc-mode|codex-harness-mode>] [--force] [--dest <预设根目录>]

  --preset <id>    要安装的预设；默认 codex-mode
                   官方工具契约 + DSH 模型用 codex-harness-mode
  --force          覆盖已存在的同名预设（旧目录会先备份）
  --dest <目录>    指定预设根目录，默认 $DSH_HOME/.agent-presets 或 ~/.dsh/.agent-presets
  -h, --help       显示这段说明
EOF
}

DEST_ROOT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --preset)
      if [ $# -lt 2 ]; then
        echo "install: --preset 需要一个预设 id" >&2
        exit 2
      fi
      PRESET_ID="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --dest)
      if [ $# -lt 2 ]; then
        echo "install: --dest 需要一个目录参数" >&2
        exit 2
      fi
      DEST_ROOT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "install: 未知参数 $1" >&2
      usage >&2
      exit 2 ;;
  esac
done

case "$PRESET_ID" in
  codex-mode|codex-ptc-mode|codex-harness-mode) ;;
  *)
    echo "install: 不支持的预设 id $PRESET_ID；可选 codex-mode、codex-ptc-mode 或 codex-harness-mode" >&2
    exit 2 ;;
esac

# Resolve the source next to this script so the installer works from any cwd.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/presets/$PRESET_ID"

if [ ! -f "$SRC/agent.cordis.yml" ]; then
  echo "install: 找不到预设源文件 $SRC/agent.cordis.yml" >&2
  echo "install: 请在克隆出来的仓库目录里运行这个脚本" >&2
  exit 1
fi

resolve_dsh_root() {
  local configured
  configured="$(printf '%s' "${DSH_HOME:-}" | tr -d '[:space:]')"
  if [ -n "$configured" ]; then
    printf '%s\n' "$DSH_HOME"
  else
    printf '%s\n' "$HOME/.dsh"
  fi
}

harness_dependency_installed() {
  local profile_root="$1"
  node -e 'require.resolve("@shuind/dsh-codex-harness/package.json", { paths: [process.argv[1]] })' \
    "$profile_root" >/dev/null 2>&1
}

ensure_harness_dependency() {
  local profile_root
  profile_root="$(resolve_dsh_root)/profiles/web"
  if harness_dependency_installed "$profile_root"; then
    return
  fi
  if ! command -v dsh >/dev/null 2>&1; then
    echo "install: codex-harness-mode 需要 ${HARNESS_PACKAGE}。" >&2
    echo "install: 请先运行：dsh plugin --profile web add ${HARNESS_PACKAGE}" >&2
    exit 1
  fi
  echo "install: 正在安装 DSH Codex Harness 兼容层 $HARNESS_PACKAGE"
  dsh plugin --profile web add "$HARNESS_PACKAGE"
  if ! harness_dependency_installed "$profile_root"; then
    echo "install: DSH 报告安装完成，但 Web profile 仍无法解析 @shuind/dsh-codex-harness" >&2
    exit 1
  fi
  HARNESS_PLUGIN_ADDED=1
}

if [ "$PRESET_ID" = "codex-harness-mode" ]; then
  ensure_harness_dependency
fi

if [ -z "$DEST_ROOT" ]; then
  # An empty or whitespace-only DSH_HOME is treated as unset, the same way DSH does.
  dsh_home="$(printf '%s' "${DSH_HOME:-}" | tr -d '[:space:]')"
  if [ -n "$dsh_home" ]; then
    DEST_ROOT="${DSH_HOME}/.agent-presets"
  else
    DEST_ROOT="${HOME}/.dsh/.agent-presets"
  fi
fi

if ! mkdir -p -- "$DEST_ROOT" 2>/dev/null || [ ! -d "$DEST_ROOT" ]; then
  echo "install: 无法创建预设根目录 $DEST_ROOT" >&2
  exit 1
fi

# Normalize to an absolute path: every later file argument then starts with
# "/", so no path can be mistaken for an option by cp/mv/chmod. BSD chmod does
# not accept "--" as an option terminator, so this is the portable guard.
DEST_ROOT="$(cd -- "$DEST_ROOT" && pwd)"
DEST="$DEST_ROOT/$PRESET_ID"

if [ -e "$DEST" ]; then
  if [ "$FORCE" -ne 1 ]; then
    echo "install: $DEST 已存在。要更新请加 --force（旧目录会备份）。" >&2
    exit 1
  fi
  BACKUP_BASE="$DEST.bak.$(date +%Y%m%d%H%M%S)"
  BACKUP="$BACKUP_BASE"
  BACKUP_SUFFIX=0
  while [ -e "$BACKUP" ]; do
    BACKUP_SUFFIX=$((BACKUP_SUFFIX + 1))
    BACKUP="$BACKUP_BASE.$BACKUP_SUFFIX"
  done
  mv -- "$DEST" "$BACKUP"
  echo "install: 旧版本已备份到 $BACKUP"
fi

mkdir -p -- "$DEST"
cp -R -- "$SRC/." "$DEST/"
find "$DEST" -type f -exec chmod 644 {} +

case "$PRESET_ID" in
  codex-ptc-mode) DISPLAY_NAME="Codex PTC 模式" ;;
  codex-harness-mode) DISPLAY_NAME="Codex Harness 模式" ;;
  *) DISPLAY_NAME="Codex 模式" ;;
esac

echo "install: 已安装到 $DEST"
if [ "$HARNESS_PLUGIN_ADDED" -eq 1 ]; then
  echo "install: 兼容层是本次新装的，请重启一次 DSH Web，再新建空白会话并选择「${DISPLAY_NAME}」。"
else
  echo "install: 在 DSH 里新建空白会话，模式选择器里选「${DISPLAY_NAME}」即可（不需要重启）。"
fi
