#!/usr/bin/env bash

set -uo pipefail
umask 077

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
HULY_ENV_FILE=${HULY_ENV_FILE:-"$REPO_ROOT/.env.local"}
INTABIA_ENV_FILE=${INTABIA_ENV_FILE:-"$REPO_ROOT/.env.intabia.local"}
COMPAT_LOG_DIR=${COMPAT_LOG_DIR:-"/tmp/hulymcp-compatibility-$(date +%Y%m%d-%H%M%S)"}

require_env_file() {
  local label=$1
  local env_file=$2

  if [ ! -f "$env_file" ]; then
    echo "ERROR: $label environment file not found: $env_file" >&2
    return 1
  fi
}

run_target() {
  local label=$1
  local env_file=$2
  local log_file=$3
  local status=0

  echo "Running full native-tool integration suite against $label..."
  : >"$log_file"
  chmod 600 "$log_file"
  (
    local variable
    while IFS= read -r variable; do
      unset "$variable"
    done < <(compgen -A variable HULY_)

    set -a
    # shellcheck disable=SC1090
    if ! source "$env_file"; then
      echo "ERROR: could not source $env_file" >&2
      exit 2
    fi
    set +a

    if [ -z "${HULY_URL:-}" ]; then
      echo "ERROR: HULY_URL is missing from $env_file" >&2
      exit 2
    fi

    export HULY_URL="${HULY_URL/localhost/host.docker.internal}"
    export HULY_TOOL_MODE=native
    export HULY_TELEMETRY=false
    bash "$REPO_ROOT/scripts/integration_test_full.sh"
  ) >"$log_file" 2>&1 || status=$?

  local summary
  summary=$(sed -n 's/^  RESULTS: /RESULTS: /p' "$log_file" | tail -n 1)
  if [ -n "$summary" ]; then
    echo "$label: $summary"
  else
    echo "$label: no final summary; inspect $log_file"
  fi
  echo "$label log: $log_file"
  return "$status"
}

env_files_valid=true
require_env_file "Huly" "$HULY_ENV_FILE" || env_files_valid=false
require_env_file "Intabia" "$INTABIA_ENV_FILE" || env_files_valid=false
if [ "$env_files_valid" != true ]; then
  exit 2
fi
if ! mkdir -p "$COMPAT_LOG_DIR" || ! chmod 700 "$COMPAT_LOG_DIR"; then
  echo "ERROR: could not create private log directory: $COMPAT_LOG_DIR" >&2
  exit 2
fi
if ! cd "$REPO_ROOT"; then
  echo "ERROR: could not enter repository root: $REPO_ROOT" >&2
  exit 2
fi

if ! pnpm build; then
  echo "ERROR: build failed; compatibility suites were not run" >&2
  exit 1
fi

huly_status=0
intabia_status=0
run_target "Huly" "$HULY_ENV_FILE" "$COMPAT_LOG_DIR/huly.log" || huly_status=$?
run_target "Intabia" "$INTABIA_ENV_FILE" "$COMPAT_LOG_DIR/intabia.log" || intabia_status=$?

if [ "$huly_status" -ne 0 ] || [ "$intabia_status" -ne 0 ]; then
  echo "Compatibility matrix failed: Huly exit=$huly_status, Intabia exit=$intabia_status" >&2
  exit 1
fi

echo "Compatibility matrix passed."
