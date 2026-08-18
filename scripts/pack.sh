#!/usr/bin/env bash
# Build a distributable archive of this preset under dist/.
#
# The archive contains exactly what a recipient needs: the preset directory,
# both installers, the README, and the license. Everything unpacks under one
# top-level folder so extracting it never scatters files into the cwd.

set -euo pipefail

NAME="dsh-codex-mode"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
DIST="$ROOT/dist"
STAGE="$DIST/$NAME"

rm -rf -- "$STAGE"
mkdir -p -- "$STAGE"

cp -R -- "$ROOT/presets" "$STAGE/presets"
cp -- "$ROOT/install.sh" "$ROOT/install.ps1" "$ROOT/README.md" "$ROOT/LICENSE" "$STAGE/"
chmod 755 "$STAGE/install.sh"
chmod 644 "$STAGE/install.ps1" "$STAGE/README.md" "$STAGE/LICENSE" "$STAGE"/presets/*/*.yml

# Drop macOS metadata so the archive is clean on other platforms.
find "$STAGE" -name '.DS_Store' -delete
rm -f -- "$DIST/$NAME.zip" "$DIST/$NAME.tar.gz"

# COPYFILE_DISABLE keeps BSD tar from emitting ._ AppleDouble entries.
( cd -- "$DIST" && COPYFILE_DISABLE=1 tar -czf "$NAME.tar.gz" "$NAME" )
( cd -- "$DIST" && zip -q -r -X "$NAME.zip" "$NAME" )

rm -rf -- "$STAGE"

echo "pack: $DIST/$NAME.zip"
echo "pack: $DIST/$NAME.tar.gz"
