#!/usr/bin/env bash
# Pre-upload guard: scan the built artifacts for anything that must never ship.
# Run after `npm run pack`, before `scripts/upload-release.sh`.
# Exit non-zero if anything suspicious is found.

set -euo pipefail

DIST="${1:-dist}"
ASAR="$(find "$DIST" -name app.asar -path '*/Helm.app/*' | head -1)"

if [ -z "$ASAR" ] || [ ! -f "$ASAR" ]; then
  echo "audit: no app.asar found under $DIST/*/Helm.app — pack first" >&2
  exit 1
fi

echo "audit: scanning $ASAR"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

node_modules/.bin/asar extract "$ASAR" "$WORK" >/dev/null

FAIL=0
report() { echo "audit: FAIL — $1" >&2; FAIL=1; }

# Files that must never ship inside the bundle.
for forbidden in .env .env.local .env.production credentials.json id_rsa; do
  if find "$WORK" -type f -name "$forbidden" 2>/dev/null | grep -q .; then
    report "shipped file: $forbidden"
  fi
done

# Filename patterns for keys / certs.
if find "$WORK" -type f \( -name '*.pem' -o -name '*.p12' -o -name '*.pfx' -o -name '*.key' \) 2>/dev/null | grep -q .; then
  report "shipped key/cert file (*.pem|*.p12|*.pfx|*.key)"
fi

# Content patterns inside any JS / JSON file.
# Each pattern: a description and a regex. Matches across the whole tree.
scan() {
  local desc="$1" rgx="$2"
  local hits
  # Skip node_modules — bundled deps may legitimately contain strings that
  # happen to match our patterns (e.g. Sentry samples "re_…", cjs-module-lexer
  # has "EAA" tokens in source). False positives here would block every release.
  hits=$(grep -RlE --include='*.js' --include='*.json' --include='*.cjs' --include='*.mjs' \
    --exclude-dir=node_modules "$rgx" "$WORK" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    report "$desc"
    echo "$hits" | head -5 >&2
  fi
}

scan "Apple app-specific password literal"             'APPLE_APP_SPECIFIC_PASSWORD\s*[:=]\s*["'"'"'][a-z0-9-]{16,}'
scan "Resend API key (re_…)"                            're_[a-zA-Z0-9_]{20,}'
scan "Stripe secret key (sk_live_ or sk_test_)"         'sk_(live|test)_[a-zA-Z0-9]{20,}'
scan "Meta/Facebook page access token (EAA…)"           'EAA[A-Za-z0-9]{50,}'
scan "AWS access key id (AKIA…)"                        'AKIA[0-9A-Z]{16}'
scan "Cloudflare R2 access key"                         'R2_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)\s*[:=]\s*["'"'"'][a-z0-9]{20,}'
scan "Private key block"                                'BEGIN (RSA|EC|DSA|OPENSSH|PRIVATE) (PRIVATE )?KEY'

if [ "$FAIL" -ne 0 ]; then
  echo "" >&2
  echo "audit: refusing to proceed — fix the above and rebuild." >&2
  exit 2
fi

echo "audit: clean."
