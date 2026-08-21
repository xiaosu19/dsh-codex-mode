#!/usr/bin/env bash
# Build distributable archives containing both Codex presets under dist/.
#
# The archive contains exactly what a recipient needs: both self-contained
# preset directories, both installers, the README, and the license. Everything
# unpacks under one top-level folder so extraction never scatters files.

set -euo pipefail

NAME="dsh-codex-mode"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DIST="$ROOT/dist"
STAGE="$DIST/$NAME"

for preset in codex-mode codex-ptc-mode; do
  if [ ! -f "$ROOT/presets/$preset/agent.cordis.yml" ] ||
     [ ! -f "$ROOT/presets/$preset/preset.yml" ] ||
     [ ! -d "$ROOT/presets/$preset/controller" ]; then
    echo "pack: preset $preset 不完整" >&2
    exit 1
  fi
done

rm -rf -- "$STAGE"
mkdir -p -- "$STAGE"

cp -R -- "$ROOT/presets" "$STAGE/presets"
cp -- "$ROOT/install.sh" "$ROOT/install.ps1" "$ROOT/README.md" "$ROOT/LICENSE" "$STAGE/"
chmod 755 "$STAGE/install.sh"
chmod 644 "$STAGE/install.ps1" "$STAGE/README.md" "$STAGE/LICENSE"
find "$STAGE/presets" -type f -exec chmod 644 {} +

# Drop macOS metadata so the archive is clean on other platforms.
find "$STAGE" -name '.DS_Store' -delete
rm -f -- "$DIST/$NAME.zip" "$DIST/$NAME.tar.gz"

# COPYFILE_DISABLE keeps BSD tar from emitting ._ AppleDouble entries.
( cd -- "$DIST" && COPYFILE_DISABLE=1 tar -czf "$NAME.tar.gz" "$NAME" )
( cd -- "$DIST" && zip -q -r -X "$NAME.zip" "$NAME" )

rm -rf -- "$STAGE"

echo "pack: $DIST/$NAME.zip"
echo "pack: $DIST/$NAME.tar.gz"
