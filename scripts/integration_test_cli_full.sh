#!/usr/bin/env bash
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh" || exit 1

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "--list-tool-cases" ]]; then
  exec node scripts/run-bundled.mjs scripts/list-full-integration-cases.ts \
    scripts/integration_test_full.sh cli packed-cli
fi

source scripts/packed-cli-test-helpers.sh

TEST_TMPDIR_PARENT="${TEST_TMPDIR:-${TMPDIR:-/tmp}}"
TEST_TMPDIR="$(mktemp -d "$TEST_TMPDIR_PARENT/huly-cli-full.XXXXXX")"
cleanup() {
  rm -rf "$TEST_TMPDIR"
}
trap cleanup EXIT

prepare_packed_cli "$TEST_TMPDIR"
ADAPTER="$TEST_TMPDIR/cli-full-integration-adapter.cjs"
IMAGE_OUTPUT="$TEST_TMPDIR/cli-full-integration-image"
pnpm exec esbuild scripts/cli-full-integration-adapter.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --external:ws \
  --log-level=warning \
  --outfile="$ADAPTER"

export HULY_CLI_INTEGRATION_EXECUTABLE="$HULY_PREPARED_CLI"
export HULY_CLI_MIRROR_ADAPTER="$ADAPTER"
export HULY_CLI_MIRROR_IMAGE_PATH="$IMAGE_OUTPUT"
export INTEGRATION_SURFACE=cli
export INTEGRATION_TRANSPORT=stdio
bash scripts/integration_test_full.sh
