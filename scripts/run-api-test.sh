#!/bin/bash
# Helper: run a single MTProto api test file with the seed harness.
# Usage: bash scripts/run-api-test.sh <test-path> [seed-path]
#   <test-path>  e.g. src/tests/api/previewAuth
#   [seed-path]  master seed; default ./tmp/seed.json
set -u
cd "$(dirname "$0")/.."
TEST_PATH="${1:?test path required}"
SEED_PATH="${2:-./tmp/seed.json}"
export TG_API_TEST=1
export TG_API_PROD_DC=1
export TG_API_SEED="$SEED_PATH"
export TG_API_DEBUG=1
export TG_API_PRINT=1
pnpm test "$TEST_PATH"
