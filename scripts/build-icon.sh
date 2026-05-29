#!/usr/bin/env bash
set -e
SRC="public/brand/icon.svg"
ICONSET="icon.iconset"
rm -rf "$ICONSET" && mkdir -p "$ICONSET"

for s in 16 32 64 128 256 512; do
  rsvg-convert -w $s       -h $s       "$SRC" > "$ICONSET/icon_${s}x${s}.png"
  rsvg-convert -w $((s*2)) -h $((s*2)) "$SRC" > "$ICONSET/icon_${s}x${s}@2x.png"
done

# 1024 master — Apple spec name is icon_512x512@2x.png (no standalone 1024 or 2048 entry)
rsvg-convert -w 1024 -h 1024 "$SRC" > "$ICONSET/icon_512x512@2x.png"

iconutil -c icns "$ICONSET" -o public/brand/icon.icns
rm -rf "$ICONSET"
echo "icon.icns written to public/brand/icon.icns"
