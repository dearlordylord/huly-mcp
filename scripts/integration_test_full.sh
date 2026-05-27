#!/bin/bash
# Full integration test suite for Huly MCP server.
# Usage: set -a && source .env.local && set +a && bash scripts/integration_test_full.sh
# Requires: jq, node, HULY_URL/HULY_WORKSPACE/HULY_EMAIL+HULY_PASSWORD env vars
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCRIPT_DIR"

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required but not found"
  exit 1
fi

INTEGRATION_TRANSPORT="${INTEGRATION_TRANSPORT:-stdio}"
INTEGRATION_HTTP_CONFIG="${INTEGRATION_HTTP_CONFIG:-env}"
INTEGRATION_HTTP_HOST="${INTEGRATION_HTTP_HOST:-127.0.0.1}"
INTEGRATION_HTTP_PORT="${INTEGRATION_HTTP_PORT:-19888}"
HTTP_ENDPOINT="http://${INTEGRATION_HTTP_HOST}:${INTEGRATION_HTTP_PORT}/mcp"
HTTP_SERVER_PID=""
HTTP_SERVER_STDOUT=""
HTTP_SERVER_STDERR=""
HTTP_CURL_CONFIG=""
GENERIC_ASSOCIATION_CLEANUP_IDS=""
TM_TASK_TYPE_NAME=""
TM_STATUS_NAME=""
WORKFLOW_CLEANED=false

if [ -z "$HULY_URL" ]; then
  echo "ERROR: HULY_URL not set. Run: set -a && source .env.local && set +a"
  exit 1
fi

if [ "$INTEGRATION_TRANSPORT" != "stdio" ] && [ "$INTEGRATION_TRANSPORT" != "http" ]; then
  echo "ERROR: INTEGRATION_TRANSPORT must be 'stdio' or 'http'"
  exit 1
fi

if [ "$INTEGRATION_HTTP_CONFIG" != "env" ] && [ "$INTEGRATION_HTTP_CONFIG" != "headers" ]; then
  echo "ERROR: INTEGRATION_HTTP_CONFIG must be 'env' or 'headers'"
  exit 1
fi

if [ "$INTEGRATION_TRANSPORT" = "http" ] && ! command -v curl &>/dev/null; then
  echo "ERROR: curl is required for INTEGRATION_TRANSPORT=http"
  exit 1
fi

if [ "$INTEGRATION_TRANSPORT" = "http" ] && [ "$INTEGRATION_HTTP_CONFIG" = "headers" ] && [ -z "${HULY_WORKSPACE:-}" ]; then
  echo "ERROR: INTEGRATION_HTTP_CONFIG=headers requires HULY_WORKSPACE."
  exit 1
fi

if [ "$INTEGRATION_TRANSPORT" = "http" ] && [ "$INTEGRATION_HTTP_CONFIG" = "headers" ] && [ -z "${HULY_TOKEN:-}" ]; then
  echo "ERROR: INTEGRATION_HTTP_CONFIG=headers requires HULY_TOKEN. URL header config v1 does not support email/password headers."
  exit 1
fi

INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}},"id":1}'
PROJECT="HULY"
RUN_ID="$(date +%s)-$$"
PASSED=0
FAILED=0
SKIPPED=0
ERRORS=""

TOOL_TIMEOUT=30

cleanup_http_transport() {
  if [ -n "$HTTP_SERVER_PID" ]; then
    kill "$HTTP_SERVER_PID" 2>/dev/null || true
    wait "$HTTP_SERVER_PID" 2>/dev/null || true
  fi
  if [ -n "$HTTP_SERVER_STDOUT" ]; then
    rm -f "$HTTP_SERVER_STDOUT"
  fi
  if [ -n "$HTTP_SERVER_STDERR" ]; then
    rm -f "$HTTP_SERVER_STDERR"
  fi
  if [ -n "$HTTP_CURL_CONFIG" ]; then
    rm -f "$HTTP_CURL_CONFIG"
  fi
}

cleanup_generic_associations() {
  if [ -n "$GENERIC_ASSOCIATION_CLEANUP_IDS" ]; then
    for association_id in $GENERIC_ASSOCIATION_CLEANUP_IDS; do
      association_json=$(json_string "$association_id")
      relations_result=$(call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":$association_json,\"limit\":200}},\"id\":2}" 2>/dev/null || true)
      if [ -n "$relations_result" ]; then
        relations_text=$(echo "$relations_result" | jq -r '.result.content[0].text // empty' 2>/dev/null)
        if [ -n "$relations_text" ]; then
          while IFS= read -r relation_id; do
            if [ -n "$relation_id" ]; then
              relation_json=$(json_string "$relation_id")
              call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":{\"relation\":$relation_json}},\"id\":2}" >/dev/null 2>&1 || true
            fi
          done < <(printf '%s\n' "$relations_text" | jq -r '.relations[]?.relationId // empty' 2>/dev/null)
        fi
      fi
      call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":$association_json}},\"id\":2}" >/dev/null 2>&1 || true
    done
  fi
}

cleanup_all() {
  cleanup_generic_associations
  cleanup_workflow_artifacts || true
  cleanup_http_transport
}
trap cleanup_all EXIT

cleanup_workflow_artifacts() {
  if [ "$WORKFLOW_CLEANED" = "true" ]; then
    return 0
  fi
  if [ -n "$TM_TASK_TYPE_NAME" ] || [ -n "$TM_STATUS_NAME" ]; then
    echo "=== cleanup: task-management workflow artifacts ===" >&2
    cleanup_args=("--delete-test-issues")
    if [ -n "$TM_TASK_TYPE_NAME" ]; then
      cleanup_args+=("--task-type-name" "$TM_TASK_TYPE_NAME")
    fi
    if [ -n "$TM_STATUS_NAME" ]; then
      cleanup_args+=("--status-name" "$TM_STATUS_NAME")
    fi
    if pnpm exec tsx scripts/cleanup-workflow-artifacts.ts "${cleanup_args[@]}" >&2; then
      WORKFLOW_CLEANED=true
      return 0
    fi
    return 1
  fi
  WORKFLOW_CLEANED=true
  return 0
}

write_http_header_config() {
  HTTP_CURL_CONFIG="$(mktemp)"
  chmod 600 "$HTTP_CURL_CONFIG"
  {
    printf '%s\n' 'header = "content-type: application/json"'
    printf '%s\n' 'header = "accept: application/json, text/event-stream"'
    if [ "$INTEGRATION_HTTP_CONFIG" = "headers" ]; then
      printf 'header = "x-huly-url: %s"\n' "$HULY_URL"
      printf 'header = "x-huly-workspace: %s"\n' "$HULY_WORKSPACE"
      printf 'header = "x-huly-token: %s"\n' "$HULY_TOKEN"
      if [ -n "${HULY_CONNECTION_TIMEOUT:-}" ]; then
        printf 'header = "x-huly-connection-timeout: %s"\n' "$HULY_CONNECTION_TIMEOUT"
      fi
    fi
  } >"$HTTP_CURL_CONFIG"
}

start_http_transport() {
  HTTP_SERVER_STDOUT="$(mktemp)"
  HTTP_SERVER_STDERR="$(mktemp)"
  write_http_header_config

  if [ "$INTEGRATION_HTTP_CONFIG" = "headers" ]; then
    env -u HULY_URL -u HULY_WORKSPACE -u HULY_EMAIL -u HULY_PASSWORD -u HULY_TOKEN -u HULY_CONNECTION_TIMEOUT \
      MCP_TRANSPORT=http MCP_HTTP_PORT="$INTEGRATION_HTTP_PORT" MCP_HTTP_HOST="$INTEGRATION_HTTP_HOST" \
      node dist/index.cjs >"$HTTP_SERVER_STDOUT" 2>"$HTTP_SERVER_STDERR" &
  else
    env MCP_TRANSPORT=http MCP_HTTP_PORT="$INTEGRATION_HTTP_PORT" MCP_HTTP_HOST="$INTEGRATION_HTTP_HOST" \
      node dist/index.cjs >"$HTTP_SERVER_STDOUT" 2>"$HTTP_SERVER_STDERR" &
  fi
  HTTP_SERVER_PID=$!

  for _ in $(seq 1 100); do
    if grep -q "MCP HTTP server listening" "$HTTP_SERVER_STDERR"; then
      echo "HTTP integration transport listening at $HTTP_ENDPOINT (config: $INTEGRATION_HTTP_CONFIG)"
      return 0
    fi
    if ! kill -0 "$HTTP_SERVER_PID" 2>/dev/null; then
      echo "ERROR: HTTP integration transport exited during startup"
      cat "$HTTP_SERVER_STDERR"
      return 1
    fi
    sleep 0.1
  done

  echo "ERROR: HTTP integration transport did not start"
  cat "$HTTP_SERVER_STDERR"
  return 1
}

extract_http_json_response() {
  local response="$1"
  local data
  data=$(printf '%s\n' "$response" | awk '/^data: / { sub(/^data: /, ""); print }' | tail -n 1)
  if [ -n "$data" ]; then
    printf '%s\n' "$data"
  else
    printf '%s\n' "$response"
  fi
}

call_tool_stdio() {
  local payload="$1"
  printf '%s\n%s\n' "$INIT" "$payload" | timeout "$TOOL_TIMEOUT" env MCP_AUTO_EXIT=true node dist/index.cjs 2>/dev/null | grep '"id":2'
}

call_tool_http() {
  local payload="$1"
  local response
  response=$(curl -sS --max-time "$TOOL_TIMEOUT" --config "$HTTP_CURL_CONFIG" --request POST --data "$payload" "$HTTP_ENDPOINT" 2>/dev/null)
  extract_http_json_response "$response" | grep '"id":2'
}

call_tool() {
  local payload="$1"
  if [ "$INTEGRATION_TRANSPORT" = "http" ]; then
    call_tool_http "$payload"
  else
    call_tool_stdio "$payload"
  fi
}

if [ "$INTEGRATION_TRANSPORT" = "http" ]; then
  start_http_transport || exit 1
fi

run_test() {
  local name="$1"
  local payload="$2"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response"
    return 1
  fi
  local rpc_error
  rpc_error=$(echo "$result" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$rpc_error" ]; then
    echo "FAIL: $name => $rpc_error"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${rpc_error}"
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    local err_text
    err_text=$(echo "$result" | jq -r '.result.content[0].text' 2>/dev/null | head -c 200)
    echo "FAIL: $name => $err_text"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${err_text}"
    return 1
  fi
  echo "PASS: $name"
  PASSED=$((PASSED + 1))
  return 0
}

run_capture() {
  local name="$1"
  local payload="$2"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response)" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response"
    return 1
  fi
  local rpc_error
  rpc_error=$(echo "$result" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$rpc_error" ]; then
    echo "FAIL: $name => $rpc_error" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${rpc_error}"
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    local err_text
    err_text=$(echo "$result" | jq -r '.result.content[0].text' 2>/dev/null | head -c 200)
    echo "FAIL: $name => $err_text" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${err_text}"
    return 1
  fi
  echo "PASS: $name" >&2
  PASSED=$((PASSED + 1))
  echo "$result" | jq -r '.result.content[0].text' 2>/dev/null
  return 0
}

run_capture_to_var() {
  local output_var="$1" name="$2" payload="$3"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response)" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response"
    printf -v "$output_var" '%s' ""
    return 1
  fi
  local rpc_error
  rpc_error=$(echo "$result" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$rpc_error" ]; then
    echo "FAIL: $name => $rpc_error" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${rpc_error}"
    printf -v "$output_var" '%s' ""
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    local err_text
    err_text=$(echo "$result" | jq -r '.result.content[0].text' 2>/dev/null | head -c 200)
    echo "FAIL: $name => $err_text" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${err_text}"
    printf -v "$output_var" '%s' ""
    return 1
  fi
  echo "PASS: $name" >&2
  PASSED=$((PASSED + 1))
  printf -v "$output_var" '%s' "$(echo "$result" | jq -r '.result.content[0].text' 2>/dev/null)"
  return 0
}

run_result_to_var() {
  local output_var="$1" name="$2" payload="$3"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response)" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response"
    printf -v "$output_var" '%s' ""
    return 1
  fi
  local rpc_error
  rpc_error=$(echo "$result" | jq -r '.error.message // empty' 2>/dev/null)
  if [ -n "$rpc_error" ]; then
    echo "FAIL: $name => $rpc_error" >&2
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: ${rpc_error}"
    printf -v "$output_var" '%s' ""
    return 1
  fi
  echo "PASS: $name" >&2
  PASSED=$((PASSED + 1))
  printf -v "$output_var" '%s' "$(echo "$result" | jq -c '.result' 2>/dev/null)"
  return 0
}

skip_test() {
  local name="$1"
  local reason="$2"
  echo "SKIP: $name ($reason)"
  SKIPPED=$((SKIPPED + 1))
}

fail_test() {
  local name="$1"
  local reason="$2"
  echo "FAIL: $name ($reason)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: ${reason}"
}

# Like run_capture but does NOT count toward PASS/FAIL — used only for extracting data
run_capture_only() {
  local payload="$1"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    return 1
  fi
  echo "$result" | jq -r '.result.content[0].text' 2>/dev/null
  return 0
}

assert_json_field_nonempty() {
  local name="$1" json="$2" jq_expr="$3"
  local value
  value=$(printf '%s\n' "$json" | jq -r "$jq_expr // empty" 2>/dev/null)
  if [ -n "$value" ]; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (field missing: $jq_expr)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: field missing (${jq_expr})"
  return 1
}

assert_json_field_equals() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  local value
  value=$(printf '%s\n' "$json" | jq -r "$jq_expr" 2>/dev/null)
  if [ "$value" = "$expected" ]; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected $expected, got ${value:-<empty>})"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected ${expected}, got ${value:-<empty>}"
  return 1
}

assert_json_issue_summary_contains_issue_id() {
  local name="$1" json="$2" identifier="$3" issue_id="$4"
  if printf '%s\n' "$json" | jq -e --arg identifier "$identifier" --arg issue_id "$issue_id" \
    'any(.[]?; .identifier == $identifier and .issueId == $issue_id)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (issue summary missing issueId)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: issue summary missing issueId"
  return 1
}

assert_json_association_has_expected_class_label() {
  local name="$1" json="$2" class_id="$3" expected_label="$4"
  if printf '%s\n' "$json" | jq -e --arg class_id "$class_id" --arg expected_label "$expected_label" \
    'any(.associations[]?; (.sourceClass == $class_id and .sourceClassLabel == $expected_label) or (.targetClass == $class_id and .targetClassLabel == $expected_label))' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected label $expected_label for $class_id)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected label ${expected_label} for ${class_id}"
  return 1
}

assert_json_blocks_contains_identifier() {
  local name="$1" json="$2" expected="$3"
  if printf '%s\n' "$json" | jq -e --arg expected "$expected" 'any(.blocks[]?; .identifier == $expected)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (blocks missing identifier: $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: blocks missing identifier ${expected}"
  return 1
}

assert_json_activity_contains_object_id() {
  local name="$1" json="$2" expected="$3"
  if printf '%s\n' "$json" | jq -e --arg expected "$expected" 'any(.[]?; .objectId == $expected)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (activity missing objectId: $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: activity missing objectId ${expected}"
  return 1
}

json_string() {
  jq -Rn --arg value "$1" '$value'
}

# Like run_test but EXPECTS isError:true. PASSes if error, FAILs if success.
run_expect_error() {
  local name="$1"
  local payload="$2"
  local result
  result=$(call_tool "$payload")
  if [ -z "$result" ]; then
    echo "FAIL: $name (no response, expected error)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: no response (expected error)"
    return 1
  fi
  local is_error
  is_error=$(echo "$result" | jq -r '.result.isError // false' 2>/dev/null)
  if [ "$is_error" = "true" ]; then
    echo "PASS: $name (got expected error)"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected error but succeeded)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected error but succeeded"
  return 1
}

# Fetch doc content, assert substring present. Args: test_name teamspace doc_id substring
assert_contains() {
  local name="$1" ts="$2" doc="$3" substr="$4"
  local text
  text=$(run_capture_only \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$ts\",\"document\":\"$doc\"}},\"id\":2}")
  if [ $? -ne 0 ]; then
    echo "FAIL: $name (could not fetch doc)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: could not fetch doc"
    return 1
  fi
  if printf '%s\n' "$text" | grep -qF "$substr"; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (substring not found: $substr)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: substring not found"
  return 1
}

# Fetch doc content, assert substring NOT present. Args: test_name teamspace doc_id substring
assert_not_contains() {
  local name="$1" ts="$2" doc="$3" substr="$4"
  local text
  text=$(run_capture_only \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$ts\",\"document\":\"$doc\"}},\"id\":2}")
  if [ $? -ne 0 ]; then
    echo "FAIL: $name (could not fetch doc)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: could not fetch doc"
    return 1
  fi
  if printf '%s\n' "$text" | grep -qF "$substr"; then
    echo "FAIL: $name (substring should be absent: $substr)"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - ${name}: substring should be absent"
    return 1
  fi
  echo "PASS: $name"
  PASSED=$((PASSED + 1))
  return 0
}

# Use a temp dir without spaces (TMPDIR may contain spaces which would break JSON payloads)
TEST_TMPDIR="${TMPDIR:-/tmp}"
if [[ "$TEST_TMPDIR" == *" "* ]]; then
  TEST_TMPDIR="/tmp"
fi

echo "========================================="
echo "  Full Integration Test Suite"
echo "  Project: $PROJECT | URL: $HULY_URL"
echo "========================================="
echo ""

##############################
# 1. PROJECTS
##############################
echo "=== 1. Projects ==="
run_test "list_projects" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":2}'
run_test "get_project($PROJECT)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_project\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
run_test "list_statuses($PROJECT)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_statuses\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
skip_test "create_project" "would pollute workspace"
skip_test "update_project" "would pollute workspace"
skip_test "delete_project" "would pollute workspace"
echo ""

##############################
# 1r. MCP RESOURCES
##############################
echo "=== 1r. MCP Resources ==="
run_test "resources/templates/list" \
  '{"jsonrpc":"2.0","method":"resources/templates/list","id":2}'
RESOURCE_LIST_JSON=""
if run_result_to_var RESOURCE_LIST_JSON "resources/list(projects)" \
  '{"jsonrpc":"2.0","method":"resources/list","id":2}'; then
  assert_json_field_equals "resources/list includes project($PROJECT)" "$RESOURCE_LIST_JSON" \
    ".resources[]? | select(.uri == \"huly://projects/$PROJECT\") | .name" "$PROJECT"
fi
run_test "resources/read project($PROJECT)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"resources/read\",\"params\":{\"uri\":\"huly://projects/$PROJECT\"},\"id\":2}"
echo ""

##############################
# 1a. TASK MANAGEMENT (workflow mutations with cleanup)
##############################
echo "=== 1a. Task Management ==="
run_test "list_project_types" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_project_types","arguments":{}},"id":2}'
run_test "get_project_type(default Classic)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_project_type","arguments":{}},"id":2}'
run_test "list_task_types(default Classic)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_task_types","arguments":{}},"id":2}'

TM_TASK_TYPE_NAME="IntTest Task Type $RUN_ID"
TM_STATUS_NAME="IntTest QA $RUN_ID"
TM_TASK_TYPE_NAME_JSON=$(json_string "$TM_TASK_TYPE_NAME")
TM_STATUS_NAME_JSON=$(json_string "$TM_STATUS_NAME")
TM_TASK_TYPE_READY=false
TM_TASK_TYPE_STATUS_NAME_JSON=""

TASK_TYPE_TEXT=$(run_capture "create_task_type($TM_TASK_TYPE_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_task_type\",\"arguments\":{\"name\":$TM_TASK_TYPE_NAME_JSON}},\"id\":2}")
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "create_task_type returns task type id" "$TASK_TYPE_TEXT" '.taskType.id'
  TASK_TYPE_TEXT_2=$(run_capture "create_task_type idempotent($TM_TASK_TYPE_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_task_type\",\"arguments\":{\"name\":$TM_TASK_TYPE_NAME_JSON}},\"id\":2}")
  if [ $? -eq 0 ]; then
    CREATED_AGAIN=$(echo "$TASK_TYPE_TEXT_2" | jq -r '.created' 2>/dev/null)
    if [ "$CREATED_AGAIN" = "false" ]; then
      echo "PASS: create_task_type idempotent returns created=false"
      PASSED=$((PASSED + 1))
    else
      echo "FAIL: create_task_type idempotent expected created=false"
      FAILED=$((FAILED + 1))
      ERRORS="${ERRORS}\n  - create_task_type idempotent expected created=false"
    fi
  fi
fi

STATUS_TEXT=$(run_capture "create_issue_status($TM_STATUS_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_status\",\"arguments\":{\"name\":$TM_STATUS_NAME_JSON,\"category\":\"active\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "create_issue_status returns status id" "$STATUS_TEXT" '.status.id'
  STATUS_TEXT_2=$(run_capture "create_issue_status idempotent($TM_STATUS_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_status\",\"arguments\":{\"name\":$TM_STATUS_NAME_JSON,\"category\":\"active\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    CREATED_AGAIN=$(echo "$STATUS_TEXT_2" | jq -r '.created' 2>/dev/null)
    if [ "$CREATED_AGAIN" = "false" ]; then
      echo "PASS: create_issue_status idempotent returns created=false"
      PASSED=$((PASSED + 1))
    else
      echo "FAIL: create_issue_status idempotent expected created=false"
      FAILED=$((FAILED + 1))
      ERRORS="${ERRORS}\n  - create_issue_status idempotent expected created=false"
    fi
  fi
fi

sleep 2
PROJECT_TYPE_TEXT=$(run_capture "get_project_type verifies task/status" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_project_type","arguments":{}},"id":2}')
if [ $? -eq 0 ]; then
  TASK_TYPE_PRESENT=$(echo "$PROJECT_TYPE_TEXT" | jq -r --arg name "$TM_TASK_TYPE_NAME" 'any(.taskTypes[]?; .name == $name)' 2>/dev/null)
  STATUS_PRESENT=$(echo "$PROJECT_TYPE_TEXT" | jq -r --arg name "$TM_STATUS_NAME" 'any(.statuses[]?; .name == $name and .category == "Active")' 2>/dev/null)
  TM_TASK_TYPE_STATUS_ID=$(echo "$PROJECT_TYPE_TEXT" | jq -r --arg name "$TM_TASK_TYPE_NAME" '.taskTypeStatuses[]? | select(.taskTypeName == $name) | .statusIds[0] // empty' 2>/dev/null | head -n 1)
  TM_TASK_TYPE_STATUS_NAME=$(echo "$PROJECT_TYPE_TEXT" | jq -r --arg id "$TM_TASK_TYPE_STATUS_ID" '.statuses[]? | select(.id == $id) | .name // empty' 2>/dev/null | head -n 1)
  if [ "$TASK_TYPE_PRESENT" = "true" ] && [ "$STATUS_PRESENT" = "true" ] && [ -n "$TM_TASK_TYPE_STATUS_NAME" ]; then
    echo "PASS: get_project_type includes created task type and status"
    PASSED=$((PASSED + 1))
    TM_TASK_TYPE_READY=true
    TM_TASK_TYPE_STATUS_NAME_JSON=$(json_string "$TM_TASK_TYPE_STATUS_NAME")
  else
    echo "FAIL: get_project_type missing created task type or status"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - get_project_type missing created task type or status"
  fi
fi
echo ""

##############################
# 1b. LEADS (read-only, uses existing workspace data)
##############################
echo "=== 1b. Leads ==="
FUNNELS_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_funnels","arguments":{"limit":5}},"id":2}')
if [ $? -eq 0 ]; then
  FUNNEL_COUNT=$(echo "$FUNNELS_TEXT" | jq -r '.funnels | length' 2>/dev/null)
  if [ -n "$FUNNEL_COUNT" ] && [ "$FUNNEL_COUNT" -gt 0 ]; then
    FIRST_FUNNEL_ID=$(echo "$FUNNELS_TEXT" | jq -r '.funnels[0].identifier // empty' 2>/dev/null)
    FIRST_FUNNEL_NAME=$(echo "$FUNNELS_TEXT" | jq -r '.funnels[0].name // empty' 2>/dev/null)

    run_test "list_funnels" \
      '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_funnels","arguments":{"limit":5}},"id":2}'

    if [ -n "$FIRST_FUNNEL_ID" ]; then
      LEADS_TEXT=$(run_capture_only \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_leads\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"limit\":5}},\"id\":2}")
      if [ $? -eq 0 ]; then
        run_test "list_leads($FIRST_FUNNEL_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_leads\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"limit\":5}},\"id\":2}"

        if [ -n "$FIRST_FUNNEL_NAME" ]; then
          FIRST_FUNNEL_NAME_JSON=$(json_string "$FIRST_FUNNEL_NAME")
          run_test "list_leads(by_name:$FIRST_FUNNEL_NAME)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_leads\",\"arguments\":{\"funnel\":$FIRST_FUNNEL_NAME_JSON,\"limit\":5}},\"id\":2}"
        fi

        FIRST_LEAD_ID=$(echo "$LEADS_TEXT" | jq -r '.[0].identifier // empty' 2>/dev/null)
        if [ -n "$FIRST_LEAD_ID" ]; then
          run_test "get_lead($FIRST_LEAD_ID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead\",\"arguments\":{\"funnel\":\"$FIRST_FUNNEL_ID\",\"identifier\":\"$FIRST_LEAD_ID\"}},\"id\":2}"

          if [ -n "$FIRST_FUNNEL_NAME" ]; then
            FIRST_FUNNEL_NAME_JSON=$(json_string "$FIRST_FUNNEL_NAME")
            run_test "get_lead(by_name:$FIRST_LEAD_ID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_lead\",\"arguments\":{\"funnel\":$FIRST_FUNNEL_NAME_JSON,\"identifier\":\"$FIRST_LEAD_ID\"}},\"id\":2}"
          fi
        else
          skip_test "get_lead" "selected funnel has no leads"
        fi
      else
        skip_test "list_leads/get_lead" "selected funnel could not be queried"
      fi
    else
      skip_test "list_leads/get_lead" "list_funnels returned no stable funnel identifier"
    fi
  else
    skip_test "leads" "no funnels found in workspace"
  fi
else
  skip_test "leads" "list_funnels failed"
fi
echo ""

##############################
# 2. ISSUES CRUD + RELATIONS + LABELS + MOVE
##############################
echo "=== 2. Issues CRUD ==="
ISSUE_ID=""
ISSUE_OBJ_ID=""
ISSUE_TEXT=$(run_capture "create_issue" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"IntTest Issue\",\"description\":\"Integration test\",\"priority\":\"low\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  ISSUE_ID=$(echo "$ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
  ISSUE_OBJ_ID=$(echo "$ISSUE_TEXT" | jq -r '.issueId' 2>/dev/null)
  echo "  => $ISSUE_ID ($ISSUE_OBJ_ID)"

  run_capture_to_var GET_ISSUE_TEXT "get_issue($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_field_equals "get_issue returns issueId" "$GET_ISSUE_TEXT" ".issueId" "$ISSUE_OBJ_ID"
  fi

  run_test "resources/read issue($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"resources/read\",\"params\":{\"uri\":\"huly://issues/$ISSUE_ID\"},\"id\":2}"

  run_capture_to_var LIST_ISSUES_TEXT "list_issues" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"titleSearch\":\"IntTest Issue\",\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_issue_summary_contains_issue_id "list_issues includes issueId" "$LIST_ISSUES_TEXT" "$ISSUE_ID" "$ISSUE_OBJ_ID"
  fi

  run_test "update_issue($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"title\":\"Updated IntTest\",\"priority\":\"high\"}},\"id\":2}"

  if [ "$TM_TASK_TYPE_READY" = "true" ]; then
    TASK_TYPED_ISSUE_TEXT=$(run_capture "create_issue(taskType=$TM_TASK_TYPE_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Typed IntTest Issue\",\"taskType\":$TM_TASK_TYPE_NAME_JSON,\"status\":$TM_TASK_TYPE_STATUS_NAME_JSON}},\"id\":2}")
    if [ $? -eq 0 ]; then
      TASK_TYPED_ISSUE_ID=$(echo "$TASK_TYPED_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
      echo "  => typed: $TASK_TYPED_ISSUE_ID"
    fi

    run_test "update_issue($ISSUE_ID taskType=$TM_TASK_TYPE_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"taskType\":$TM_TASK_TYPE_NAME_JSON,\"status\":$TM_TASK_TYPE_STATUS_NAME_JSON}},\"id\":2}"
    if [ -n "$TASK_TYPED_ISSUE_ID" ]; then
      run_test "delete_issue(task_typed:$TASK_TYPED_ISSUE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TASK_TYPED_ISSUE_ID\"}},\"id\":2}"
    fi
  else
    skip_test "create_issue(taskType)" "task-management setup did not verify disposable task type/status"
    skip_test "update_issue(taskType)" "task-management setup did not verify disposable task type/status"
  fi

  # Sub-issue + move
  SUB_ID=""
  SUB_TEXT=$(run_capture "create_issue(sub)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Sub Issue\",\"parentIssue\":\"$ISSUE_ID\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    SUB_ID=$(echo "$SUB_TEXT" | jq -r '.identifier' 2>/dev/null)
    echo "  => sub: $SUB_ID"
    run_test "list_sub_issues" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"parentIssue\":\"$ISSUE_ID\"}},\"id\":2}"
    run_test "move_issue($SUB_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"move_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SUB_ID\",\"newParent\":null}},\"id\":2}"
    run_test "delete_issue(sub:$SUB_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SUB_ID\"}},\"id\":2}"
  fi

  # Issue relations
  ISSUE2_TEXT=$(run_capture "create_issue(for_relation)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Relation Target\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    ISSUE2_ID=$(echo "$ISSUE2_TEXT" | jq -r '.identifier' 2>/dev/null)
    echo "  => relation target: $ISSUE2_ID"
    run_test "add_issue_relation" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_issue_relation\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"targetIssue\":\"$ISSUE2_ID\",\"relationType\":\"is-blocked-by\"}},\"id\":2}"
    run_test "list_issue_relations" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issue_relations\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\"}},\"id\":2}"
    REL_BLOCKS_TEXT=$(run_capture "list_issue_relations(blocks:$ISSUE2_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issue_relations\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE2_ID\"}},\"id\":2}")
    if [ $? -eq 0 ]; then
      assert_json_blocks_contains_identifier "list_issue_relations blocks contains $ISSUE_ID" "$REL_BLOCKS_TEXT" "$ISSUE_ID"
    fi
    run_test "remove_issue_relation" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_issue_relation\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"targetIssue\":\"$ISSUE2_ID\",\"relationType\":\"is-blocked-by\"}},\"id\":2}"
    run_test "delete_issue(relation:$ISSUE2_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE2_ID\"}},\"id\":2}"
  fi

  # Issue labels
  LBL_TEXT=$(run_capture "create_label(for_issue)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_label\",\"arguments\":{\"title\":\"inttest-lbl\",\"color\":2}},\"id\":2}")
  if [ $? -eq 0 ]; then
    LBL_ID=$(echo "$LBL_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => label: $LBL_ID"
    run_test "add_issue_label($ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_issue_label\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"label\":\"inttest-lbl\"}},\"id\":2}"
    run_test "remove_issue_label($ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_issue_label\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"label\":\"inttest-lbl\"}},\"id\":2}"
    run_test "delete_label($LBL_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_label\",\"arguments\":{\"label\":\"$LBL_ID\"}},\"id\":2}"
  fi

  # Comments on issue
  COMMENT_TEXT=$(run_capture "add_comment($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_comment\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"body\":\"IntTest comment\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    COMMENT_ID=$(echo "$COMMENT_TEXT" | jq -r '.commentId' 2>/dev/null)
    echo "  => comment: $COMMENT_ID"
    run_test "list_comments($ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_comments\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\"}},\"id\":2}"
    run_test "update_comment($COMMENT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_comment\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"commentId\":\"$COMMENT_ID\",\"body\":\"Updated comment\"}},\"id\":2}"
    run_test "delete_comment($COMMENT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_comment\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"commentId\":\"$COMMENT_ID\"}},\"id\":2}"
  fi

  # Activity on issue
  ACTIVITY_TEXT=$(run_capture "list_activity(issue:$ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_activity\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"limit\":3}},\"id\":2}")
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_activity_contains_object_id "list_activity friendly target contains $ISSUE_OBJ_ID" "$ACTIVITY_TEXT" "$ISSUE_OBJ_ID"
  fi

  # Time tracking
  run_test "log_time($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"log_time\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"value\":30}},\"id\":2}"
  run_test "get_time_report($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_time_report\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"
  run_test "get_detailed_time_report($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_detailed_time_report\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"

  # Preview deletion
  run_test "preview_deletion($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"preview_deletion\",\"arguments\":{\"entityType\":\"issue\",\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"

  run_test "delete_issue($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 3. COMPONENTS CRUD + set_issue_component
##############################
echo "=== 3. Components CRUD ==="
COMP_TEXT=$(run_capture "create_component" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_component\",\"arguments\":{\"project\":\"$PROJECT\",\"label\":\"IntTest Comp\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  COMP_ID=$(echo "$COMP_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => $COMP_ID"
  run_test "list_components" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_components\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
  run_test "get_component($COMP_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_component\",\"arguments\":{\"project\":\"$PROJECT\",\"component\":\"$COMP_ID\"}},\"id\":2}"
  run_test "update_component($COMP_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_component\",\"arguments\":{\"project\":\"$PROJECT\",\"component\":\"$COMP_ID\",\"label\":\"Updated Comp\"}},\"id\":2}"

  # set_issue_component
  SET_COMP_TEXT=$(run_capture "create_issue(for_component)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Comp Test Issue\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    SET_COMP_ISSUE=$(echo "$SET_COMP_TEXT" | jq -r '.identifier' 2>/dev/null)
    run_test "set_issue_component($SET_COMP_ISSUE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_issue_component\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_COMP_ISSUE\",\"component\":\"Updated Comp\"}},\"id\":2}"
    run_test "delete_issue(comp_test:$SET_COMP_ISSUE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_COMP_ISSUE\"}},\"id\":2}"
  fi

  run_test "delete_component($COMP_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_component\",\"arguments\":{\"project\":\"$PROJECT\",\"component\":\"$COMP_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 4. MILESTONES CRUD + set_issue_milestone
##############################
echo "=== 4. Milestones CRUD ==="
MS_TEXT=$(run_capture "create_milestone" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"label\":\"IntTest MS\",\"targetDate\":1777000000000}},\"id\":2}")
if [ $? -eq 0 ]; then
  MS_ID=$(echo "$MS_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => $MS_ID"
  run_test "list_milestones" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_milestones\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
  run_test "get_milestone($MS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"milestone\":\"$MS_ID\"}},\"id\":2}"
  run_test "update_milestone($MS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"milestone\":\"$MS_ID\",\"label\":\"Updated MS\"}},\"id\":2}"

  # set_issue_milestone
  SET_MS_TEXT=$(run_capture "create_issue(for_milestone)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"MS Test Issue\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    SET_MS_ISSUE=$(echo "$SET_MS_TEXT" | jq -r '.identifier' 2>/dev/null)
    run_test "set_issue_milestone($SET_MS_ISSUE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_issue_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_MS_ISSUE\",\"milestone\":\"Updated MS\"}},\"id\":2}"
    run_test "delete_issue(ms_test:$SET_MS_ISSUE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$SET_MS_ISSUE\"}},\"id\":2}"
  fi

  run_test "delete_milestone($MS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"milestone\":\"$MS_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 5. ISSUE TEMPLATES CRUD + CHILDREN
##############################
echo "=== 5. Issue Templates CRUD ==="
TMPL_TEXT=$(run_capture "create_issue_template" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_template\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"IntTest Tmpl\",\"priority\":\"high\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  TMPL_ID=$(echo "$TMPL_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => $TMPL_ID"
  run_test "list_issue_templates" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issue_templates\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"
  run_test "get_issue_template($TMPL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_issue_template\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\"}},\"id\":2}"
  run_test "update_issue_template($TMPL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_issue_template\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"title\":\"Updated Tmpl\"}},\"id\":2}"

  # Template children
  CHILD_TEXT=$(run_capture "add_template_child($TMPL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_template_child\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"title\":\"Child Task\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    CHILD_ID=$(echo "$CHILD_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => child: $CHILD_ID"
    run_test "remove_template_child($CHILD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_template_child\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"childId\":\"$CHILD_ID\"}},\"id\":2}"
  fi

  # Create from template (NOTE: may hang due to eventual consistency if template was just modified)
  TMPL_ISSUE_TEXT=$(run_capture "create_issue_from_template" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_from_template\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"title\":\"From Template\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    TMPL_ISSUE_ID=$(echo "$TMPL_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
    run_test "delete_issue(from_tmpl:$TMPL_ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TMPL_ISSUE_ID\"}},\"id\":2}"
  fi

  run_test "delete_issue_template($TMPL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue_template\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 6. LABELS & TAG CATEGORIES
##############################
echo "=== 6. Labels & Tag Categories ==="
TC_TEXT=$(run_capture "create_tag_category" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_tag_category\",\"arguments\":{\"label\":\"IntTest Category\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  TC_ID=$(echo "$TC_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => tag_cat: $TC_ID"
  run_test "list_tag_categories" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_tag_categories","arguments":{}},"id":2}'
  run_test "update_tag_category($TC_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_tag_category\",\"arguments\":{\"category\":\"$TC_ID\",\"label\":\"Updated Cat\"}},\"id\":2}"
  run_test "delete_tag_category($TC_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_tag_category\",\"arguments\":{\"category\":\"$TC_ID\"}},\"id\":2}"
fi

LBL_TEXT=$(run_capture "create_label" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_label","arguments":{"title":"inttest-label","color":1}},"id":2}')
if [ $? -eq 0 ]; then
  LBL_ID=$(echo "$LBL_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => label: $LBL_ID"
  run_test "list_labels" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_labels","arguments":{}},"id":2}'
  run_test "update_label($LBL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_label\",\"arguments\":{\"label\":\"$LBL_ID\",\"title\":\"updated-label\"}},\"id\":2}"
  run_test "delete_label($LBL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_label\",\"arguments\":{\"label\":\"$LBL_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 7. DOCUMENTS
##############################
echo "=== 7. Documents ==="
run_test "list_teamspaces" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_teamspaces","arguments":{}},"id":2}'
TS_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_teamspaces","arguments":{}},"id":2}')
TS_NAME=$(echo "$TS_TEXT" | jq -r '.teamspaces[0].name // empty' 2>/dev/null)
if [ -n "$TS_NAME" ]; then
  run_test "list_documents($TS_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_documents\",\"arguments\":{\"teamspace\":\"$TS_NAME\"}},\"id\":2}"

  DOC_TEXT=$(run_capture "create_document" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":\"IntTest Doc\",\"content\":\"# Test\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    DOC_ID=$(echo "$DOC_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => doc: $DOC_ID"
    assert_json_field_nonempty "create_document($DOC_ID) returns url" "$DOC_TEXT" '.url'

    GET_DOC_TEXT=$(run_capture "get_document($DOC_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}")
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "get_document($DOC_ID) returns url" "$GET_DOC_TEXT" '.url'
    fi

    EDIT_DOC_TEXT=$(run_capture "edit_document($DOC_ID) title rename" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\",\"title\":\"Updated Doc\"}},\"id\":2}")
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "edit_document($DOC_ID) returns url" "$EDIT_DOC_TEXT" '.url'
    fi

    LIST_DOCS_TEXT=$(run_capture_only \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_documents\",\"arguments\":{\"teamspace\":\"$TS_NAME\"}},\"id\":2}")
    if [ -n "$LIST_DOCS_TEXT" ]; then
      LIST_DOC_URL=$(printf '%s\n' "$LIST_DOCS_TEXT" | jq -r --arg doc_id "$DOC_ID" '.documents[] | select(.id == $doc_id) | .url // empty' 2>/dev/null | head -n 1)
      if [ -n "$LIST_DOC_URL" ]; then
        echo "PASS: list_documents($TS_NAME) returns url for $DOC_ID"
        PASSED=$((PASSED + 1))
      else
        echo "FAIL: list_documents($TS_NAME) returns url for $DOC_ID"
        FAILED=$((FAILED + 1))
        ERRORS="${ERRORS}\n  - list_documents(${TS_NAME}) missing url for ${DOC_ID}"
      fi
    fi

    run_test "list_inline_comments($DOC_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inline_comments\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}"
    run_test "delete_document($DOC_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}"
  fi
else
  skip_test "documents" "no teamspace found"
fi
echo ""

##############################
# 7b. DOCUMENT EDIT (S&R)
##############################
echo "=== 7b. Document Edit (Search & Replace) ==="

# Big structured markdown content (~3K chars) with repeated words, code block, special chars
SR_CONTENT='# Project Overview\n\nThis document describes the **Project Alpha** architecture. TODO: finalize scope.\n\n## Getting Started\n\nTo set up the project, follow these steps:\n\n- Install dependencies with `pnpm install`\n- Configure the `config.yaml` file\n- Set the `$API_KEY` environment variable\n- TODO: add Docker instructions\n\n## API Reference\n\nThe API exposes the following endpoints:\n\n### GET /users\n\nReturns a list of users. The response includes `id`, `name`, and `email` fields.\nEach user object also contains a `role` field with values like *admin*, *editor*, or *viewer*.\n\n### POST /users\n\nCreates a new user. Required fields: `name` and `email`.\n\n## Code Examples\n\n```typescript\nimport { Client } from \"./sdk\";\n\nconst client = new Client({ baseUrl: \"https://api.example.com\" });\n\nasync function main() {\n  const users = await client.getUsers();\n  console.log(\"Found users:\", users.length);\n  \n  for (const user of users) {\n    console.log(`User: ${user.name} (${user.email})`);\n  }\n}\n\nmain().catch(console.error);\n```\n\n## Configuration\n\nThe system supports the following configuration options:\n\n| Option | Type | Default | Description |\n|--------|------|---------|-------------|\n| port | number | 3000 | Server port |\n| debug | boolean | false | Enable debug mode |\n| logLevel | string | \"info\" | Log verbosity |\n\n## Deployment Notes\n\nThe deployment pipeline uses GitHub Actions. TODO: document rollback procedure.\nMake sure the `$DATABASE_URL` variable is set in the production environment.\nThe health check endpoint is available at `/health` and returns a 200 status code.\n\n## Troubleshooting\n\nCommon issues and solutions:\n\n- **Connection timeout**: Check that the `$API_KEY` is valid and not expired\n- **Rate limiting**: The API allows 100 requests per minute per API key\n- **Data sync**: Allow up to 5 minutes for changes to propagate across regions'

# Create a dedicated teamspace for S&R tests
SR_TS_TEXT=$(run_capture "create_teamspace(SR)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_teamspace","arguments":{"name":"SR Test Space","description":"search and replace integration test"}},"id":2}')
if [ $? -eq 0 ]; then
  SR_TS_ID=$(echo "$SR_TS_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => teamspace: $SR_TS_ID"

  # Step 1: Create doc with big content
  SR_DOC_TEXT=$(run_capture "sr: create big doc" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"title\":\"SR Test Doc\",\"content\":\"$SR_CONTENT\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    SR_DOC_ID=$(echo "$SR_DOC_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => doc: $SR_DOC_ID"
    assert_contains "sr: baseline has API Reference" "$SR_TS_ID" "$SR_DOC_ID" "## API Reference"

    # Step 2: Replace unique heading
    run_test "sr: heading rename" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"## API Reference\",\"new_text\":\"## API Docs\"}},\"id\":2}"
    assert_contains "sr: heading changed" "$SR_TS_ID" "$SR_DOC_ID" "## API Docs"
    assert_not_contains "sr: old heading gone" "$SR_TS_ID" "$SR_DOC_ID" "## API Reference"

    # Step 3: Replace inside code block
    run_test "sr: edit inside code block" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"console.log(\\\"Found users:\\\", users.length)\",\"new_text\":\"logger.info(\\\"Found users:\\\", users.length)\"}},\"id\":2}"
    assert_contains "sr: code block updated" "$SR_TS_ID" "$SR_DOC_ID" "logger.info"
    assert_contains "sr: code fences intact" "$SR_TS_ID" "$SR_DOC_ID" '```typescript'

    # Step 4: Replace multi-word phrase
    run_test "sr: multi-word phrase" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"health check endpoint is available at\",\"new_text\":\"readiness probe is exposed at\"}},\"id\":2}"
    assert_contains "sr: new phrase present" "$SR_TS_ID" "$SR_DOC_ID" "readiness probe is exposed at"
    assert_not_contains "sr: old phrase gone" "$SR_TS_ID" "$SR_DOC_ID" "health check endpoint is available at"

    # Step 5: replace_all on word appearing 3x (TODO)
    run_test "sr: replace_all TODO" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"TODO\",\"new_text\":\"DONE\",\"replace_all\":true}},\"id\":2}"
    assert_not_contains "sr: no TODO remains" "$SR_TS_ID" "$SR_DOC_ID" "TODO"
    assert_contains "sr: DONE present" "$SR_TS_ID" "$SR_DOC_ID" "DONE"

    # Step 6: Delete text (empty new_text) — remove a bullet point
    run_test "sr: delete bullet" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"- **Rate limiting**: The API allows 100 requests per minute per API key\",\"new_text\":\"\"}},\"id\":2}"
    assert_not_contains "sr: bullet removed" "$SR_TS_ID" "$SR_DOC_ID" "Rate limiting"
    assert_contains "sr: neighbor intact" "$SR_TS_ID" "$SR_DOC_ID" "Connection timeout"

    # Step 7: Non-existent text (expect error)
    run_expect_error "sr: not found error" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"this text does not exist anywhere in the document\",\"new_text\":\"replacement\"}},\"id\":2}"
    assert_contains "sr: content unchanged after not-found" "$SR_TS_ID" "$SR_DOC_ID" "Project Alpha"

    # Step 8: Ambiguous match without replace_all (expect error) — "DONE" appears 3x
    run_expect_error "sr: ambiguous match error" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"old_text\":\"DONE\",\"new_text\":\"FIXED\"}},\"id\":2}"
    assert_contains "sr: content unchanged after ambiguous" "$SR_TS_ID" "$SR_DOC_ID" "Project Alpha"

    # Step 9: Full replace — overwrite entire content
    run_test "sr: full replace" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\",\"content\":\"# Replaced\"}},\"id\":2}"
    assert_contains "sr: full replace content" "$SR_TS_ID" "$SR_DOC_ID" "# Replaced"
    assert_not_contains "sr: old content gone" "$SR_TS_ID" "$SR_DOC_ID" "Project Alpha"

    # Step 10: Cleanup
    run_test "sr: delete doc" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"document\":\"$SR_DOC_ID\"}},\"id\":2}"
  fi

  run_test "sr: delete teamspace" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_teamspace\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\"}},\"id\":2}"
else
  skip_test "document S&R" "could not create teamspace"
fi
echo ""

##############################
# 8. TEAMSPACES
##############################
echo "=== 8. Teamspaces ==="
NEW_TS_TEXT=$(run_capture "create_teamspace" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_teamspace","arguments":{"name":"IntTest Space","description":"test"}},"id":2}')
if [ $? -eq 0 ]; then
  NEW_TS_ID=$(echo "$NEW_TS_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => teamspace: $NEW_TS_ID"
  run_test "get_teamspace($NEW_TS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_teamspace\",\"arguments\":{\"teamspace\":\"$NEW_TS_ID\"}},\"id\":2}"
  run_test "update_teamspace($NEW_TS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_teamspace\",\"arguments\":{\"teamspace\":\"$NEW_TS_ID\",\"name\":\"Updated Space\"}},\"id\":2}"
  run_test "delete_teamspace($NEW_TS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_teamspace\",\"arguments\":{\"teamspace\":\"$NEW_TS_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 9. CHANNELS & MESSAGES
##############################
echo "=== 9. Channels & Messages ==="
run_test "list_channels" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_channels","arguments":{}},"id":2}'
run_test "get_channel(general)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_channel","arguments":{"channel":"general"}},"id":2}'
run_test "list_channel_messages(general)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_channel_messages","arguments":{"channel":"general","limit":3}},"id":2}'
DM_LIST_TEXT=$(run_capture "list_direct_messages" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_direct_messages","arguments":{"limit":3}},"id":2}')
if [ -n "$HULY_EMAIL" ]; then
  SELF_EMAIL_JSON=$(json_string "$HULY_EMAIL")
  run_expect_error "create_direct_message(rejects_self)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_direct_message\",\"arguments\":{\"person\":$SELF_EMAIL_JSON}},\"id\":2}"
else
  skip_test "create_direct_message(rejects_self)" "HULY_EMAIL is not set"
fi
SELF_NAME=""
EMPLOYEES_FOR_DM_TEXT=""
if [ -n "$HULY_EMAIL" ]; then
  EMPLOYEES_FOR_DM_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":200}},"id":2}')
  if [ $? -eq 0 ]; then
    SELF_NAME=$(echo "$EMPLOYEES_FOR_DM_TEXT" | jq -r --arg email "$HULY_EMAIL" '[.[]? | select(.email == $email) | .name // empty] | unique | if length == 1 then .[0] else empty end' 2>/dev/null)
  else
    EMPLOYEES_FOR_DM_TEXT=""
  fi
fi
if [ -n "$SELF_NAME" ]; then
  EXISTING_DM_PERSON_NAME=$(echo "$DM_LIST_TEXT" | jq -r --arg self "$SELF_NAME" '.conversations[]? | select((.participantIds // [] | length) == 2 and (.participants // [] | length) == 2 and ((.participants // []) | index($self) != null)) | .participants[]? | select(. != $self)' 2>/dev/null | head -1)
  if [ -n "$EXISTING_DM_PERSON_NAME" ]; then
    EXISTING_DM_PERSON_EMAIL=$(echo "$EMPLOYEES_FOR_DM_TEXT" | jq -r --arg name "$EXISTING_DM_PERSON_NAME" '[.[]? | select(.name == $name and (.email // "") != "") | .email] | unique | if length == 1 then .[0] else empty end' 2>/dev/null)
    if [ -n "$EXISTING_DM_PERSON_EMAIL" ]; then
      EXISTING_DM_PERSON_JSON=$(json_string "$EXISTING_DM_PERSON_EMAIL")
      CREATE_DM_TEXT=$(run_capture "create_direct_message(existing:$EXISTING_DM_PERSON_NAME)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_direct_message\",\"arguments\":{\"person\":$EXISTING_DM_PERSON_JSON}},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "create_direct_message existing created=false" "$CREATE_DM_TEXT" ".created" "false"
      fi
    else
      skip_test "create_direct_message(existing)" "existing DM participant is not uniquely identifiable by email"
    fi
  else
    skip_test "create_direct_message(existing)" "no existing one-to-one DM participant found"
  fi
else
  skip_test "create_direct_message(existing)" "could not determine current employee name"
fi
DM_ID="${HULY_TEST_DM_ID:-}"
if [ -z "$DM_ID" ]; then
  DM_ID=$(echo "$DM_LIST_TEXT" | jq -r '.conversations[0].id // empty' 2>/dev/null)
fi
if [ -n "$DM_ID" ]; then
  run_test "list_dm_messages($DM_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_dm_messages\",\"arguments\":{\"dm\":\"$DM_ID\",\"limit\":3}},\"id\":2}"
  DM_MSG_TEXT=$(run_capture "send_dm_message($DM_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"send_dm_message\",\"arguments\":{\"dm\":\"$DM_ID\",\"body\":\"IntTest DM msg $RUN_ID\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    DM_MSG_ID=$(echo "$DM_MSG_TEXT" | jq -r '.id // empty' 2>/dev/null)
    if [ -n "$DM_MSG_ID" ]; then
      run_test "update_dm_message($DM_MSG_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_dm_message\",\"arguments\":{\"dm\":\"$DM_ID\",\"messageId\":\"$DM_MSG_ID\",\"body\":\"Updated IntTest DM msg $RUN_ID\"}},\"id\":2}"
      run_test "delete_dm_message($DM_MSG_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_dm_message\",\"arguments\":{\"dm\":\"$DM_ID\",\"messageId\":\"$DM_MSG_ID\"}},\"id\":2}"
    else
      echo "FAIL: DM message update/delete (send_dm_message returned no id)"
      FAILED=$((FAILED + 1))
      ERRORS="${ERRORS}\n  - DM message update/delete: send_dm_message returned no id"
    fi
  fi
else
  echo "FAIL: DM message tools (set HULY_TEST_DM_ID or create a direct-message conversation in the test workspace)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - DM message tools: no fixture DM; set HULY_TEST_DM_ID or create a direct-message conversation"
fi

# Create a temp channel for message/thread/reaction tests — deleting it cleans up all messages
CH_TEXT=$(run_capture "create_channel" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_channel","arguments":{"name":"inttest-chan","topic":"test channel"}},"id":2}')
if [ $? -eq 0 ]; then
  CH_ID=$(echo "$CH_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => channel: $CH_ID"

  # Send a channel message, then reply + reactions
  MSG_TEXT=$(run_capture "send_channel_message(inttest-chan)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"send_channel_message\",\"arguments\":{\"channel\":\"$CH_ID\",\"body\":\"IntTest msg\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    MSG_ID=$(echo "$MSG_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => msg: $MSG_ID"

    # Thread replies
    REPLY_TEXT=$(run_capture "add_thread_reply($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_thread_reply\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\",\"body\":\"IntTest reply\"}},\"id\":2}")
    if [ $? -eq 0 ]; then
      REPLY_ID=$(echo "$REPLY_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => reply: $REPLY_ID"
      run_test "list_thread_replies($MSG_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_thread_replies\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\"}},\"id\":2}"
      run_test "update_thread_reply($REPLY_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_thread_reply\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\",\"replyId\":\"$REPLY_ID\",\"body\":\"Updated reply\"}},\"id\":2}"
      run_test "delete_thread_reply($REPLY_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_thread_reply\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\",\"replyId\":\"$REPLY_ID\"}},\"id\":2}"
    fi

    # Reactions
    run_test "add_reaction($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_reaction\",\"arguments\":{\"messageId\":\"$MSG_ID\",\"emoji\":\"thumbsup\"}},\"id\":2}"
    run_test "list_reactions($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_reactions\",\"arguments\":{\"messageId\":\"$MSG_ID\"}},\"id\":2}"
    run_test "remove_reaction($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_reaction\",\"arguments\":{\"messageId\":\"$MSG_ID\",\"emoji\":\"thumbsup\"}},\"id\":2}"

    # Save/unsave message
    run_test "save_message($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"save_message\",\"arguments\":{\"messageId\":\"$MSG_ID\"}},\"id\":2}"
    run_test "unsave_message($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unsave_message\",\"arguments\":{\"messageId\":\"$MSG_ID\"}},\"id\":2}"
  fi

  run_test "update_channel($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_channel\",\"arguments\":{\"channel\":\"$CH_ID\",\"topic\":\"updated\"}},\"id\":2}"
  run_test "delete_channel($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 10. CONTACTS
##############################
echo "=== 10. Contacts ==="
run_test "list_persons" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_persons","arguments":{"limit":3}},"id":2}'
run_test "list_employees" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":3}},"id":2}'
run_test "list_organizations" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_organizations","arguments":{"limit":3}},"id":2}'
run_test "get_user_profile" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_user_profile","arguments":{}},"id":2}'

PERSON_TEXT=$(run_capture "create_person" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_person","arguments":{"firstName":"IntTest","lastName":"Person","email":"inttest@test.local"}},"id":2}')
if [ $? -eq 0 ]; then
  PERSON_ID=$(echo "$PERSON_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => person: $PERSON_ID"
  run_test "update_person($PERSON_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_person\",\"arguments\":{\"personId\":\"$PERSON_ID\",\"city\":\"TestCity\"}},\"id\":2}"
  run_test "delete_person($PERSON_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":\"$PERSON_ID\"}},\"id\":2}"
fi

skip_test "get_person" "covered by create+update cycle"
ORG_SUFFIX="$(date +%s)-$$"
ORG_NAME="IntTest Org $ORG_SUFFIX"
ORG_UPDATED_NAME="IntTest Org Updated $ORG_SUFFIX"
ORG_DESC="Integration org $ORG_SUFFIX"
ORG_MEMBER_EMAIL="inttest-org-$ORG_SUFFIX@test.local"
ORG_CHANNEL_EMAIL="org-$ORG_SUFFIX@test.local"

ORG_PERSON_TEXT=$(run_capture "create_person(for_org)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":\"Org\",\"lastName\":\"Member\",\"email\":\"$ORG_MEMBER_EMAIL\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  ORG_PERSON_ID=$(echo "$ORG_PERSON_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => org person: $ORG_PERSON_ID"

  ORG_NAME_JSON=$(json_string "$ORG_NAME")
  ORG_UPDATED_NAME_JSON=$(json_string "$ORG_UPDATED_NAME")
  ORG_DESC_JSON=$(json_string "$ORG_DESC")
  ORG_MEMBER_EMAIL_JSON=$(json_string "$ORG_MEMBER_EMAIL")
  ORG_CHANNEL_EMAIL_JSON=$(json_string "$ORG_CHANNEL_EMAIL")

  run_expect_error "create_organization(rejects_missing_member)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_organization\",\"arguments\":{\"name\":\"IntTest Missing Member $ORG_SUFFIX\",\"members\":[\"missing-$ORG_SUFFIX@test.local\"]}},\"id\":2}"

  ORG_TEXT=$(run_capture "create_organization" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_organization\",\"arguments\":{\"name\":$ORG_NAME_JSON,\"members\":[$ORG_MEMBER_EMAIL_JSON]}},\"id\":2}")
  if [ $? -eq 0 ]; then
    ORG_ID=$(echo "$ORG_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => organization: $ORG_ID"

    run_test "get_organization($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_organization\",\"arguments\":{\"identifier\":\"$ORG_ID\"}},\"id\":2}"
    run_test "get_organization(by_name:$ORG_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_organization\",\"arguments\":{\"identifier\":$ORG_NAME_JSON}},\"id\":2}"
    run_test "list_organization_members($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_organization_members\",\"arguments\":{\"organizationId\":\"$ORG_ID\"}},\"id\":2}"
    run_test "list_person_organizations($ORG_PERSON_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_organizations\",\"arguments\":{\"personId\":\"$ORG_PERSON_ID\"}},\"id\":2}"
    run_test "update_organization($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_organization\",\"arguments\":{\"identifier\":\"$ORG_ID\",\"name\":$ORG_UPDATED_NAME_JSON,\"city\":\"TestCity\",\"description\":$ORG_DESC_JSON}},\"id\":2}"
    run_test "add_organization_channel($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_organization_channel\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"provider\":\"email\",\"value\":$ORG_CHANNEL_EMAIL_JSON}},\"id\":2}"
    run_test "remove_organization_member($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_organization_member\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"personIdentifier\":\"$ORG_PERSON_ID\"}},\"id\":2}"
    run_test "add_organization_member($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_organization_member\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"personIdentifier\":$ORG_MEMBER_EMAIL_JSON}},\"id\":2}"
    run_test "make_organization_customer($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"make_organization_customer\",\"arguments\":{\"identifier\":\"$ORG_ID\"}},\"id\":2}"
    run_test "delete_organization($ORG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_organization\",\"arguments\":{\"identifier\":\"$ORG_ID\"}},\"id\":2}"
  fi

  run_test "delete_person(org_member:$ORG_PERSON_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":\"$ORG_PERSON_ID\"}},\"id\":2}"
else
  skip_test "organization_mutations" "could not create cleanup-safe member person"
fi
echo ""

##############################
# 11. CALENDAR & TIME
##############################
echo "=== 11. Calendar & Time ==="
run_test "list_events" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_events","arguments":{"limit":3}},"id":2}'
run_test "list_work_slots" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_work_slots","arguments":{"limit":3}},"id":2}'
run_test "list_time_spend_reports" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_time_spend_reports\",\"arguments\":{\"project\":\"$PROJECT\",\"limit\":3}},\"id\":2}"
run_test "list_recurring_events" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_recurring_events","arguments":{"limit":3}},"id":2}'
CALENDARS_TEXT=$(run_capture "list_calendars" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_calendars","arguments":{}},"id":2}')
CALENDAR_ID=""
if [ $? -eq 0 ]; then
  CALENDAR_ID=$(echo "$CALENDARS_TEXT" | jq -r '((map(select(.isPrimary == true)) | .[0]) // .[0]).calendarId // empty' 2>/dev/null)
  if [ -n "$CALENDAR_ID" ]; then
    echo "  => calendar: $CALENDAR_ID"
  else
    skip_test "create_event(explicit_calendar)" "list_calendars returned no writable calendar"
  fi
fi

# Event CRUD
EVT_TEXT=$(run_capture "create_event" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_event","arguments":{"title":"IntTest Event","date":1777000000000,"dueDate":1777003600000}},"id":2}')
if [ $? -eq 0 ]; then
  EVT_ID=$(echo "$EVT_TEXT" | jq -r '.eventId' 2>/dev/null)
  echo "  => event: $EVT_ID"
  if [ -n "$EVT_ID" ] && [ "$EVT_ID" != "null" ]; then
    run_test "get_event($EVT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_event\",\"arguments\":{\"eventId\":\"$EVT_ID\"}},\"id\":2}"
    run_test "update_event($EVT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_event\",\"arguments\":{\"eventId\":\"$EVT_ID\",\"title\":\"Updated Event\"}},\"id\":2}"
    run_test "delete_event($EVT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_event\",\"arguments\":{\"eventId\":\"$EVT_ID\"}},\"id\":2}"
  else
    skip_test "get_event" "no eventId in response"
    skip_test "update_event" "no eventId in response"
    skip_test "delete_event" "no eventId in response"
  fi
fi

if [ -n "$CALENDAR_ID" ]; then
  EXPLICIT_EVT_PAYLOAD=$(jq -cn \
    --arg calendarId "$CALENDAR_ID" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_event","arguments":{"title":"IntTest Explicit Calendar Event","date":1777007200000,"dueDate":1777010800000,"calendarId":$calendarId}},"id":2}')
  EXPLICIT_EVT_TEXT=$(run_capture "create_event(explicit_calendar)" "$EXPLICIT_EVT_PAYLOAD")
  if [ $? -eq 0 ]; then
    EXPLICIT_EVT_ID=$(echo "$EXPLICIT_EVT_TEXT" | jq -r '.eventId' 2>/dev/null)
    echo "  => explicit calendar event: $EXPLICIT_EVT_ID"
    if [ -n "$EXPLICIT_EVT_ID" ] && [ "$EXPLICIT_EVT_ID" != "null" ]; then
      GET_EXPLICIT_EVT_TEXT=$(run_capture "get_event(explicit_calendar:$EXPLICIT_EVT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_event\",\"arguments\":{\"eventId\":\"$EXPLICIT_EVT_ID\"}},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_event explicit calendarId matches" "$GET_EXPLICIT_EVT_TEXT" ".calendarId" "$CALENDAR_ID"
      fi
      run_test "delete_event(explicit_calendar:$EXPLICIT_EVT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_event\",\"arguments\":{\"eventId\":\"$EXPLICIT_EVT_ID\"}},\"id\":2}"
    else
      skip_test "get_event(explicit_calendar)" "no eventId in response"
      skip_test "delete_event(explicit_calendar)" "no eventId in response"
    fi
  fi
fi

# Work slot — requires a todoId (planner task)
skip_test "create_work_slot" "requires todoId (planner task)"

# Timer — requires project + issue identifier
TIMER_ISSUE_TEXT=$(run_capture "create_issue(for_timer)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Timer Test\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  TIMER_ISSUE_ID=$(echo "$TIMER_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
  run_test "start_timer($TIMER_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"start_timer\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TIMER_ISSUE_ID\"}},\"id\":2}"
  run_test "stop_timer($TIMER_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"stop_timer\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TIMER_ISSUE_ID\"}},\"id\":2}"
  run_test "delete_issue(timer:$TIMER_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$TIMER_ISSUE_ID\"}},\"id\":2}"
fi

# Recurring event — no delete_recurring_event tool, so skip create to avoid leaking
skip_test "create_recurring_event" "no delete tool — would leak data"
skip_test "list_event_instances" "requires recurring event"
echo ""

##############################
# 12. NOTIFICATIONS
##############################
echo "=== 12. Notifications ==="
run_test "list_notifications" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notifications","arguments":{"limit":3}},"id":2}'
run_test "get_unread_notification_count" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_unread_notification_count","arguments":{}},"id":2}'
run_test "list_notification_contexts" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notification_contexts","arguments":{"limit":3}},"id":2}'
run_test "list_notification_settings" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notification_settings","arguments":{}},"id":2}'
# mark_notification_read, mark_all_notifications_read, archive_notification, archive_all_notifications
# pin_notification_context, get_notification, get_notification_context, delete_notification
# update_notification_provider_setting — all require existing notifications, skipped if none
NOTIF_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notifications","arguments":{"limit":1}},"id":2}')
NOTIF_ID=$(echo "$NOTIF_TEXT" | jq -r '.notifications[0].id // empty' 2>/dev/null)
if [ -n "$NOTIF_ID" ]; then
  run_test "get_notification($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_notification\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  run_test "mark_notification_read($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"mark_notification_read\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  skip_test "mark_all_notifications_read" "would clear all notifications"
  skip_test "archive_notification" "requires notification ID"
  skip_test "archive_all_notifications" "would archive all"
  skip_test "delete_notification" "requires notification ID"
  skip_test "get_notification_context" "requires context ID"
  skip_test "pin_notification_context" "requires context ID"
  skip_test "update_notification_provider_setting" "would modify settings"
else
  skip_test "get_notification" "no notifications"
  skip_test "mark_notification_read" "no notifications"
  skip_test "mark_all_notifications_read" "no notifications"
  skip_test "archive_notification" "no notifications"
  skip_test "archive_all_notifications" "no notifications"
  skip_test "delete_notification" "no notifications"
  skip_test "get_notification_context" "no notifications"
  skip_test "pin_notification_context" "no notifications"
  skip_test "update_notification_provider_setting" "no notifications"
fi
echo ""

##############################
# 13. SEARCH
##############################
echo "=== 13. Search ==="
run_test "fulltext_search" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"fulltext_search","arguments":{"query":"test","limit":3}},"id":2}'
echo ""

##############################
# 13b. GENERIC ASSOCIATIONS
##############################
echo "=== 13b. Generic Associations ==="
ASSOCIATIONS_TEXT=$(run_capture "list_associations" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_associations","arguments":{"limit":5}},"id":2}')
ASSOC_ID=$(echo "$ASSOCIATIONS_TEXT" | jq -r '.associations[0].associationId // empty' 2>/dev/null)
ASSOC_SOURCE_CLASS=$(echo "$ASSOCIATIONS_TEXT" | jq -r '.associations[0].sourceClass // empty' 2>/dev/null)
ASSOC_TARGET_CLASS=$(echo "$ASSOCIATIONS_TEXT" | jq -r '.associations[0].targetClass // empty' 2>/dev/null)
ASSOC_KNOWN_CLASS=$(echo "$ASSOCIATIONS_TEXT" | jq -r '
  first(.associations[]? | [.sourceClass, .targetClass][] | select(
    . == "tracker:class:Issue"
    or . == "tracker:class:Project"
    or . == "document:class:Document"
    or . == "document:class:Teamspace"
    or . == "core:class:Relation"
    or . == "core:class:Doc"
  )) // empty
' 2>/dev/null)
case "$ASSOC_KNOWN_CLASS" in
  "tracker:class:Issue") ASSOC_EXPECTED_LABEL="Issue" ;;
  "tracker:class:Project") ASSOC_EXPECTED_LABEL="Project" ;;
  "document:class:Document") ASSOC_EXPECTED_LABEL="Document" ;;
  "document:class:Teamspace") ASSOC_EXPECTED_LABEL="Teamspace" ;;
  "core:class:Relation") ASSOC_EXPECTED_LABEL="Relation" ;;
  "core:class:Doc") ASSOC_EXPECTED_LABEL="Huly document" ;;
  *) ASSOC_EXPECTED_LABEL="" ;;
esac

if [ -n "$ASSOC_ID" ]; then
  assert_json_field_nonempty "list_associations has id" "$ASSOCIATIONS_TEXT" ".associations[0].associationId"
  if [ -n "$ASSOC_KNOWN_CLASS" ] && [ -n "$ASSOC_EXPECTED_LABEL" ]; then
    assert_json_association_has_expected_class_label "list_associations labels $ASSOC_KNOWN_CLASS" \
      "$ASSOCIATIONS_TEXT" "$ASSOC_KNOWN_CLASS" "$ASSOC_EXPECTED_LABEL"
  else
    skip_test "list_associations class labels" "workspace returned no associations for known SDK classes"
  fi
  run_test "list_associations(filter:$ASSOC_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_associations\",\"arguments\":{\"association\":\"$ASSOC_ID\"}},\"id\":2}"
  if [ -n "$ASSOC_SOURCE_CLASS" ] && [ -n "$ASSOC_TARGET_CLASS" ]; then
    run_test "list_associations(class filters)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_associations\",\"arguments\":{\"sourceClass\":\"$ASSOC_SOURCE_CLASS\",\"targetClass\":\"$ASSOC_TARGET_CLASS\",\"limit\":5}},\"id\":2}"
  fi
  run_test "list_relations($ASSOC_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":\"$ASSOC_ID\",\"limit\":3}},\"id\":2}"
else
  skip_test "list_associations has id" "no visible associations found in workspace"
  skip_test "list_associations(filter)" "no visible associations found in workspace"
  skip_test "list_relations" "no visible associations found in workspace"
fi

WRITABLE_ASSOCIATIONS_TEXT=$(run_capture "list_associations(writableOnly)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_associations","arguments":{"writableOnly":true,"limit":1}},"id":2}')
WRITABLE_ASSOC_ID=$(echo "$WRITABLE_ASSOCIATIONS_TEXT" | jq -r '.associations[0].associationId // empty' 2>/dev/null)
if [ -n "$WRITABLE_ASSOC_ID" ]; then
  assert_json_field_nonempty "list_associations(writableOnly) has writable id" "$WRITABLE_ASSOCIATIONS_TEXT" ".associations[0].associationId"
else
  skip_test "list_associations(writableOnly) has writable id" "workspace returned no writable associations"
fi

GENERIC_ROLE_SOURCE="mcp source $RUN_ID"
GENERIC_ROLE_TARGET="mcp target $RUN_ID"
GENERIC_ROLE_SOURCE_JSON=$(json_string "$GENERIC_ROLE_SOURCE")
GENERIC_ROLE_TARGET_JSON=$(json_string "$GENERIC_ROLE_TARGET")
CREATED_ASSOC_TEXT=$(run_capture "create_association(generic_issue_one_to_many)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":\"tracker:class:Issue\",\"targetClass\":\"tracker:class:Issue\",\"sourceRole\":$GENERIC_ROLE_SOURCE_JSON,\"targetRole\":$GENERIC_ROLE_TARGET_JSON,\"cardinality\":\"one-to-many\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  CREATED_ASSOC_ID=$(echo "$CREATED_ASSOC_TEXT" | jq -r '.association.associationId // empty' 2>/dev/null)
  if [ -n "$CREATED_ASSOC_ID" ]; then
    GENERIC_ASSOCIATION_CLEANUP_IDS="$GENERIC_ASSOCIATION_CLEANUP_IDS $CREATED_ASSOC_ID"
  fi
  assert_json_field_equals "create_association created" "$CREATED_ASSOC_TEXT" ".created" "true"
  DUP_ASSOC_TEXT=$(run_capture "create_association(idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":\"tracker:class:Issue\",\"targetClass\":\"tracker:class:Issue\",\"sourceRole\":$GENERIC_ROLE_SOURCE_JSON,\"targetRole\":$GENERIC_ROLE_TARGET_JSON,\"cardinality\":\"one-to-many\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    assert_json_field_equals "create_association idempotent existing" "$DUP_ASSOC_TEXT" ".existing" "true"
  fi
else
  CREATED_ASSOC_ID=""
  skip_test "create_association idempotent existing" "create_association failed"
fi

GENERIC_SOURCE_TEXT=$(run_capture "create_issue(for_generic_associations)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Associations Source $RUN_ID\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  GENERIC_SOURCE_ID=$(echo "$GENERIC_SOURCE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
  GENERIC_SOURCE_OBJ_ID=$(echo "$GENERIC_SOURCE_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  GENERIC_SOURCE_OBJ_ID_JSON=$(json_string "$GENERIC_SOURCE_OBJ_ID")
  if [ -n "$GENERIC_SOURCE_OBJ_ID" ]; then
    OMITTED_RELATIONS_TEXT=$(run_capture "list_relations(source raw issue)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"limit\":3}},\"id\":2}")
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "list_relations(source raw issue) has total" "$OMITTED_RELATIONS_TEXT" ".total"
    fi

    EITHER_RELATIONS_TEXT=$(run_capture "list_relations(source raw issue,either)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"direction\":\"either\",\"limit\":3}},\"id\":2}")
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "list_relations(source raw issue,either) has total" "$EITHER_RELATIONS_TEXT" ".total"
    fi
  else
    skip_test "list_relations(source raw issue)" "generic association source issue did not return issueId"
    skip_test "list_relations(source raw issue,either)" "generic association source issue did not return issueId"
  fi
  GENERIC_TARGET_TEXT=$(run_capture "create_issue(for_generic_associations_target)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Associations Target $RUN_ID\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    GENERIC_TARGET_ID=$(echo "$GENERIC_TARGET_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
    GENERIC_TARGET_OBJ_ID=$(echo "$GENERIC_TARGET_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  else
    GENERIC_TARGET_ID=""
    GENERIC_TARGET_OBJ_ID=""
  fi
  GENERIC_SOURCE2_TEXT=$(run_capture "create_issue(for_generic_associations_cardinality)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Associations Cardinality $RUN_ID\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    GENERIC_SOURCE2_ID=$(echo "$GENERIC_SOURCE2_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
    GENERIC_SOURCE2_OBJ_ID=$(echo "$GENERIC_SOURCE2_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  else
    GENERIC_SOURCE2_ID=""
    GENERIC_SOURCE2_OBJ_ID=""
  fi
  if [ -n "$CREATED_ASSOC_ID" ] && [ -n "$GENERIC_SOURCE_OBJ_ID" ] && [ -n "$GENERIC_TARGET_OBJ_ID" ] && [ -n "$GENERIC_SOURCE2_OBJ_ID" ]; then
    GENERIC_SOURCE_OBJ_ID_JSON=$(json_string "$GENERIC_SOURCE_OBJ_ID")
    GENERIC_TARGET_OBJ_ID_JSON=$(json_string "$GENERIC_TARGET_OBJ_ID")
    GENERIC_SOURCE2_OBJ_ID_JSON=$(json_string "$GENERIC_SOURCE2_OBJ_ID")
    CREATE_RELATION_ARGS="{\"association\":\"$CREATED_ASSOC_ID\",\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"target\":{\"kind\":\"raw\",\"id\":$GENERIC_TARGET_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"}}"
    CREATED_RELATION_TEXT=$(run_capture "create_relation(generic)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}")
    if [ $? -eq 0 ]; then
      CREATED_RELATION_ID=$(echo "$CREATED_RELATION_TEXT" | jq -r '.relationId // empty' 2>/dev/null)
      assert_json_field_equals "create_relation created" "$CREATED_RELATION_TEXT" ".created" "true"
      EXISTING_RELATION_TEXT=$(run_capture "create_relation(idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "create_relation idempotent existing" "$EXISTING_RELATION_TEXT" ".existing" "true"
      fi
      LIST_CREATED_RELATION_TEXT=$(run_capture "list_relations(generic created)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\",\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"target\":{\"kind\":\"raw\",\"id\":$GENERIC_TARGET_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"limit\":3}},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "list_relations(generic created) total" "$LIST_CREATED_RELATION_TEXT" ".total" "1"
      fi
      run_expect_error "delete_association(in use)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\"}},\"id\":2}"
      run_expect_error "create_relation(cardinality violation)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\",\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE2_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"target\":{\"kind\":\"raw\",\"id\":$GENERIC_TARGET_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"}}},\"id\":2}"
      DELETE_TRIPLE_TEXT=$(run_capture "delete_relation(generic triple)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_relation triple deleted" "$DELETE_TRIPLE_TEXT" ".deleted" "true"
      fi
      DELETE_TRIPLE_AGAIN_TEXT=$(run_capture "delete_relation(generic triple idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_relation triple idempotent" "$DELETE_TRIPLE_AGAIN_TEXT" ".deleted" "false"
      fi
      CREATED_RELATION_BY_ID_TEXT=$(run_capture "create_relation(generic for id delete)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}")
      if [ $? -eq 0 ]; then
        RELATION_DELETE_ID=$(echo "$CREATED_RELATION_BY_ID_TEXT" | jq -r '.relationId // empty' 2>/dev/null)
        if [ -n "$RELATION_DELETE_ID" ]; then
          DELETE_BY_ID_TEXT=$(run_capture "delete_relation(generic id)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":{\"relation\":\"$RELATION_DELETE_ID\"}},\"id\":2}")
          if [ $? -eq 0 ]; then
            assert_json_field_equals "delete_relation id deleted" "$DELETE_BY_ID_TEXT" ".deleted" "true"
          fi
          DELETE_BY_ID_AGAIN_TEXT=$(run_capture "delete_relation(generic id idempotent)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":{\"relation\":\"$RELATION_DELETE_ID\"}},\"id\":2}")
          if [ $? -eq 0 ]; then
            assert_json_field_equals "delete_relation id idempotent" "$DELETE_BY_ID_AGAIN_TEXT" ".deleted" "false"
          fi
        fi
      fi
      DELETE_ASSOC_TEXT=$(run_capture "delete_association(unused)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\"}},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_association unused deleted" "$DELETE_ASSOC_TEXT" ".deleted" "true"
        assert_json_field_equals "delete_association unused relation count" "$DELETE_ASSOC_TEXT" ".relationCount" "0"
      fi
      DELETE_ASSOC_AGAIN_TEXT=$(run_capture "delete_association(idempotent missing)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\"}},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_association idempotent missing" "$DELETE_ASSOC_AGAIN_TEXT" ".deleted" "false"
      fi
    fi
  else
    skip_test "create_relation(generic)" "missing disposable association or issue endpoints"
    skip_test "create_relation(idempotent)" "missing disposable association or issue endpoints"
    skip_test "list_relations(generic created)" "missing disposable association or issue endpoints"
    skip_test "delete_association(in use)" "missing disposable association or issue endpoints"
    skip_test "create_relation(cardinality violation)" "missing disposable association or issue endpoints"
    skip_test "delete_relation(generic triple)" "missing disposable association or issue endpoints"
    skip_test "delete_relation(generic triple idempotent)" "missing disposable association or issue endpoints"
    skip_test "delete_relation(generic id)" "missing disposable association or issue endpoints"
    skip_test "delete_relation(generic id idempotent)" "missing disposable association or issue endpoints"
    skip_test "delete_association(unused)" "missing disposable association or issue endpoints"
    skip_test "delete_association(idempotent missing)" "missing disposable association or issue endpoints"
  fi
  if [ -n "$GENERIC_TARGET_ID" ]; then
    run_test "delete_issue(generic_assoc_target:$GENERIC_TARGET_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$GENERIC_TARGET_ID\"}},\"id\":2}"
  fi
  if [ -n "$GENERIC_SOURCE2_ID" ]; then
    run_test "delete_issue(generic_assoc_cardinality:$GENERIC_SOURCE2_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$GENERIC_SOURCE2_ID\"}},\"id\":2}"
  fi
  if [ -n "$GENERIC_SOURCE_ID" ]; then
    run_test "delete_issue(generic_assoc:$GENERIC_SOURCE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$GENERIC_SOURCE_ID\"}},\"id\":2}"
  fi
else
  skip_test "list_relations(source raw issue)" "could not create disposable source issue"
  skip_test "list_relations(source raw issue,either)" "could not create disposable source issue"
  skip_test "create_relation(generic)" "could not create disposable source issue"
  skip_test "create_relation(idempotent)" "could not create disposable source issue"
  skip_test "list_relations(generic created)" "could not create disposable source issue"
  skip_test "delete_association(in use)" "could not create disposable source issue"
  skip_test "create_relation(cardinality violation)" "could not create disposable source issue"
  skip_test "delete_relation(generic triple)" "could not create disposable source issue"
  skip_test "delete_relation(generic triple idempotent)" "could not create disposable source issue"
  skip_test "delete_relation(generic id)" "could not create disposable source issue"
  skip_test "delete_relation(generic id idempotent)" "could not create disposable source issue"
  skip_test "delete_association(unused)" "could not create disposable source issue"
  skip_test "delete_association(idempotent missing)" "could not create disposable source issue"
fi

CARD_LOCATOR_MASTER_TEXT=$(run_capture "card locator list_master_tags(Default)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_master_tags","arguments":{"cardSpace":"Default"}},"id":2}')
CARD_LOCATOR_MASTER_ID=$(echo "$CARD_LOCATOR_MASTER_TEXT" | jq -r '.masterTags[0].id // empty' 2>/dev/null)
if [ -n "$CARD_LOCATOR_MASTER_ID" ]; then
  CARD_LOCATOR_TITLE="IntTest Generic Association Card $RUN_ID"
  CARD_LOCATOR_TITLE_JSON=$(json_string "$CARD_LOCATOR_TITLE")
  CARD_LOCATOR_MASTER_ID_JSON=$(json_string "$CARD_LOCATOR_MASTER_ID")
  CARD_LOCATOR_CARD_TEXT=$(run_capture "create_card(for_generic_card_locator)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_card\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$CARD_LOCATOR_MASTER_ID_JSON,\"title\":$CARD_LOCATOR_TITLE_JSON,\"content\":\"Temporary card for generic association locator integration.\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    CARD_LOCATOR_CARD_ID=$(echo "$CARD_LOCATOR_CARD_TEXT" | jq -r '.id // empty' 2>/dev/null)
  else
    CARD_LOCATOR_CARD_ID=""
  fi

  CARD_LOCATOR_ISSUE_TEXT=$(run_capture "create_issue(for_generic_card_locator)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Card Locator Target $RUN_ID\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    CARD_LOCATOR_ISSUE_ID=$(echo "$CARD_LOCATOR_ISSUE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
    CARD_LOCATOR_ISSUE_OBJ_ID=$(echo "$CARD_LOCATOR_ISSUE_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  else
    CARD_LOCATOR_ISSUE_ID=""
    CARD_LOCATOR_ISSUE_OBJ_ID=""
  fi

  CARD_LOCATOR_SOURCE_ROLE="mcp card source $RUN_ID"
  CARD_LOCATOR_TARGET_ROLE="mcp issue target $RUN_ID"
  CARD_LOCATOR_SOURCE_ROLE_JSON=$(json_string "$CARD_LOCATOR_SOURCE_ROLE")
  CARD_LOCATOR_TARGET_ROLE_JSON=$(json_string "$CARD_LOCATOR_TARGET_ROLE")
  CARD_LOCATOR_ASSOC_TEXT=$(run_capture "create_association(generic_card_to_issue)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":$CARD_LOCATOR_MASTER_ID_JSON,\"targetClass\":\"tracker:class:Issue\",\"sourceRole\":$CARD_LOCATOR_SOURCE_ROLE_JSON,\"targetRole\":$CARD_LOCATOR_TARGET_ROLE_JSON,\"cardinality\":\"many-to-many\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    CARD_LOCATOR_ASSOC_ID=$(echo "$CARD_LOCATOR_ASSOC_TEXT" | jq -r '.association.associationId // empty' 2>/dev/null)
    if [ -n "$CARD_LOCATOR_ASSOC_ID" ]; then
      GENERIC_ASSOCIATION_CLEANUP_IDS="$GENERIC_ASSOCIATION_CLEANUP_IDS $CARD_LOCATOR_ASSOC_ID"
    fi
  else
    CARD_LOCATOR_ASSOC_ID=""
  fi

  if [ -n "$CARD_LOCATOR_ASSOC_ID" ] && [ -n "$CARD_LOCATOR_CARD_ID" ] && [ -n "$CARD_LOCATOR_ISSUE_OBJ_ID" ]; then
    CARD_LOCATOR_CARD_ID_JSON=$(json_string "$CARD_LOCATOR_CARD_ID")
    CARD_LOCATOR_ISSUE_OBJ_ID_JSON=$(json_string "$CARD_LOCATOR_ISSUE_OBJ_ID")
    CARD_RELATION_ARGS_BY_ID="{\"association\":\"$CARD_LOCATOR_ASSOC_ID\",\"source\":{\"kind\":\"card\",\"card\":$CARD_LOCATOR_CARD_ID_JSON},\"target\":{\"kind\":\"raw\",\"id\":$CARD_LOCATOR_ISSUE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"}}"
    CARD_RELATION_ARGS_BY_TITLE="{\"association\":\"$CARD_LOCATOR_ASSOC_ID\",\"source\":{\"kind\":\"card\",\"card\":$CARD_LOCATOR_TITLE_JSON,\"cardSpace\":\"Default\"},\"target\":{\"kind\":\"raw\",\"id\":$CARD_LOCATOR_ISSUE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"}}"
    CARD_RELATION_TEXT=$(run_capture "create_relation(card locator by id)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CARD_RELATION_ARGS_BY_ID},\"id\":2}")
    if [ $? -eq 0 ]; then
      assert_json_field_equals "create_relation card locator by id created" "$CARD_RELATION_TEXT" ".created" "true"
      CARD_RELATION_TITLE_TEXT=$(run_capture "create_relation(card locator by title)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CARD_RELATION_ARGS_BY_TITLE},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "create_relation card locator by title existing" "$CARD_RELATION_TITLE_TEXT" ".existing" "true"
      fi
      CARD_LIST_RELATIONS_TEXT=$(run_capture "list_relations(card locator by title)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":\"$CARD_LOCATOR_ASSOC_ID\",\"source\":{\"kind\":\"card\",\"card\":$CARD_LOCATOR_TITLE_JSON,\"cardSpace\":\"Default\"},\"target\":{\"kind\":\"raw\",\"id\":$CARD_LOCATOR_ISSUE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"limit\":3}},\"id\":2}")
      if [ $? -eq 0 ]; then
        assert_json_field_equals "list_relations card locator by title total" "$CARD_LIST_RELATIONS_TEXT" ".total" "1"
      fi
      run_test "delete_relation(card locator by title)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":$CARD_RELATION_ARGS_BY_TITLE},\"id\":2}"
    fi
    run_test "delete_association(generic_card_to_issue)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CARD_LOCATOR_ASSOC_ID\"}},\"id\":2}"
  else
    fail_test "generic association card locator setup" "missing disposable card, issue, or association"
    if [ -n "$CARD_LOCATOR_ASSOC_ID" ]; then
      run_test "delete_association(generic_card_to_issue)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CARD_LOCATOR_ASSOC_ID\"}},\"id\":2}"
    fi
  fi

  if [ -n "$CARD_LOCATOR_ISSUE_ID" ]; then
    run_test "delete_issue(generic_card_locator:$CARD_LOCATOR_ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$CARD_LOCATOR_ISSUE_ID\"}},\"id\":2}"
  fi
  if [ -n "$CARD_LOCATOR_CARD_ID" ]; then
    run_test "delete_card(generic_card_locator:$CARD_LOCATOR_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":\"$CARD_LOCATOR_CARD_ID\"}},\"id\":2}"
  fi
else
  fail_test "generic association card locator setup" "Default card space returned no master tags"
fi
echo ""

##############################
# 14. CARDS
##############################
echo "=== 14. Cards ==="
run_test "list_card_spaces" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_card_spaces","arguments":{}},"id":2}'
run_test "list_master_tags(Default)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_master_tags","arguments":{"cardSpace":"Default"}},"id":2}'
run_test "list_cards(Default)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_cards","arguments":{"cardSpace":"Default","limit":3}},"id":2}'
# Card CRUD requires a master tag; skip
skip_test "create_card" "requires master tag"
skip_test "get_card" "requires card"
skip_test "update_card" "requires card"
skip_test "delete_card" "requires card"
echo ""

##############################
# 15. ACTIVITY & COMMENTS
##############################
echo "=== 15. Activity ==="
run_test "list_mentions" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_mentions","arguments":{"limit":3}},"id":2}'
run_test "list_saved_messages" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_saved_messages","arguments":{"limit":3}},"id":2}'
echo ""

##############################
# 16. WORKSPACE
##############################
echo "=== 16. Workspace ==="
run_test "get_workspace_info" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_workspace_info","arguments":{}},"id":2}'
run_test "list_workspace_members" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_workspace_members","arguments":{}},"id":2}'
ACCESS_LINK_NOT_BEFORE="$(date +%s)"
ACCESS_LINK_EXPIRATION="$((ACCESS_LINK_NOT_BEFORE + 300))"
run_test "create_access_link(anonymous_guest)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_access_link\",\"arguments\":{\"role\":\"GUEST\",\"personalized\":false,\"notBefore\":${ACCESS_LINK_NOT_BEFORE},\"expiration\":${ACCESS_LINK_EXPIRATION}}},\"id\":2}"
# list_workspaces, create_workspace, delete_workspace, get_regions, update_member_role, update_guest_settings
# — workspace management tools are dangerous for integration tests, skip
skip_test "list_workspaces" "workspace management"
skip_test "create_workspace" "workspace management"
skip_test "delete_workspace" "workspace management"
skip_test "get_regions" "workspace management"
skip_test "update_member_role" "workspace management"
skip_test "update_guest_settings" "workspace management"
skip_test "update_user_profile" "would modify test user"
echo ""

##############################
# 17. ATTACHMENTS
##############################
echo "=== 17. Attachments ==="
# Create a temp issue for attachment tests
ATT_ISSUE_TEXT=$(run_capture "create_issue(for_attachment)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Attachment Test\"}},\"id\":2}")
if [ $? -eq 0 ]; then
  ATT_ISSUE_ID=$(echo "$ATT_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
  ATT_ISSUE_OBJ=$(echo "$ATT_ISSUE_TEXT" | jq -r '.issueId' 2>/dev/null)

  # upload_file — skipped standalone (no blob delete tool); covered via add_issue_attachment
  skip_test "upload_file(standalone)" "no blob delete tool — would leak data"

  echo "test attachment content" > "$TEST_TMPDIR/inttest_attach.txt"

  # add_issue_attachment (also exercises upload internally)
  ATT_TEXT=$(run_capture "add_issue_attachment($ATT_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_issue_attachment\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ATT_ISSUE_ID\",\"filePath\":\"$TEST_TMPDIR/inttest_attach.txt\",\"filename\":\"test.txt\",\"contentType\":\"text/plain\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    ATT_ID=$(echo "$ATT_TEXT" | jq -r '.attachmentId' 2>/dev/null)
    echo "  => attachment: $ATT_ID"
    run_test "list_attachments($ATT_ISSUE_OBJ)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_attachments\",\"arguments\":{\"objectId\":\"$ATT_ISSUE_OBJ\",\"objectClass\":\"tracker:class:Issue\"}},\"id\":2}"
    run_test "get_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\"}},\"id\":2}"
    run_test "pin_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\",\"pinned\":true}},\"id\":2}"
    run_test "update_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\",\"description\":\"updated\"}},\"id\":2}"
    run_test "download_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"download_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\",\"outputPath\":\"$TEST_TMPDIR/inttest_download.txt\"}},\"id\":2}"
    run_test "delete_attachment($ATT_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_attachment\",\"arguments\":{\"attachmentId\":\"$ATT_ID\"}},\"id\":2}"
  fi

  skip_test "add_attachment" "generic — covered by add_issue_attachment"
  skip_test "add_document_attachment" "requires doc + file"

  run_test "delete_issue(attachment:$ATT_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ATT_ISSUE_ID\"}},\"id\":2}"
  rm -f "$TEST_TMPDIR/inttest_attach.txt" "$TEST_TMPDIR/inttest_download.txt"
fi
echo ""

##############################
# 18. TEST MANAGEMENT
##############################
echo "=== 18. Test Management ==="
run_test "list_test_projects" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_test_projects","arguments":{}},"id":2}'

TM_PROJ=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_test_projects","arguments":{}},"id":2}')
TM_PROJ_ID=$(echo "$TM_PROJ" | jq -r '.projects[0].identifier // empty' 2>/dev/null)

if [ -n "$TM_PROJ_ID" ]; then
  echo "  Using TM project: $TM_PROJ_ID"

  # Test Suite
  TS_TEXT=$(run_capture "create_test_suite" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_suite\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Suite\"}},\"id\":2}")
  if [ $? -eq 0 ]; then
    TSID=$(echo "$TS_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => suite: $TSID"
    run_test "list_test_suites" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_suites\",\"arguments\":{\"project\":\"$TM_PROJ_ID\"}},\"id\":2}"
    run_test "get_test_suite($TSID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_suite\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testSuite\":\"$TSID\"}},\"id\":2}"
    run_test "update_test_suite($TSID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_suite\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testSuite\":\"$TSID\",\"name\":\"Updated Suite\"}},\"id\":2}"

    # Test Case
    TC_TEXT=$(run_capture "create_test_case" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_case\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Case\",\"testSuite\":\"$TSID\"}},\"id\":2}")
    if [ $? -eq 0 ]; then
      TCID=$(echo "$TC_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => case: $TCID"
      run_test "list_test_cases" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_cases\",\"arguments\":{\"project\":\"$TM_PROJ_ID\"}},\"id\":2}"
      run_test "get_test_case($TCID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_case\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testCase\":\"$TCID\"}},\"id\":2}"
      run_test "update_test_case($TCID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_case\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testCase\":\"$TCID\",\"name\":\"Updated Case\"}},\"id\":2}"

      # Test Plan
      TP_TEXT=$(run_capture "create_test_plan" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Plan\"}},\"id\":2}")
      if [ $? -eq 0 ]; then
        TPID=$(echo "$TP_TEXT" | jq -r '.id' 2>/dev/null)
        echo "  => plan: $TPID"
        run_test "list_test_plans" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_plans\",\"arguments\":{\"project\":\"$TM_PROJ_ID\"}},\"id\":2}"
        run_test "get_test_plan($TPID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\"}},\"id\":2}"
        run_test "update_test_plan($TPID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\",\"name\":\"Updated Plan\"}},\"id\":2}"

        # add_test_plan_item
        run_test "add_test_plan_item($TPID,$TCID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_test_plan_item\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\",\"testCase\":\"$TCID\"}},\"id\":2}"
        run_test "remove_test_plan_item($TPID,$TCID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_test_plan_item\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\",\"testCase\":\"$TCID\"}},\"id\":2}"

        # Test Run
        TR_TEXT=$(run_capture "create_test_run" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Run\",\"testPlan\":\"$TPID\"}},\"id\":2}")
        if [ $? -eq 0 ]; then
          TRID=$(echo "$TR_TEXT" | jq -r '.id' 2>/dev/null)
          echo "  => run: $TRID"
          run_test "list_test_runs" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_runs\",\"arguments\":{\"project\":\"$TM_PROJ_ID\"}},\"id\":2}"
          run_test "get_test_run($TRID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\"}},\"id\":2}"
          run_test "update_test_run($TRID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\",\"name\":\"Updated Run\"}},\"id\":2}"

          # Test Result
          RESULT_TEXT=$(run_capture "create_test_result" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_result\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\",\"testCase\":\"$TCID\",\"status\":\"passed\"}},\"id\":2}")
          if [ $? -eq 0 ]; then
            RESID=$(echo "$RESULT_TEXT" | jq -r '.id' 2>/dev/null)
            echo "  => result: $RESID"
            run_test "list_test_results" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_test_results\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\"}},\"id\":2}"
            run_test "get_test_result($RESID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_test_result\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testResult\":\"$RESID\"}},\"id\":2}"
            run_test "update_test_result($RESID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_test_result\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testResult\":\"$RESID\",\"status\":\"failed\"}},\"id\":2}"
            run_test "delete_test_result($RESID)" \
              "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_result\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testResult\":\"$RESID\"}},\"id\":2}"
          fi

          # run_test_plan — creates a new test run; capture and clean up
          RTP_TEXT=$(run_capture "run_test_plan($TPID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"run_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\"}},\"id\":2}")
          if [ $? -eq 0 ]; then
            RTP_RUN_ID=$(echo "$RTP_TEXT" | jq -r '.runId // empty' 2>/dev/null)
            if [ -n "$RTP_RUN_ID" ]; then
              echo "  => run_test_plan run: $RTP_RUN_ID"
              run_test "delete_test_run(from_plan:$RTP_RUN_ID)" \
                "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$RTP_RUN_ID\"}},\"id\":2}"
            fi
          fi

          run_test "delete_test_run($TRID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\"}},\"id\":2}"
        fi

        run_test "delete_test_plan($TPID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\"}},\"id\":2}"
      fi

      run_test "delete_test_case($TCID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_case\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testCase\":\"$TCID\"}},\"id\":2}"
    fi

    run_test "delete_test_suite($TSID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_test_suite\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testSuite\":\"$TSID\"}},\"id\":2}"
  fi
else
  skip_test "test_management" "no TM project found — create one in Huly UI"
fi
echo ""

##############################
# 19. PROCESSES
##############################
echo "=== 19. Processes ==="
run_test "list_processes" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_processes","arguments":{}},"id":2}'

run_test "list_process_executions" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_process_executions","arguments":{"limit":5}},"id":2}'

PROCESSES_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_processes","arguments":{}},"id":2}')
PROCESS_ID=$(echo "$PROCESSES_TEXT" | jq -r '.processes[0].id // empty' 2>/dev/null)
PROCESS_DETAIL_TEXT=""

if [ -n "$PROCESS_ID" ]; then
  echo "  Using process: $PROCESS_ID"
  run_test "get_process($PROCESS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_process\",\"arguments\":{\"process\":\"$PROCESS_ID\"}},\"id\":2}"
  PROCESS_DETAIL_TEXT=$(run_capture_only \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_process\",\"arguments\":{\"process\":\"$PROCESS_ID\"}},\"id\":2}")
  run_test "list_process_executions(process:$PROCESS_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_process_executions\",\"arguments\":{\"process\":\"$PROCESS_ID\",\"limit\":5}},\"id\":2}"
else
  skip_test "get_process" "no process definitions found in workspace"
  skip_test "list_process_executions(process)" "no process definitions found in workspace"
fi

PROCESS_INITIAL_STATE=$(echo "$PROCESS_DETAIL_TEXT" | jq -r '.initialStateId // empty' 2>/dev/null)
PROCESS_TYPE=$(echo "$PROCESS_DETAIL_TEXT" | jq -r '.masterTagName // .masterTagId // empty' 2>/dev/null)
PROCESS_PARALLEL_FORBIDDEN=$(echo "$PROCESS_DETAIL_TEXT" | jq -r '.parallelExecutionForbidden // false' 2>/dev/null)
SAFE_CARD_ID=""

if [ -n "$PROCESS_ID" ] && [ -n "$PROCESS_INITIAL_STATE" ] && [ -n "$PROCESS_TYPE" ]; then
  CARD_SPACES_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_card_spaces","arguments":{"limit":20}},"id":2}')
  CARD_SPACE_COUNT=$(echo "$CARD_SPACES_TEXT" | jq -r '.cardSpaces | length' 2>/dev/null)
  i=0
  while [ "$i" -lt "${CARD_SPACE_COUNT:-0}" ] && [ -z "$SAFE_CARD_ID" ]; do
    CARD_SPACE_NAME=$(echo "$CARD_SPACES_TEXT" | jq -r ".cardSpaces[$i].name // empty" 2>/dev/null)
    if [ -n "$CARD_SPACE_NAME" ]; then
      CARD_SPACE_JSON=$(json_string "$CARD_SPACE_NAME")
      PROCESS_TYPE_JSON=$(json_string "$PROCESS_TYPE")
      CARDS_TEXT=$(run_capture_only \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":$CARD_SPACE_JSON,\"type\":$PROCESS_TYPE_JSON,\"limit\":1}},\"id\":2}")
      SAFE_CARD_ID=$(echo "$CARDS_TEXT" | jq -r '.cards[0].id // empty' 2>/dev/null)
    fi
    i=$((i + 1))
  done
fi

if [ -n "$PROCESS_ID" ] && [ -n "$PROCESS_INITIAL_STATE" ] && [ -n "$SAFE_CARD_ID" ]; then
  if [ "$PROCESS_PARALLEL_FORBIDDEN" = "true" ]; then
    EXISTING_ACTIVE=$(run_capture_only \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_process_executions\",\"arguments\":{\"process\":\"$PROCESS_ID\",\"card\":\"$SAFE_CARD_ID\",\"status\":\"active\",\"limit\":1}},\"id\":2}" | jq -r '.executions[0].id // empty' 2>/dev/null)
  else
    EXISTING_ACTIVE=""
  fi

  if [ -n "$EXISTING_ACTIVE" ]; then
    skip_test "start_process/cancel_execution" "safe card already has an active execution and process forbids parallel executions"
  else
    START_TEXT=$(run_capture "start_process($PROCESS_ID,$SAFE_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"start_process\",\"arguments\":{\"process\":\"$PROCESS_ID\",\"card\":\"$SAFE_CARD_ID\"}},\"id\":2}")
    STARTED_EXECUTION_ID=$(echo "$START_TEXT" | jq -r '.executionId // empty' 2>/dev/null)
    if [ -n "$STARTED_EXECUTION_ID" ]; then
      run_test "cancel_execution($STARTED_EXECUTION_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"cancel_execution\",\"arguments\":{\"execution\":\"$STARTED_EXECUTION_ID\"}},\"id\":2}"
    else
      skip_test "cancel_execution(started)" "start_process did not return an execution ID"
    fi
  fi
else
  skip_test "start_process/cancel_execution" "requires a process with an initial state and a matching safe card fixture"
fi
echo ""

##############################
# 20. USER STATUSES
##############################
echo "=== 20. User Statuses ==="
run_capture_to_var USER_STATUSES_TEXT "list_user_statuses" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_user_statuses","arguments":{"limit":5}},"id":2}'

USER_STATUS_USER=$(echo "$USER_STATUSES_TEXT" | jq -r '.statuses[0].user // empty' 2>/dev/null)
USER_STATUS_ONLINE=$(echo "$USER_STATUSES_TEXT" | jq -r 'if (.statuses[0] | has("online")) then (.statuses[0].online | tostring) else "" end' 2>/dev/null)

if [ -n "$USER_STATUS_USER" ]; then
  run_test "list_user_statuses(user:$USER_STATUS_USER)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_user_statuses\",\"arguments\":{\"user\":\"$USER_STATUS_USER\",\"limit\":5}},\"id\":2}"
elif [ -n "$USER_STATUS_ONLINE" ]; then
  run_test "list_user_statuses(online:$USER_STATUS_ONLINE)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_user_statuses\",\"arguments\":{\"online\":$USER_STATUS_ONLINE,\"limit\":5}},\"id\":2}"
else
  skip_test "list_user_statuses(filtered)" "no user status rows found in workspace"
fi
echo ""

if ! cleanup_workflow_artifacts; then
  echo "FAIL: task-management workflow artifact cleanup failed"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - task-management workflow artifact cleanup failed"
fi

##############################
# SUMMARY
##############################
TOTAL=$((PASSED + FAILED + SKIPPED))
echo "========================================="
echo "  RESULTS: $PASSED passed, $FAILED failed, $SKIPPED skipped (of $TOTAL)"
echo "========================================="
if [ $FAILED -gt 0 ]; then
  echo ""
  echo "Failures:"
  printf '%b\n' "$ERRORS"
  exit 1
fi
