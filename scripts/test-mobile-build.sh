#!/bin/bash
# CI jaisi exact mobile build test — GitHub Actions wale steps replicate
set -uo pipefail
cd /home/z/my-project

# CI step 4: api routes hatao
mv src/app/api .api-routes-backup

MOBILE_BUILD=1 \
NEXT_PUBLIC_FIREBASE_PROJECT_ID=test-project \
NEXT_PUBLIC_API_BASE=https://example.com \
npx next build 2>&1 | tail -50
STATUS=${PIPESTATUS[0]}

# api routes wapas lao (chahe build fail ho)
rm -rf src/app/api
mv .api-routes-backup src/app/api
echo "=== api routes restore ho gayi ==="
echo "BUILD_EXIT_CODE=$STATUS"
exit $STATUS
