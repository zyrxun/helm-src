#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$DIR/bin"
swiftc -O -o "$DIR/bin/chrome-profile-probe" "$DIR/main.swift"
echo "Built: $DIR/bin/chrome-profile-probe"
