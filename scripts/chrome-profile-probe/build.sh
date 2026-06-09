#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DIR/bin"
swiftc -O -target arm64-apple-macos11 -o "$DIR/bin/chrome-profile-probe.arm64" "$DIR/main.swift"
swiftc -O -target x86_64-apple-macos11 -o "$DIR/bin/chrome-profile-probe.x86_64" "$DIR/main.swift"
lipo -create -output "$DIR/bin/chrome-profile-probe" \
  "$DIR/bin/chrome-profile-probe.arm64" \
  "$DIR/bin/chrome-profile-probe.x86_64"
rm "$DIR/bin/chrome-profile-probe.arm64" "$DIR/bin/chrome-profile-probe.x86_64"
echo "Built universal: $DIR/bin/chrome-profile-probe"
lipo -info "$DIR/bin/chrome-profile-probe"
