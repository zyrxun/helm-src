#!/usr/bin/env bash
# Builds public/brand/icon.icns from public/brand/icon.svg.
# Renders the artwork at 820px (80% of canvas) centered on a 1024px transparent
# base — matches Apple's recommended icon padding so it doesn't look oversized.
# Requires: rsvg-convert (brew install librsvg), ffmpeg, sips, iconutil (built-in).
set -euo pipefail

cd "$(dirname "$0")/.."

SRC="public/brand/icon.svg"
TMP=$(mktemp -d)
ICONSET="$TMP/icon.iconset"
mkdir -p "$ICONSET"

# 1. Render SVG at 820×820 (padded content size), then pad to 1024×1024
rsvg-convert -w 820 -h 820 "$SRC" > "$TMP/artwork.png"
ffmpeg -y -loglevel error \
  -i "$TMP/artwork.png" \
  -vf "pad=1024:1024:(ow-iw)/2:(oh-ih)/2:color=0x00000000" \
  "$TMP/master.png"

# 2. Resize master to all required iconset sizes using sips
for s in 16 32 64 128 256 512; do
  sips -z $s $s "$TMP/master.png" --out "$ICONSET/icon_${s}x${s}.png"    > /dev/null
  sips -z $((s*2)) $((s*2)) "$TMP/master.png" --out "$ICONSET/icon_${s}x${s}@2x.png" > /dev/null
done
# Apple spec: 1024 master is named icon_512x512@2x.png
cp "$TMP/master.png" "$ICONSET/icon_512x512@2x.png"

# 3. Build .icns
iconutil -c icns "$ICONSET" -o public/brand/icon.icns

rm -rf "$TMP"
echo "icon.icns written to public/brand/icon.icns"
