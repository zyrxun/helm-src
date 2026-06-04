#!/bin/bash
# Usage: bash scripts/upload-release.sh
# Uploads built release files to the helm-updates R2 bucket via S3 API.
# Run after: export $(cat .env | grep -v '#' | xargs) && npm run pack
#
# Requires R2 API credentials in .env:
#   R2_ACCESS_KEY_ID
#   R2_SECRET_ACCESS_KEY
#   R2_ACCOUNT_ID

set -e

BUCKET="helm-updates"
DIST="dist"
ACCOUNT_ID="${R2_ACCOUNT_ID}"
ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"

if [ -z "$R2_ACCESS_KEY_ID" ] || [ -z "$R2_SECRET_ACCESS_KEY" ] || [ -z "$R2_ACCOUNT_ID" ]; then
  echo "Error: R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ACCOUNT_ID must be set in .env"
  exit 1
fi

echo "Uploading Helm release to R2 bucket: $BUCKET"

for file in \
  "$DIST/Helm-"*"-universal.dmg" \
  "$DIST/Helm-"*"-universal.dmg.blockmap" \
  "$DIST/Helm-"*"-universal-mac.zip" \
  "$DIST/Helm-"*"-universal-mac.zip.blockmap" \
  "$DIST/latest-mac.yml"
do
  if ls $file 1>/dev/null 2>&1; then
    for f in $file; do
      echo "  Uploading: $(basename $f)"
      AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
      AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
      aws s3 cp "$f" "s3://$BUCKET/$(basename $f)" \
        --endpoint-url "$ENDPOINT" \
        --no-progress
    done
  fi
done

echo "Done. Update files live at https://pub-ec64f4f5098d43328a5073456b0d41ab.r2.dev/"
