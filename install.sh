#!/usr/bin/env bash
# Install the Codex 模式 agent preset into this machine's DSH preset root.
#
# The preset root is "$DSH_HOME/.agent-presets" and falls back to
# "$HOME/.dsh/.agent-presets", matching how DSH itself resolves its home.
# Nothing is overwritten without --force, and --force keeps a timestamped
# backup instead of deleting the previous install.

set -euo pipefail

PRESET_ID="codex-mode"
FORCE=0

usage() {
  cat <<'EOF'
用法: ./install.sh [--force] [--dest <预设根目录>]

  --force          覆盖已存在的同名预设（旧目录会先备份）
  --dest <目录>    指定预设根目录，默认 $DSH_HOME/.agent-presets 或 ~/.dsh/.agent-presets
  -h, --help       显示这段说明
EOF
}

DEST_ROOT=""
while [ $# -gt 0 ]; do
  case "$1" in
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

# Resolve the source next to this script so the installer works from any cwd.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/presets/$PRESET_ID"

if [ ! -f "$SRC/agent.cordis.yml" ]; then
  echo "install: 找不到预设源文件 $SRC/agent.cordis.yml" >&2
  echo "install: 请在克隆出来的仓库目录里运行这个脚本" >&2
  exit 1
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
  BACKUP="$DEST.bak.$(date +%Y%m%d%H%M%S)"
  mv -- "$DEST" "$BACKUP"
  echo "install: 旧版本已备份到 $BACKUP"
fi

mkdir -p -- "$DEST"
cp -- "$SRC/agent.cordis.yml" "$DEST/agent.cordis.yml"
if [ -f "$SRC/preset.yml" ]; then
  cp -- "$SRC/preset.yml" "$DEST/preset.yml"
fi
chmod 644 "$DEST"/*.yml

echo "install: 已安装到 $DEST"
echo "install: 在 DSH 里新建会话，模式选择器里选「Codex 模式」即可（不需要重启）。"
