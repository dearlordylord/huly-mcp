#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f packages/huly-cli/dist/index.cjs ]]; then
  pnpm --filter @firfi/huly-cli build
fi

if [[ "${HULY_URL:-}" == *localhost* ]]; then
  export HULY_URL="${HULY_URL/localhost/host.docker.internal}"
fi

run_cli_json() {
  local label="$1"
  shift
  local stdout_file
  local stderr_file
  stdout_file="$(mktemp)"
  stderr_file="$(mktemp)"

  if ! timeout 20 node packages/huly-cli/dist/index.cjs "$@" --json >"$stdout_file" 2>"$stderr_file"; then
    echo "FAIL: $label" >&2
    echo ":: stdout ::" >&2
    cat "$stdout_file" >&2
    echo ":: stderr ::" >&2
    cat "$stderr_file" >&2
    rm -f "$stdout_file" "$stderr_file"
    return 1
  fi

  node -e 'const fs=require("node:fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));' "$stdout_file"
  echo "PASS: $label"
  rm -f "$stdout_file" "$stderr_file"
}

echo "=== CLI Integration Smoke ==="
echo "URL: ${HULY_URL:-<unset>}"

run_cli_json "projects list" projects list
run_cli_json "project-types list" project-types list
run_cli_json "project-types get" project-types get
run_cli_json "activity mentions list" activity mentions list
run_cli_json "boards list" boards list
run_cli_json "channels list" channels list
run_cli_json "contacts persons list" contacts persons list
run_cli_json "notifications unread-count get" notifications unread-count get
run_cli_json "spaces list" spaces list
run_cli_json "templates list" templates list
run_cli_json "calendar events list" calendar events list
run_cli_json "cards spaces list" cards spaces list
run_cli_json "drive list" drive list
run_cli_json "inventory categories list" inventory categories list
run_cli_json "leads funnels list" leads funnels list
run_cli_json "planner todos list" planner todos list
run_cli_json "recruiting candidates list" recruiting candidates list
run_cli_json "tests projects list" tests projects list
run_cli_json "office floors list" office floors list
run_cli_json "platform associations list" platform associations list
run_cli_json "custom-fields list" custom-fields list
run_cli_json "processes list" processes list
run_cli_json "user-statuses list" user-statuses list
run_cli_json "workspace info get" workspace info get

echo "=== CLI Integration Smoke: PASS ==="
