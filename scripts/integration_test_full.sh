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
INTEGRATION_MCP_PROTOCOL="${INTEGRATION_MCP_PROTOCOL:-legacy}"
INTEGRATION_HTTP_CONFIG="${INTEGRATION_HTTP_CONFIG:-env}"
INTEGRATION_HTTP_HOST="${INTEGRATION_HTTP_HOST:-127.0.0.1}"
INTEGRATION_HTTP_PORT="${INTEGRATION_HTTP_PORT:-19888}"
HTTP_ENDPOINT="http://${INTEGRATION_HTTP_HOST}:${INTEGRATION_HTTP_PORT}/mcp"
HTTP_SERVER_PID=""
HTTP_SERVER_STDOUT=""
HTTP_SERVER_STDERR=""
HTTP_CURL_CONFIG=""
GENERIC_ASSOCIATION_CLEANUP_IDS=""
DRIVE_CLEANUP_ITEMS=""
DRIVE_CLEANUP_DRIVES=""
INVENTORY_CLEANUP_CATEGORY_ID=""
INVENTORY_CLEANUP_CHILD_CATEGORY_ID=""
INVENTORY_CLEANUP_PRODUCT_ID=""
INVENTORY_CLEANUP_VARIANT_ID=""
INVENTORY_CLEANUP_ATTACHMENT_ID=""
INVENTORY_CLEANUP_PHOTO_ID=""
INVENTORY_CLEANUP_COMMENT_ID=""
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

if [ "$INTEGRATION_MCP_PROTOCOL" != "legacy" ] && [ "$INTEGRATION_MCP_PROTOCOL" != "2026" ]; then
  echo "ERROR: INTEGRATION_MCP_PROTOCOL must be 'legacy' or '2026'"
  exit 1
fi

if [ "$INTEGRATION_MCP_PROTOCOL" = "2026" ] && [ "$INTEGRATION_TRANSPORT" != "http" ]; then
  echo "ERROR: INTEGRATION_MCP_PROTOCOL=2026 requires INTEGRATION_TRANSPORT=http"
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
MCP_2026_META='{"io.modelcontextprotocol/protocolVersion":"2026-07-28","io.modelcontextprotocol/clientInfo":{"name":"hulymcp-integration","version":"1.0"},"io.modelcontextprotocol/clientCapabilities":{}}'
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

cleanup_drive_artifacts() {
  if [ -n "$DRIVE_CLEANUP_ITEMS" ]; then
    while IFS=$'\t' read -r drive_id item_path; do
      if [ -n "$drive_id" ] && [ -n "$item_path" ]; then
        drive_json=$(json_string "$drive_id")
        item_path_json=$(json_string "$item_path")
        call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$drive_json,\"path\":$item_path_json}},\"id\":2}" >/dev/null 2>&1 || true
      fi
    done <<<"$DRIVE_CLEANUP_ITEMS"
  fi
  if [ -n "$DRIVE_CLEANUP_DRIVES" ]; then
    for drive_id in $DRIVE_CLEANUP_DRIVES; do
      if [ -n "$drive_id" ]; then
        drive_json=$(json_string "$drive_id")
        call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive\",\"arguments\":{\"drive\":$drive_json}},\"id\":2}" >/dev/null 2>&1 || true
      fi
    done
  fi
}

cleanup_inventory_artifacts() {
  if [ -n "$INVENTORY_CLEANUP_COMMENT_ID" ] && [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
    product_json=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
    comment_json=$(json_string "$INVENTORY_CLEANUP_COMMENT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_comment\",\"arguments\":{\"product\":$product_json,\"commentId\":$comment_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_ATTACHMENT_ID" ] && [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
    product_json=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
    attachment_json=$(json_string "$INVENTORY_CLEANUP_ATTACHMENT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_attachment\",\"arguments\":{\"product\":$product_json,\"attachmentId\":$attachment_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_PHOTO_ID" ] && [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
    product_json=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
    photo_json=$(json_string "$INVENTORY_CLEANUP_PHOTO_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_photo\",\"arguments\":{\"product\":$product_json,\"photoId\":$photo_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_VARIANT_ID" ]; then
    variant_json=$(json_string "$INVENTORY_CLEANUP_VARIANT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_variant\",\"arguments\":{\"variant\":$variant_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
    product_json=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product\",\"arguments\":{\"product\":$product_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID" ]; then
    child_category_json=$(json_string "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_category\",\"arguments\":{\"category\":$child_category_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
  if [ -n "$INVENTORY_CLEANUP_CATEGORY_ID" ]; then
    category_json=$(json_string "$INVENTORY_CLEANUP_CATEGORY_ID")
    call_tool "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_category\",\"arguments\":{\"category\":$category_json}},\"id\":2}" >/dev/null 2>&1 || true
  fi
}

cleanup_all() {
  cleanup_generic_associations
  cleanup_workflow_artifacts || true
  cleanup_inventory_artifacts || true
  cleanup_drive_artifacts || true
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
  local request_payload="$payload"
  local curl_args=(-sS --max-time "$TOOL_TIMEOUT" --config "$HTTP_CURL_CONFIG" --request POST)
  if [ "$INTEGRATION_MCP_PROTOCOL" = "2026" ]; then
    local method
    local name
    request_payload=$(printf '%s\n' "$payload" | jq -c --argjson meta "$MCP_2026_META" '.params = ((.params // {}) + {"_meta": $meta})')
    method=$(printf '%s\n' "$request_payload" | jq -r '.method')
    name=$(printf '%s\n' "$request_payload" | jq -r 'if .method == "tools/call" then .params.name elif .method == "resources/read" then .params.uri else empty end')
    curl_args+=(
      --header "MCP-Protocol-Version: 2026-07-28"
      --header "Mcp-Method: $method"
    )
    if [ -n "$name" ]; then
      curl_args+=(--header "Mcp-Name: $name")
    fi
  fi
  response=$(curl "${curl_args[@]}" --data "$request_payload" "$HTTP_ENDPOINT" 2>/dev/null)
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

assert_json_field_contains() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  local value
  value=$(printf '%s\n' "$json" | jq -r "$jq_expr // empty" 2>/dev/null)
  if printf '%s\n' "$value" | grep -qF -- "$expected"; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (field $jq_expr missing substring: $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: field ${jq_expr} missing substring"
  return 1
}

assert_json_array_contains() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  if printf '%s\n' "$json" | jq -e --arg expected "$expected" "($jq_expr) | any(.[]?; . == \$expected)" >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (array $jq_expr does not contain $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: array ${jq_expr} does not contain ${expected}"
  return 1
}

wait_for_json_array_contains_to_var() {
  local output_var="$1" name="$2" payload="$3" jq_expr="$4" expected="$5"
  local attempts="${6:-10}" delay="${7:-1}"
  local attempt=1 text=""
  while [ "$attempt" -le "$attempts" ]; do
    text=$(run_capture_only "$payload" 2>/dev/null || true)
    if [ -n "$text" ] && printf '%s\n' "$text" | jq -e --arg expected "$expected" "($jq_expr) | any(.[]?; . == \$expected)" >/dev/null 2>&1; then
      echo "PASS: $name"
      PASSED=$((PASSED + 1))
      printf -v "$output_var" '%s' "$text"
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep "$delay"
    fi
    attempt=$((attempt + 1))
  done
  echo "FAIL: $name (array $jq_expr does not contain $expected after ${attempts} attempts)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: array ${jq_expr} does not contain ${expected} after ${attempts} attempts"
  printf -v "$output_var" '%s' "$text"
  return 1
}

assert_json_array_not_contains() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  if printf '%s\n' "$json" | jq -e --arg expected "$expected" "($jq_expr) | all(.[]?; . != \$expected)" >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (array $jq_expr contains $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: array ${jq_expr} contains ${expected}"
  return 1
}

assert_json_array_same_set() {
  local name="$1" json="$2" jq_expr="$3" expected_json="$4"
  if printf '%s\n' "$json" | jq -e --argjson expected "$expected_json" "($jq_expr | sort) == (\$expected | sort)" >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (array $jq_expr does not match $expected_json)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: array ${jq_expr} does not match ${expected_json}"
  return 1
}

assert_json_role_members_same_set() {
  local name="$1" json="$2" role_id="$3" expected_json="$4"
  if printf '%s\n' "$json" | jq -e --arg role_id "$role_id" --argjson expected "$expected_json" \
    '((.roleAssignments // []) | map(select(.roleId == $role_id)) | first | .members // [] | sort) == ($expected | sort)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (role $role_id members do not match $expected_json)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: role ${role_id} members do not match ${expected_json}"
  return 1
}

assert_json_role_members_contains() {
  local name="$1" json="$2" role_id="$3" expected="$4"
  if printf '%s\n' "$json" | jq -e --arg role_id "$role_id" --arg expected "$expected" \
    '(.roleAssignments // []) | map(select(.roleId == $role_id)) | first | .members // [] | any(. == $expected)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (role $role_id members do not contain $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: role ${role_id} members do not contain ${expected}"
  return 1
}

assert_json_role_members_not_contains() {
  local name="$1" json="$2" role_id="$3" expected="$4"
  if printf '%s\n' "$json" | jq -e --arg role_id "$role_id" --arg expected "$expected" \
    '(.roleAssignments // []) | map(select(.roleId == $role_id)) | first | .members // [] | all(. != $expected)' >/dev/null 2>&1; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (role $role_id members contain $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: role ${role_id} members contain ${expected}"
  return 1
}

assert_json_field_count() {
  local name="$1" json="$2" jq_expr="$3" expected="$4"
  local value
  value=$(printf '%s\n' "$json" | jq -r "$jq_expr" 2>/dev/null)
  if [ "$value" = "$expected" ]; then
    echo "PASS: $name"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected count $expected, got ${value:-<empty>})"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected count ${expected}, got ${value:-<empty>}"
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

remember_drive_item_cleanup() {
  local drive_id="$1" item_path="$2"
  DRIVE_CLEANUP_ITEMS="${DRIVE_CLEANUP_ITEMS}${drive_id}"$'\t'"${item_path}"$'\n'
}

remember_drive_cleanup() {
  local drive_id="$1"
  DRIVE_CLEANUP_DRIVES="${DRIVE_CLEANUP_DRIVES} ${drive_id}"
}

url_encode() {
  jq -nr --arg value "$1" '$value | @uri'
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

run_expect_error_contains() {
  local name="$1"
  local payload="$2"
  local expected="$3"
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
  local err_text
  err_text=$(echo "$result" | jq -r '.result.content[0].text // empty' 2>/dev/null)
  if [ "$is_error" = "true" ] && printf '%s\n' "$err_text" | grep -qF -- "$expected"; then
    echo "PASS: $name (got expected error)"
    PASSED=$((PASSED + 1))
    return 0
  fi
  echo "FAIL: $name (expected error containing: $expected)"
  FAILED=$((FAILED + 1))
  ERRORS="${ERRORS}\n  - ${name}: expected error containing ${expected}"
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
  if printf '%s\n' "$text" | grep -qF -- "$substr"; then
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
  if printf '%s\n' "$text" | grep -qF -- "$substr"; then
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
LIST_STATUSES_RESULT=""
if run_result_to_var LIST_STATUSES_RESULT "list_statuses($PROJECT)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_statuses\",\"arguments\":{\"project\":\"$PROJECT\"}},\"id\":2}"; then
  LIST_STATUSES_TEXT=$(printf '%s\n' "$LIST_STATUSES_RESULT" | jq -r '.content[0].text' 2>/dev/null)
  # The server owns metadata-degradation detection via status_metadata_unresolved.
  # The raw-ref regex below remains defense in depth if an ID format changes.
  if printf '%s\n' "$LIST_STATUSES_RESULT" | jq -e '
    ((.structuredContent.warnings? // []) | length == 0)
    and ([.content[]? | select((.text | fromjson? | has("warnings")) == true)] | length == 0)
  ' >/dev/null 2>&1; then
    echo "PASS: list_statuses($PROJECT) emits no degradation warnings"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: list_statuses($PROJECT) emitted degradation warnings"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - list_statuses($PROJECT): degradation warnings emitted"
  fi
  if printf '%s\n' "$LIST_STATUSES_TEXT" | jq -e '
    (.statuses | length) > 0
    and all(.statuses[]?; (.name | type == "string")
      and (.name | length) > 0
      and ((.name | test("^[0-9a-f]{24}$")) | not)
      and .category != "unknown")
  ' >/dev/null 2>&1; then
    echo "PASS: list_statuses($PROJECT) resolves status metadata"
    PASSED=$((PASSED + 1))
  else
    echo "FAIL: list_statuses($PROJECT) returned raw or incomplete status metadata"
    FAILED=$((FAILED + 1))
    ERRORS="${ERRORS}\n  - list_statuses($PROJECT): raw or incomplete status metadata"
  fi
fi
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

run_capture_to_var TASK_TYPE_TEXT "create_task_type($TM_TASK_TYPE_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_task_type\",\"arguments\":{\"name\":$TM_TASK_TYPE_NAME_JSON}},\"id\":2}"
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "create_task_type returns task type id" "$TASK_TYPE_TEXT" '.taskType.id'
  run_capture_to_var TASK_TYPE_TEXT_2 "create_task_type idempotent($TM_TASK_TYPE_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_task_type\",\"arguments\":{\"name\":$TM_TASK_TYPE_NAME_JSON}},\"id\":2}"
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

run_capture_to_var STATUS_TEXT "create_issue_status($TM_STATUS_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_status\",\"arguments\":{\"name\":$TM_STATUS_NAME_JSON,\"category\":\"active\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "create_issue_status returns status id" "$STATUS_TEXT" '.status.id'
  run_capture_to_var STATUS_TEXT_2 "create_issue_status idempotent($TM_STATUS_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_status\",\"arguments\":{\"name\":$TM_STATUS_NAME_JSON,\"category\":\"active\"}},\"id\":2}"
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
run_capture_to_var PROJECT_TYPE_TEXT "get_project_type verifies task/status" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_project_type","arguments":{}},"id":2}'
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
# 1c. INVENTORY CRUD
##############################
echo "=== 1c. Inventory CRUD ==="
INVENTORY_PROBE_RESULT=$(call_tool \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_inventory_categories","arguments":{"limit":5}},"id":2}')
INVENTORY_PROBE_ERROR=$(echo "$INVENTORY_PROBE_RESULT" | jq -r '.result.content[0].text // .error.message // empty' 2>/dev/null)
INVENTORY_PROBE_IS_ERROR=$(echo "$INVENTORY_PROBE_RESULT" | jq -r '.result.isError // false' 2>/dev/null)
if [ -z "$INVENTORY_PROBE_RESULT" ]; then
  fail_test "list_inventory_categories" "no response"
elif [ "$INVENTORY_PROBE_IS_ERROR" = "true" ] &&
  printf '%s\n' "$INVENTORY_PROBE_ERROR" | grep -Eiq 'inventory.*(class|model|not found|missing)|class.*inventory'; then
  for inventory_test in \
    "list_inventory_categories" \
    "create_inventory_category" \
    "get_inventory_category" \
    "update_inventory_category" \
    "create_inventory_category(child)" \
    "list_inventory_categories(parent)" \
    "create_inventory_product" \
    "get_inventory_product" \
    "list_inventory_products" \
    "update_inventory_product" \
    "add_inventory_product_attachment" \
    "list_inventory_product_attachments" \
    "get_inventory_product_attachment" \
    "update_inventory_product_attachment" \
    "delete_inventory_product_attachment" \
    "add_inventory_product_photo" \
    "list_inventory_product_photos" \
    "get_inventory_product_photo" \
    "update_inventory_product_photo" \
    "delete_inventory_product_photo" \
    "add_inventory_product_comment" \
    "list_inventory_product_comments" \
    "update_inventory_product_comment" \
    "delete_inventory_product_comment" \
    "list_inventory_product_activity" \
    "create_inventory_variant" \
    "get_inventory_variant" \
    "list_inventory_variants" \
    "update_inventory_variant" \
    "delete_inventory_product(non-empty)" \
    "delete_inventory_variant" \
    "delete_inventory_product" \
    "delete_inventory_category(child)" \
    "delete_inventory_category"; do
    skip_test "$inventory_test" "server lacks Inventory model"
  done
elif [ "$INVENTORY_PROBE_IS_ERROR" = "true" ]; then
  fail_test "list_inventory_categories" "$INVENTORY_PROBE_ERROR"
else
  echo "PASS: list_inventory_categories"
  PASSED=$((PASSED + 1))

  INV_CATEGORY_NAME="MCP IntTest Inventory $RUN_ID"
  INV_CATEGORY_UPDATED_NAME="MCP IntTest Inventory Updated $RUN_ID"
  INV_CHILD_CATEGORY_NAME="MCP IntTest Inventory Child $RUN_ID"
  INV_PRODUCT_NAME="MCP IntTest Product $RUN_ID"
  INV_PRODUCT_UPDATED_NAME="MCP IntTest Product Updated $RUN_ID"
  INV_VARIANT_NAME="MCP IntTest Variant $RUN_ID"
  INV_VARIANT_UPDATED_NAME="MCP IntTest Variant Updated $RUN_ID"
  INV_SKU="MCP-$RUN_ID"
  INV_SKU_UPDATED="MCP-$RUN_ID-U"
  INV_CATEGORY_NAME_JSON=$(json_string "$INV_CATEGORY_NAME")
  INV_CATEGORY_UPDATED_NAME_JSON=$(json_string "$INV_CATEGORY_UPDATED_NAME")
  INV_CHILD_CATEGORY_NAME_JSON=$(json_string "$INV_CHILD_CATEGORY_NAME")
  INV_PRODUCT_NAME_JSON=$(json_string "$INV_PRODUCT_NAME")
  INV_PRODUCT_UPDATED_NAME_JSON=$(json_string "$INV_PRODUCT_UPDATED_NAME")
  INV_VARIANT_NAME_JSON=$(json_string "$INV_VARIANT_NAME")
  INV_VARIANT_UPDATED_NAME_JSON=$(json_string "$INV_VARIANT_UPDATED_NAME")
  INV_SKU_JSON=$(json_string "$INV_SKU")
  INV_SKU_UPDATED_JSON=$(json_string "$INV_SKU_UPDATED")

  run_capture_to_var INV_CATEGORY_TEXT "create_inventory_category($INV_CATEGORY_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_inventory_category\",\"arguments\":{\"name\":$INV_CATEGORY_NAME_JSON}},\"id\":2}"
  INVENTORY_CLEANUP_CATEGORY_ID=$(echo "$INV_CATEGORY_TEXT" | jq -r '.id // empty' 2>/dev/null)
  if [ -n "$INVENTORY_CLEANUP_CATEGORY_ID" ]; then
    INV_CATEGORY_ID_JSON=$(json_string "$INVENTORY_CLEANUP_CATEGORY_ID")
    sleep 1
    run_capture_to_var INV_GET_CATEGORY_TEXT "get_inventory_category($INVENTORY_CLEANUP_CATEGORY_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_category\",\"arguments\":{\"category\":$INV_CATEGORY_ID_JSON}},\"id\":2}"
    assert_json_field_equals "get_inventory_category returns name" "$INV_GET_CATEGORY_TEXT" ".name" "$INV_CATEGORY_NAME"

    run_capture_to_var INV_UPDATE_CATEGORY_TEXT "update_inventory_category($INVENTORY_CLEANUP_CATEGORY_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_category\",\"arguments\":{\"category\":$INV_CATEGORY_ID_JSON,\"name\":$INV_CATEGORY_UPDATED_NAME_JSON}},\"id\":2}"
    assert_json_field_equals "update_inventory_category updated" "$INV_UPDATE_CATEGORY_TEXT" ".updated" "true"

    run_capture_to_var INV_CHILD_CATEGORY_TEXT "create_inventory_category($INV_CHILD_CATEGORY_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_inventory_category\",\"arguments\":{\"name\":$INV_CHILD_CATEGORY_NAME_JSON,\"parentCategory\":$INV_CATEGORY_ID_JSON}},\"id\":2}"
    INVENTORY_CLEANUP_CHILD_CATEGORY_ID=$(echo "$INV_CHILD_CATEGORY_TEXT" | jq -r '.id // empty' 2>/dev/null)
    INV_CHILD_CATEGORY_ID_JSON=$(json_string "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID")
    sleep 1
    run_capture_to_var INV_LIST_CHILDREN_TEXT "list_inventory_categories(parent)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_categories\",\"arguments\":{\"parentCategory\":$INV_CATEGORY_ID_JSON,\"limit\":20}},\"id\":2}"
    assert_json_array_contains "list_inventory_categories includes child" "$INV_LIST_CHILDREN_TEXT" ".categories | map(.id)" "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID"

    run_capture_to_var INV_PRODUCT_TEXT "create_inventory_product($INV_PRODUCT_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_inventory_product\",\"arguments\":{\"name\":$INV_PRODUCT_NAME_JSON,\"category\":$INV_CATEGORY_ID_JSON}},\"id\":2}"
    INVENTORY_CLEANUP_PRODUCT_ID=$(echo "$INV_PRODUCT_TEXT" | jq -r '.id // empty' 2>/dev/null)
    if [ -n "$INVENTORY_CLEANUP_PRODUCT_ID" ]; then
      INV_PRODUCT_ID_JSON=$(json_string "$INVENTORY_CLEANUP_PRODUCT_ID")
      sleep 1
      run_capture_to_var INV_GET_PRODUCT_TEXT "get_inventory_product($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}"
      assert_json_field_equals "get_inventory_product returns name" "$INV_GET_PRODUCT_TEXT" ".name" "$INV_PRODUCT_NAME"
      run_capture_to_var INV_LIST_PRODUCTS_TEXT "list_inventory_products(category)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_products\",\"arguments\":{\"category\":$INV_CATEGORY_ID_JSON,\"query\":$INV_PRODUCT_NAME_JSON,\"limit\":20}},\"id\":2}"
      assert_json_array_contains "list_inventory_products includes product" "$INV_LIST_PRODUCTS_TEXT" ".products | map(.id)" "$INVENTORY_CLEANUP_PRODUCT_ID"
      run_capture_to_var INV_UPDATE_PRODUCT_TEXT "update_inventory_product($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"name\":$INV_PRODUCT_UPDATED_NAME_JSON}},\"id\":2}"
      assert_json_field_equals "update_inventory_product updated" "$INV_UPDATE_PRODUCT_TEXT" ".updated" "true"

      INV_SMALL_TEXT_DATA_JSON=$(json_string "aW52ZW50b3J5IGF0dGFjaG1lbnQ=")
      INV_SMALL_PHOTO_DATA_JSON=$(json_string "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=")
      INV_ATTACHMENT_FILENAME_JSON=$(json_string "inventory-attachment.txt")
      INV_PHOTO_FILENAME_JSON=$(json_string "inventory-photo.png")
      INV_ATTACHMENT_DESC_JSON=$(json_string "Inventory attachment")
      INV_ATTACHMENT_DESC_UPDATED_JSON=$(json_string "Updated inventory attachment")
      INV_PHOTO_DESC_JSON=$(json_string "Inventory photo")
      INV_PHOTO_DESC_UPDATED_JSON=$(json_string "Updated inventory photo")
      INV_COMMENT_BODY_JSON=$(json_string "Inventory product integration comment")
      INV_COMMENT_BODY_UPDATED_JSON=$(json_string "Updated inventory product integration comment")

      run_capture_to_var INV_ATTACHMENT_TEXT "add_inventory_product_attachment($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_inventory_product_attachment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"filename\":$INV_ATTACHMENT_FILENAME_JSON,\"contentType\":\"text/plain\",\"data\":$INV_SMALL_TEXT_DATA_JSON,\"description\":$INV_ATTACHMENT_DESC_JSON}},\"id\":2}"
      INVENTORY_CLEANUP_ATTACHMENT_ID=$(echo "$INV_ATTACHMENT_TEXT" | jq -r '.attachmentId // empty' 2>/dev/null)
      if [ -n "$INVENTORY_CLEANUP_ATTACHMENT_ID" ]; then
        INV_ATTACHMENT_ID_JSON=$(json_string "$INVENTORY_CLEANUP_ATTACHMENT_ID")
        wait_for_json_array_contains_to_var INV_LIST_ATTACHMENTS_TEXT "list_inventory_product_attachments includes attachment" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_attachments\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":20}},\"id\":2}" \
          ".attachments | map(.id)" "$INVENTORY_CLEANUP_ATTACHMENT_ID"
        run_capture_to_var INV_GET_ATTACHMENT_TEXT "get_inventory_product_attachment($INVENTORY_CLEANUP_ATTACHMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_product_attachment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"attachmentId\":$INV_ATTACHMENT_ID_JSON}},\"id\":2}"
        assert_json_field_equals "get_inventory_product_attachment returns id" "$INV_GET_ATTACHMENT_TEXT" ".attachment.id" "$INVENTORY_CLEANUP_ATTACHMENT_ID"
        run_capture_to_var INV_UPDATE_ATTACHMENT_TEXT "update_inventory_product_attachment($INVENTORY_CLEANUP_ATTACHMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_product_attachment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"attachmentId\":$INV_ATTACHMENT_ID_JSON,\"description\":$INV_ATTACHMENT_DESC_UPDATED_JSON,\"pinned\":true}},\"id\":2}"
        assert_json_field_equals "update_inventory_product_attachment updated" "$INV_UPDATE_ATTACHMENT_TEXT" ".updated" "true"
        run_capture_to_var INV_DELETE_ATTACHMENT_TEXT "delete_inventory_product_attachment($INVENTORY_CLEANUP_ATTACHMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_attachment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"attachmentId\":$INV_ATTACHMENT_ID_JSON}},\"id\":2}"
        if assert_json_field_equals "delete_inventory_product_attachment deleted" "$INV_DELETE_ATTACHMENT_TEXT" ".deleted" "true"; then
          INVENTORY_CLEANUP_ATTACHMENT_ID=""
        fi
      else
        skip_test "list/get/update/delete inventory product attachment" "add_inventory_product_attachment did not return an id"
      fi

      run_capture_to_var INV_PHOTO_TEXT "add_inventory_product_photo($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_inventory_product_photo\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"filename\":$INV_PHOTO_FILENAME_JSON,\"contentType\":\"image/png\",\"data\":$INV_SMALL_PHOTO_DATA_JSON,\"description\":$INV_PHOTO_DESC_JSON}},\"id\":2}"
      INVENTORY_CLEANUP_PHOTO_ID=$(echo "$INV_PHOTO_TEXT" | jq -r '.photoId // empty' 2>/dev/null)
      if [ -n "$INVENTORY_CLEANUP_PHOTO_ID" ]; then
        INV_PHOTO_ID_JSON=$(json_string "$INVENTORY_CLEANUP_PHOTO_ID")
        wait_for_json_array_contains_to_var INV_LIST_PHOTOS_TEXT "list_inventory_product_photos includes photo" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_photos\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":20}},\"id\":2}" \
          ".photos | map(.id)" "$INVENTORY_CLEANUP_PHOTO_ID"
        run_capture_to_var INV_GET_PHOTO_TEXT "get_inventory_product_photo($INVENTORY_CLEANUP_PHOTO_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_product_photo\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"photoId\":$INV_PHOTO_ID_JSON}},\"id\":2}"
        assert_json_field_equals "get_inventory_product_photo returns id" "$INV_GET_PHOTO_TEXT" ".photo.id" "$INVENTORY_CLEANUP_PHOTO_ID"
        run_capture_to_var INV_UPDATE_PHOTO_TEXT "update_inventory_product_photo($INVENTORY_CLEANUP_PHOTO_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_product_photo\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"photoId\":$INV_PHOTO_ID_JSON,\"description\":$INV_PHOTO_DESC_UPDATED_JSON,\"pinned\":true}},\"id\":2}"
        assert_json_field_equals "update_inventory_product_photo updated" "$INV_UPDATE_PHOTO_TEXT" ".updated" "true"
        run_capture_to_var INV_DELETE_PHOTO_TEXT "delete_inventory_product_photo($INVENTORY_CLEANUP_PHOTO_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_photo\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"photoId\":$INV_PHOTO_ID_JSON}},\"id\":2}"
        if assert_json_field_equals "delete_inventory_product_photo deleted" "$INV_DELETE_PHOTO_TEXT" ".deleted" "true"; then
          INVENTORY_CLEANUP_PHOTO_ID=""
        fi
      else
        skip_test "list/get/update/delete inventory product photo" "add_inventory_product_photo did not return an id"
      fi

      run_capture_to_var INV_COMMENT_TEXT "add_inventory_product_comment($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_inventory_product_comment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"body\":$INV_COMMENT_BODY_JSON}},\"id\":2}"
      INVENTORY_CLEANUP_COMMENT_ID=$(echo "$INV_COMMENT_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
      if [ -n "$INVENTORY_CLEANUP_COMMENT_ID" ]; then
        INV_COMMENT_ID_JSON=$(json_string "$INVENTORY_CLEANUP_COMMENT_ID")
        wait_for_json_array_contains_to_var INV_LIST_COMMENTS_TEXT "list_inventory_product_comments includes comment" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_comments\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":20}},\"id\":2}" \
          ".comments | map(.id)" "$INVENTORY_CLEANUP_COMMENT_ID"
        run_capture_to_var INV_UPDATE_COMMENT_TEXT "update_inventory_product_comment($INVENTORY_CLEANUP_COMMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_product_comment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"commentId\":$INV_COMMENT_ID_JSON,\"body\":$INV_COMMENT_BODY_UPDATED_JSON}},\"id\":2}"
        assert_json_field_equals "update_inventory_product_comment updated" "$INV_UPDATE_COMMENT_TEXT" ".updated" "true"
        run_expect_error_contains "delete_inventory_product(comment non-empty)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}" \
          "comments"
        run_capture_to_var INV_ACTIVITY_TEXT "list_inventory_product_activity($INVENTORY_CLEANUP_PRODUCT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_activity\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":5}},\"id\":2}"
        assert_json_field_equals "list_inventory_product_activity returns product" "$INV_ACTIVITY_TEXT" ".product.id" "$INVENTORY_CLEANUP_PRODUCT_ID"
        run_capture_to_var INV_DELETE_COMMENT_TEXT "delete_inventory_product_comment($INVENTORY_CLEANUP_COMMENT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product_comment\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"commentId\":$INV_COMMENT_ID_JSON}},\"id\":2}"
        if assert_json_field_equals "delete_inventory_product_comment deleted" "$INV_DELETE_COMMENT_TEXT" ".deleted" "true"; then
          INVENTORY_CLEANUP_COMMENT_ID=""
        fi
      else
        skip_test "list/update/delete inventory product comment" "add_inventory_product_comment did not return an id"
        run_capture_to_var INV_ACTIVITY_TEXT "list_inventory_product_activity($INVENTORY_CLEANUP_PRODUCT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_product_activity\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"limit\":5}},\"id\":2}"
        assert_json_field_equals "list_inventory_product_activity returns product" "$INV_ACTIVITY_TEXT" ".product.id" "$INVENTORY_CLEANUP_PRODUCT_ID"
      fi

      run_capture_to_var INV_VARIANT_TEXT "create_inventory_variant($INV_SKU)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_inventory_variant\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"name\":$INV_VARIANT_NAME_JSON,\"sku\":$INV_SKU_JSON}},\"id\":2}"
      INVENTORY_CLEANUP_VARIANT_ID=$(echo "$INV_VARIANT_TEXT" | jq -r '.id // empty' 2>/dev/null)
      if [ -n "$INVENTORY_CLEANUP_VARIANT_ID" ]; then
        INV_VARIANT_ID_JSON=$(json_string "$INVENTORY_CLEANUP_VARIANT_ID")
        sleep 1
        run_capture_to_var INV_GET_VARIANT_TEXT "get_inventory_variant($INV_SKU)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_inventory_variant\",\"arguments\":{\"variant\":$INV_SKU_JSON,\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}"
        assert_json_field_equals "get_inventory_variant returns sku" "$INV_GET_VARIANT_TEXT" ".sku" "$INV_SKU"
        run_capture_to_var INV_LIST_VARIANTS_TEXT "list_inventory_variants(product)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_inventory_variants\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON,\"query\":$INV_SKU_JSON,\"limit\":20}},\"id\":2}"
        assert_json_array_contains "list_inventory_variants includes variant" "$INV_LIST_VARIANTS_TEXT" ".variants | map(.id)" "$INVENTORY_CLEANUP_VARIANT_ID"
        run_capture_to_var INV_UPDATE_VARIANT_TEXT "update_inventory_variant($INVENTORY_CLEANUP_VARIANT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_inventory_variant\",\"arguments\":{\"variant\":$INV_VARIANT_ID_JSON,\"name\":$INV_VARIANT_UPDATED_NAME_JSON,\"sku\":$INV_SKU_UPDATED_JSON}},\"id\":2}"
        assert_json_field_equals "update_inventory_variant updated" "$INV_UPDATE_VARIANT_TEXT" ".updated" "true"
        run_expect_error_contains "delete_inventory_product(non-empty)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}" \
          "not empty"
        run_capture_to_var INV_DELETE_VARIANT_TEXT "delete_inventory_variant($INVENTORY_CLEANUP_VARIANT_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_variant\",\"arguments\":{\"variant\":$INV_VARIANT_ID_JSON}},\"id\":2}"
        assert_json_field_equals "delete_inventory_variant deleted" "$INV_DELETE_VARIANT_TEXT" ".deleted" "true"
        INVENTORY_CLEANUP_VARIANT_ID=""
      else
        skip_test "get/update/delete inventory variant" "create_inventory_variant did not return an id"
      fi

      run_capture_to_var INV_DELETE_PRODUCT_TEXT "delete_inventory_product($INVENTORY_CLEANUP_PRODUCT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_product\",\"arguments\":{\"product\":$INV_PRODUCT_ID_JSON}},\"id\":2}"
      if assert_json_field_equals "delete_inventory_product deleted" "$INV_DELETE_PRODUCT_TEXT" ".deleted" "true"; then
        INVENTORY_CLEANUP_PRODUCT_ID=""
      fi
    else
      skip_test "get/list/update/delete inventory product" "create_inventory_product did not return an id"
    fi

    if [ -n "$INVENTORY_CLEANUP_CHILD_CATEGORY_ID" ]; then
      run_capture_to_var INV_DELETE_CHILD_CATEGORY_TEXT "delete_inventory_category($INVENTORY_CLEANUP_CHILD_CATEGORY_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_category\",\"arguments\":{\"category\":$INV_CHILD_CATEGORY_ID_JSON}},\"id\":2}"
      assert_json_field_equals "delete_inventory_category(child) deleted" "$INV_DELETE_CHILD_CATEGORY_TEXT" ".deleted" "true"
      INVENTORY_CLEANUP_CHILD_CATEGORY_ID=""
    fi
    run_capture_to_var INV_DELETE_CATEGORY_TEXT "delete_inventory_category($INVENTORY_CLEANUP_CATEGORY_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_inventory_category\",\"arguments\":{\"category\":$INV_CATEGORY_ID_JSON}},\"id\":2}"
    assert_json_field_equals "delete_inventory_category deleted" "$INV_DELETE_CATEGORY_TEXT" ".deleted" "true"
    INVENTORY_CLEANUP_CATEGORY_ID=""
  else
    skip_test "get/update/delete inventory category" "create_inventory_category did not return an id"
  fi
fi
echo ""

##############################
# 2. ISSUES CRUD + RELATIONS + LABELS + MOVE
##############################
echo "=== 2. Issues CRUD ==="
ISSUE_ID=""
ISSUE_OBJ_ID=""
ISSUE_TITLE="IntTest Issue $RUN_ID"
ISSUE_TITLE_JSON=$(json_string "$ISSUE_TITLE")
ISSUE_TITLE_REGEX_JSON=$(json_string "%$ISSUE_TITLE%")
ISSUE_TITLE_CASE_REGEX_JSON=$(json_string "%inttest issue $RUN_ID%")
run_capture_to_var ISSUE_TEXT "create_issue" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":$ISSUE_TITLE_JSON,\"description\":\"Integration test\",\"priority\":\"low\"}},\"id\":2}"
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
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"titleSearch\":$ISSUE_TITLE_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_issue_summary_contains_issue_id "list_issues includes issueId" "$LIST_ISSUES_TEXT" "$ISSUE_ID" "$ISSUE_OBJ_ID"
  fi

  run_capture_to_var LIST_ISSUES_REGEX_TEXT "list_issues(titleRegex SIMILAR TO contains)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"titleRegex\":$ISSUE_TITLE_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_issue_summary_contains_issue_id "list_issues titleRegex SIMILAR TO contains includes issueId" "$LIST_ISSUES_REGEX_TEXT" "$ISSUE_ID" "$ISSUE_OBJ_ID"
  fi

  run_capture_to_var LIST_ISSUES_REGEX_CASE_TEXT "list_issues(titleRegex case-sensitive miss)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issues\",\"arguments\":{\"project\":\"$PROJECT\",\"titleRegex\":$ISSUE_TITLE_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ] && [ -n "$ISSUE_OBJ_ID" ]; then
    assert_json_array_not_contains "list_issues titleRegex is case-sensitive" "$LIST_ISSUES_REGEX_CASE_TEXT" "map(.issueId)" "$ISSUE_OBJ_ID"
  fi

  run_test "update_issue($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE_ID\",\"title\":\"Updated IntTest\",\"priority\":\"high\"}},\"id\":2}"

  if [ "$TM_TASK_TYPE_READY" = "true" ]; then
    run_capture_to_var TASK_TYPED_ISSUE_TEXT "create_issue(taskType=$TM_TASK_TYPE_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Typed IntTest Issue\",\"taskType\":$TM_TASK_TYPE_NAME_JSON,\"status\":$TM_TASK_TYPE_STATUS_NAME_JSON}},\"id\":2}"
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
  run_capture_to_var SUB_TEXT "create_issue(sub)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Sub Issue\",\"parentIssue\":\"$ISSUE_ID\"}},\"id\":2}"
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
  run_capture_to_var ISSUE2_TEXT "create_issue(for_relation)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Relation Target\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    ISSUE2_ID=$(echo "$ISSUE2_TEXT" | jq -r '.identifier' 2>/dev/null)
    echo "  => relation target: $ISSUE2_ID"
    run_test "add_issue_relation" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_issue_relation\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"targetIssue\":\"$ISSUE2_ID\",\"relationType\":\"is-blocked-by\"}},\"id\":2}"
    run_test "list_issue_relations" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issue_relations\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\"}},\"id\":2}"
    run_capture_to_var REL_BLOCKS_TEXT "list_issue_relations(blocks:$ISSUE2_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_issue_relations\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE2_ID\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_blocks_contains_identifier "list_issue_relations blocks contains $ISSUE_ID" "$REL_BLOCKS_TEXT" "$ISSUE_ID"
    fi
    run_test "remove_issue_relation" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_issue_relation\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"targetIssue\":\"$ISSUE2_ID\",\"relationType\":\"is-blocked-by\"}},\"id\":2}"
    run_test "delete_issue(relation:$ISSUE2_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ISSUE2_ID\"}},\"id\":2}"
  fi

  # Issue labels
  run_capture_to_var LBL_TEXT "create_label(for_issue)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_label\",\"arguments\":{\"title\":\"inttest-lbl\",\"color\":2}},\"id\":2}"
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
  run_capture_to_var COMMENT_TEXT "add_comment($ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_comment\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"body\":\"IntTest comment\"}},\"id\":2}"
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
  run_capture_to_var ACTIVITY_TEXT "list_activity(issue:$ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_activity\",\"arguments\":{\"project\":\"$PROJECT\",\"issueIdentifier\":\"$ISSUE_ID\",\"limit\":3}},\"id\":2}"
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
run_capture_to_var COMP_TEXT "create_component" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_component\",\"arguments\":{\"project\":\"$PROJECT\",\"label\":\"IntTest Comp\"}},\"id\":2}"
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
  run_capture_to_var SET_COMP_TEXT "create_issue(for_component)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Comp Test Issue\"}},\"id\":2}"
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
run_capture_to_var MS_TEXT "create_milestone" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_milestone\",\"arguments\":{\"project\":\"$PROJECT\",\"label\":\"IntTest MS\",\"targetDate\":1777000000000}},\"id\":2}"
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
  run_capture_to_var SET_MS_TEXT "create_issue(for_milestone)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"MS Test Issue\"}},\"id\":2}"
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
run_capture_to_var TMPL_TEXT "create_issue_template" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_template\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"IntTest Tmpl\",\"priority\":\"high\"}},\"id\":2}"
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
  run_capture_to_var CHILD_TEXT "add_template_child($TMPL_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_template_child\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"title\":\"Child Task\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    CHILD_ID=$(echo "$CHILD_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => child: $CHILD_ID"
    run_test "remove_template_child($CHILD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_template_child\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"childId\":\"$CHILD_ID\"}},\"id\":2}"
  fi

  # Create from template (NOTE: may hang due to eventual consistency if template was just modified)
  run_capture_to_var TMPL_ISSUE_TEXT "create_issue_from_template" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue_from_template\",\"arguments\":{\"project\":\"$PROJECT\",\"template\":\"$TMPL_ID\",\"title\":\"From Template\"}},\"id\":2}"
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
run_capture_to_var TC_TEXT "create_tag_category" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_tag_category\",\"arguments\":{\"label\":\"IntTest Category\"}},\"id\":2}"
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

run_capture_to_var LBL_TEXT "create_label" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_label","arguments":{"title":"inttest-label","color":1}},"id":2}'
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

GENERIC_TAG_TITLE="inttest-generic-tag-$RUN_ID"
GENERIC_TAG_UPDATED_TITLE="updated-generic-tag-$RUN_ID"
GENERIC_TAG_TITLE_JSON=$(json_string "$GENERIC_TAG_TITLE")
GENERIC_TAG_UPDATED_TITLE_JSON=$(json_string "$GENERIC_TAG_UPDATED_TITLE")
run_capture_to_var GENERIC_TAG_TEXT "create_tag(generic)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"title\":$GENERIC_TAG_TITLE_JSON,\"color\":3}},\"id\":2}"
if [ $? -eq 0 ]; then
  GENERIC_TAG_ID=$(echo "$GENERIC_TAG_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => generic_tag: $GENERIC_TAG_ID"
  assert_json_field_nonempty "create_tag(generic) returns id" "$GENERIC_TAG_TEXT" '.id'
  run_test "list_tags(generic)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_tags\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"titleSearch\":$GENERIC_TAG_TITLE_JSON}},\"id\":2}"
  run_test "update_tag($GENERIC_TAG_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"tag\":\"$GENERIC_TAG_ID\",\"title\":$GENERIC_TAG_UPDATED_TITLE_JSON,\"color\":4,\"description\":\"Generic tag integration test\"}},\"id\":2}"
  run_capture_to_var ATTACH_TAG_TEXT "attach_tag($GENERIC_TAG_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"attach_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"tag\":\"$GENERIC_TAG_ID\",\"object\":{\"objectId\":\"core:space:Workspace\",\"objectClass\":\"core:class:Space\",\"space\":\"core:space:Workspace\",\"collection\":\"tags\"},\"weight\":3}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "attach_tag($GENERIC_TAG_ID) attached" "$ATTACH_TAG_TEXT" '.attached' 'true'
    run_test "list_attached_tags($GENERIC_TAG_ID)" \
      '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_attached_tags","arguments":{"objectId":"core:space:Workspace","objectClass":"core:class:Space","space":"core:space:Workspace","collection":"tags"}},"id":2}'
    run_capture_to_var DETACH_TAG_TEXT "detach_tag($GENERIC_TAG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"detach_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"tag\":\"$GENERIC_TAG_ID\",\"object\":{\"objectId\":\"core:space:Workspace\",\"objectClass\":\"core:class:Space\",\"space\":\"core:space:Workspace\",\"collection\":\"tags\"}}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "detach_tag($GENERIC_TAG_ID) detached" "$DETACH_TAG_TEXT" '.detached' 'true'
    fi
  fi
  run_test "delete_tag($GENERIC_TAG_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_tag\",\"arguments\":{\"targetClass\":\"core:class:Space\",\"tag\":\"$GENERIC_TAG_ID\"}},\"id\":2}"
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

  DOC_CONTENT=$'# Integration Markdown\n\nThis has **bold**, *italic*, and [Huly](https://huly.io).\n\n- First item\n- Second item'
  DOC_CONTENT_JSON=$(json_string "$DOC_CONTENT")
  DOC_TITLE="IntTest Doc $RUN_ID"
  DOC_TITLE_JSON=$(json_string "$DOC_TITLE")
  DOC_TITLE_REGEX_JSON=$(json_string "%$DOC_TITLE%")
  DOC_TITLE_CASE_REGEX_JSON=$(json_string "%inttest doc $RUN_ID%")
  DOC_EDITED_CONTENT=$'# Edited Integration Markdown\n\nThe full replacement path repaired this document.\n\n- Repaired item'
  DOC_EDITED_CONTENT_JSON=$(json_string "$DOC_EDITED_CONTENT")
  DOC_REPAIR_CONTENT=$'# Repaired After Corruption\n\nFull replacement restored readable content.'
  DOC_REPAIR_CONTENT_JSON=$(json_string "$DOC_REPAIR_CONTENT")
  DOC_CORRUPT_CONTENT='raw-markdown-that-is-not-a-blob-ref'

  run_capture_to_var DOC_TEXT "create_document" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":$DOC_TITLE_JSON,\"content\":$DOC_CONTENT_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    DOC_ID=$(echo "$DOC_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => doc: $DOC_ID"
    assert_json_field_nonempty "create_document($DOC_ID) returns url" "$DOC_TEXT" '.url'

    run_capture_to_var GET_DOC_TEXT "get_document($DOC_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "get_document($DOC_ID) returns url" "$GET_DOC_TEXT" '.url'
      assert_json_field_contains "get_document($DOC_ID) round-trips heading" "$GET_DOC_TEXT" '.content' "# Integration Markdown"
      assert_json_field_contains "get_document($DOC_ID) round-trips bold" "$GET_DOC_TEXT" '.content' "**bold**"
      assert_json_field_contains "get_document($DOC_ID) round-trips italic" "$GET_DOC_TEXT" '.content' "*italic*"
      assert_json_field_contains "get_document($DOC_ID) round-trips link" "$GET_DOC_TEXT" '.content' "[Huly](https://huly.io)"
      assert_json_field_contains "get_document($DOC_ID) round-trips list" "$GET_DOC_TEXT" '.content' "- First item"
    fi

    run_capture_to_var LIST_DOCS_REGEX_TEXT "list_documents($TS_NAME,titleRegex SIMILAR TO contains)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_documents\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"titleRegex\":$DOC_TITLE_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_documents titleRegex SIMILAR TO contains includes document" "$LIST_DOCS_REGEX_TEXT" ".documents | map(.id)" "$DOC_ID"
    fi

    run_capture_to_var LIST_DOCS_REGEX_CASE_TEXT "list_documents($TS_NAME,titleRegex case-sensitive miss)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_documents\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"titleRegex\":$DOC_TITLE_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_not_contains "list_documents titleRegex is case-sensitive" "$LIST_DOCS_REGEX_CASE_TEXT" ".documents | map(.id)" "$DOC_ID"
    fi

    run_capture_to_var EDIT_DOC_TEXT "edit_document($DOC_ID) title rename" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\",\"title\":\"Updated Doc\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "edit_document($DOC_ID) returns url" "$EDIT_DOC_TEXT" '.url'
    fi

    run_test "edit_document($DOC_ID) full replace" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\",\"content\":$DOC_EDITED_CONTENT_JSON}},\"id\":2}"
    run_capture_to_var GET_EDITED_DOC_TEXT "get_document($DOC_ID) after full replace" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$DOC_ID\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_contains "get_document($DOC_ID) returns full replacement" "$GET_EDITED_DOC_TEXT" '.content' "# Edited Integration Markdown"
      assert_json_field_contains "get_document($DOC_ID) replacement list" "$GET_EDITED_DOC_TEXT" '.content' "- Repaired item"
    fi

    CORRUPT_DOC_ID=""
    run_capture_to_var CORRUPT_DOC_TEXT "create_document(raw corruption fixture)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":\"IntTest Raw Corruption Fixture\"}},\"id\":2}"
    if [ $? -eq 0 ]; then
      CORRUPT_DOC_ID=$(echo "$CORRUPT_DOC_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => corrupt_doc: $CORRUPT_DOC_ID"
    fi

    if [ -n "${CORRUPT_DOC_ID:-}" ] && pnpm exec tsx scripts/corrupt-document-content.ts --document "$CORRUPT_DOC_ID" --content "$DOC_CORRUPT_CONTENT" >/dev/null; then
      sleep 2
      run_expect_error_contains "get_document($CORRUPT_DOC_ID) corrupted content error" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\"}},\"id\":2}" \
        "Document content is unreadable or corrupted. Use edit_document with the full content field to replace and repair it."
      run_test "edit_document($CORRUPT_DOC_ID) repairs corrupted content" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\",\"content\":$DOC_REPAIR_CONTENT_JSON}},\"id\":2}"
      run_capture_to_var GET_REPAIRED_DOC_TEXT "get_document($CORRUPT_DOC_ID) after repair" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_contains "get_document($CORRUPT_DOC_ID) repaired content" "$GET_REPAIRED_DOC_TEXT" '.content' "# Repaired After Corruption"
      fi
      run_test "delete_document($CORRUPT_DOC_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\"}},\"id\":2}"
    else
      fail_test "corrupt_document_content(${CORRUPT_DOC_ID:-missing})" "SDK helper failed"
      if [ -n "${CORRUPT_DOC_ID:-}" ]; then
        run_test "delete_document($CORRUPT_DOC_ID)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$CORRUPT_DOC_ID\"}},\"id\":2}"
      fi
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

  NATIVE_REF_ISSUE_ID=""
  NATIVE_REF_ISSUE_OBJ_ID=""
  NATIVE_URL_DOC_ID=""
  NATIVE_REF_DOC_ID=""
  NATIVE_REF_WORKSPACE_UUID=""
  if run_capture_to_var NATIVE_REF_WORKSPACE_TEXT "get_workspace_info(native_reference)" \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_workspace_info","arguments":{}},"id":2}'; then
    NATIVE_REF_WORKSPACE_UUID=$(echo "$NATIVE_REF_WORKSPACE_TEXT" | jq -r '.uuid // empty' 2>/dev/null)
  fi
  if run_capture_to_var NATIVE_REF_ISSUE_TEXT "create_issue(for_native_document_reference)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Native Document Reference Fixture\",\"description\":\"Integration test native document reference\"}},\"id\":2}"; then
    NATIVE_REF_ISSUE_ID=$(echo "$NATIVE_REF_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
    NATIVE_REF_ISSUE_OBJ_ID=$(echo "$NATIVE_REF_ISSUE_TEXT" | jq -r '.issueId' 2>/dev/null)
    echo "  => native_ref_issue: $NATIVE_REF_ISSUE_ID ($NATIVE_REF_ISSUE_OBJ_ID)"

    EXTERNAL_URL="https://example.com/plain"
    NATIVE_REF_LABEL_ENCODED=$(url_encode "$NATIVE_REF_ISSUE_ID")
    NATIVE_REF_URL="${HULY_URL%/}/browse?workspace=${NATIVE_REF_WORKSPACE_UUID}&_class=tracker%3Aclass%3AIssue&_id=${NATIVE_REF_ISSUE_OBJ_ID}&label=${NATIVE_REF_LABEL_ENCODED}"
    NATIVE_REF_CONTENT="Native issue: [${NATIVE_REF_ISSUE_ID}](${NATIVE_REF_URL}). External link stays [plain](${EXTERNAL_URL})."
    NATIVE_REF_CONTENT_JSON=$(json_string "$NATIVE_REF_CONTENT")
    if run_capture_to_var NATIVE_REF_DOC_TEXT "create_document(native_reference)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":\"IntTest Native Reference Doc\",\"content\":$NATIVE_REF_CONTENT_JSON}},\"id\":2}"; then
      NATIVE_REF_DOC_ID=$(echo "$NATIVE_REF_DOC_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => native_ref_doc: $NATIVE_REF_DOC_ID"

      if run_capture_to_var GET_NATIVE_REF_DOC_TEXT "get_document($NATIVE_REF_DOC_ID native_reference)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_REF_DOC_ID\"}},\"id\":2}"; then
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID) serializes native reference as link" "$GET_NATIVE_REF_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_ID"
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID) serializes native reference url" "$GET_NATIVE_REF_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_OBJ_ID"
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID) keeps external link" "$GET_NATIVE_REF_DOC_TEXT" '.content' "$EXTERNAL_URL"

        NATIVE_URL_CONTENT="Auto native issue: [${NATIVE_REF_ISSUE_ID}](${NATIVE_REF_URL})."
        NATIVE_URL_CONTENT_JSON=$(json_string "$NATIVE_URL_CONTENT")
        if run_capture_to_var NATIVE_URL_DOC_TEXT "create_document(native_reference_from_url)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":\"IntTest Native Reference URL\",\"content\":$NATIVE_URL_CONTENT_JSON}},\"id\":2}"; then
          NATIVE_URL_DOC_ID=$(echo "$NATIVE_URL_DOC_TEXT" | jq -r '.id' 2>/dev/null)
          echo "  => native_ref_url_doc: $NATIVE_URL_DOC_ID"

          if run_capture_to_var GET_NATIVE_URL_DOC_TEXT "get_document($NATIVE_URL_DOC_ID native_reference_from_url)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_URL_DOC_ID\"}},\"id\":2}"; then
            assert_json_field_contains "get_document($NATIVE_URL_DOC_ID) serializes auto native reference label" "$GET_NATIVE_URL_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_ID"
            assert_json_field_contains "get_document($NATIVE_URL_DOC_ID) serializes auto native reference url" "$GET_NATIVE_URL_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_OBJ_ID"
          fi

          run_test "delete_document($NATIVE_URL_DOC_ID native_reference_from_url)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_URL_DOC_ID\"}},\"id\":2}"
        fi
      fi

      NATIVE_REF_EDITED_CONTENT="Edited native issue: [${NATIVE_REF_ISSUE_ID}](${NATIVE_REF_URL})."
      NATIVE_REF_EDITED_CONTENT_JSON=$(json_string "$NATIVE_REF_EDITED_CONTENT")
      run_test "edit_document($NATIVE_REF_DOC_ID native_reference full replace)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"edit_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_REF_DOC_ID\",\"content\":$NATIVE_REF_EDITED_CONTENT_JSON}},\"id\":2}"
      if run_capture_to_var GET_EDITED_NATIVE_REF_DOC_TEXT "get_document($NATIVE_REF_DOC_ID edited native_reference)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_REF_DOC_ID\"}},\"id\":2}"; then
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID edited) content" "$GET_EDITED_NATIVE_REF_DOC_TEXT" '.content' "Edited native issue"
        assert_json_field_contains "get_document($NATIVE_REF_DOC_ID edited) serializes native reference url" "$GET_EDITED_NATIVE_REF_DOC_TEXT" '.content' "$NATIVE_REF_ISSUE_OBJ_ID"
      fi

      run_test "delete_document($NATIVE_REF_DOC_ID native_reference)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_REF_DOC_ID\"}},\"id\":2}"
    fi

    run_test "delete_issue(native_reference:$NATIVE_REF_ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$NATIVE_REF_ISSUE_ID\"}},\"id\":2}"
  fi

  NATIVE_MULTI_TARGET_DOC_ID=""
  NATIVE_MULTI_DOC_ID=""
  NATIVE_MULTI_PERSON_ID=""
  NATIVE_MULTI_PERSON_EMAIL="native-ref-${RUN_ID}@test.local"
  NATIVE_MULTI_TARGET_TITLE="IntTest Native Reference Target ${RUN_ID}"
  NATIVE_MULTI_TARGET_TITLE_JSON=$(json_string "$NATIVE_MULTI_TARGET_TITLE")
  NATIVE_MULTI_TARGET_CONTENT_JSON=$(json_string "Native reference target fixture.")
  if run_capture_to_var NATIVE_MULTI_TARGET_TEXT "create_document(native_reference_target)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":$NATIVE_MULTI_TARGET_TITLE_JSON,\"content\":$NATIVE_MULTI_TARGET_CONTENT_JSON}},\"id\":2}"; then
    NATIVE_MULTI_TARGET_DOC_ID=$(echo "$NATIVE_MULTI_TARGET_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => native_ref_target_doc: $NATIVE_MULTI_TARGET_DOC_ID"

    if run_capture_to_var NATIVE_MULTI_PERSON_TEXT "create_person(native_reference_person)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":\"Reference\",\"lastName\":\"Person\",\"email\":\"$NATIVE_MULTI_PERSON_EMAIL\"}},\"id\":2}"; then
      NATIVE_MULTI_PERSON_ID=$(echo "$NATIVE_MULTI_PERSON_TEXT" | jq -r '.id' 2>/dev/null)
      echo "  => native_ref_person: $NATIVE_MULTI_PERSON_ID"

      # Give Huly's search indexes a moment to expose the newly created person/document to the next MCP process.
      sleep 1

      NATIVE_MULTI_PERSON_NAME="Reference Person"
      NATIVE_MULTI_TARGET_TITLE_ENCODED=$(url_encode "$NATIVE_MULTI_TARGET_TITLE")
      NATIVE_MULTI_PERSON_NAME_ENCODED=$(url_encode "$NATIVE_MULTI_PERSON_NAME")
      NATIVE_MULTI_DOC_URL="${HULY_URL%/}/browse?workspace=${NATIVE_REF_WORKSPACE_UUID}&_class=document%3Aclass%3ADocument&_id=${NATIVE_MULTI_TARGET_DOC_ID}&label=${NATIVE_MULTI_TARGET_TITLE_ENCODED}"
      NATIVE_MULTI_PERSON_URL="${HULY_URL%/}/browse?workspace=${NATIVE_REF_WORKSPACE_UUID}&_class=contact%3Aclass%3APerson&_id=${NATIVE_MULTI_PERSON_ID}&label=${NATIVE_MULTI_PERSON_NAME_ENCODED}"
      NATIVE_MULTI_CONTENT="Native refs: document [${NATIVE_MULTI_TARGET_TITLE}](${NATIVE_MULTI_DOC_URL}), person [${NATIVE_MULTI_PERSON_NAME}](${NATIVE_MULTI_PERSON_URL})."
      NATIVE_MULTI_CONTENT_JSON=$(json_string "$NATIVE_MULTI_CONTENT")
      if run_capture_to_var NATIVE_MULTI_DOC_TEXT "create_document(native_reference_document_person)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"title\":\"IntTest Native Reference Multi\",\"content\":$NATIVE_MULTI_CONTENT_JSON}},\"id\":2}"; then
        NATIVE_MULTI_DOC_ID=$(echo "$NATIVE_MULTI_DOC_TEXT" | jq -r '.id' 2>/dev/null)
        echo "  => native_ref_multi_doc: $NATIVE_MULTI_DOC_ID"

        if run_capture_to_var GET_NATIVE_MULTI_DOC_TEXT "get_document($NATIVE_MULTI_DOC_ID native_reference_document_person)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_MULTI_DOC_ID\"}},\"id\":2}"; then
          assert_json_field_contains "get_document($NATIVE_MULTI_DOC_ID) serializes document reference" "$GET_NATIVE_MULTI_DOC_TEXT" '.content' "$NATIVE_MULTI_TARGET_TITLE"
          assert_json_field_contains "get_document($NATIVE_MULTI_DOC_ID) serializes document reference url" "$GET_NATIVE_MULTI_DOC_TEXT" '.content' "$NATIVE_MULTI_TARGET_DOC_ID"
          assert_json_field_contains "get_document($NATIVE_MULTI_DOC_ID) serializes person reference url" "$GET_NATIVE_MULTI_DOC_TEXT" '.content' "$NATIVE_MULTI_PERSON_ID"
        fi

        run_test "delete_document($NATIVE_MULTI_DOC_ID native_reference_document_person)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_MULTI_DOC_ID\"}},\"id\":2}"
      fi
    fi
  fi
  if [ -n "${NATIVE_MULTI_TARGET_DOC_ID:-}" ]; then
    run_test "delete_document($NATIVE_MULTI_TARGET_DOC_ID native_reference_target)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_document\",\"arguments\":{\"teamspace\":\"$TS_NAME\",\"document\":\"$NATIVE_MULTI_TARGET_DOC_ID\"}},\"id\":2}"
  fi
  if [ -n "${NATIVE_MULTI_PERSON_ID:-}" ]; then
    run_test "delete_person($NATIVE_MULTI_PERSON_ID native_reference_person)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_person\",\"arguments\":{\"personId\":\"$NATIVE_MULTI_PERSON_ID\"}},\"id\":2}"
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
run_capture_to_var SR_TS_TEXT "create_teamspace(SR)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_teamspace","arguments":{"name":"SR Test Space","description":"search and replace integration test"}},"id":2}'
if [ $? -eq 0 ]; then
  SR_TS_ID=$(echo "$SR_TS_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => teamspace: $SR_TS_ID"

  # Step 1: Create doc with big content
  run_capture_to_var SR_DOC_TEXT "sr: create big doc" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_document\",\"arguments\":{\"teamspace\":\"$SR_TS_ID\",\"title\":\"SR Test Doc\",\"content\":\"$SR_CONTENT\"}},\"id\":2}"
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
run_capture_to_var NEW_TS_TEXT "create_teamspace" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_teamspace","arguments":{"name":"IntTest Space","description":"test"}},"id":2}'
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
run_capture_to_var DM_LIST_TEXT "list_direct_messages" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_direct_messages","arguments":{"limit":3}},"id":2}'
if [ -n "$HULY_EMAIL" ]; then
  SELF_EMAIL_JSON=$(json_string "$HULY_EMAIL")
  run_expect_error "create_direct_message(rejects_self)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_direct_message\",\"arguments\":{\"person\":$SELF_EMAIL_JSON}},\"id\":2}"
else
  skip_test "create_direct_message(rejects_self)" "HULY_EMAIL is not set"
fi
SELF_NAME=""
EMPLOYEES_FOR_DM_TEXT=""
USER_PROFILE_TEXT=""
if [ -n "$HULY_EMAIL" ]; then
  EMPLOYEES_FOR_DM_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_employees","arguments":{"limit":200}},"id":2}')
  if [ $? -eq 0 ]; then
    SELF_NAME=$(echo "$EMPLOYEES_FOR_DM_TEXT" | jq -r --arg email "$HULY_EMAIL" '[.[]? | select(.email == $email) | .name // empty] | unique | if length == 1 then .[0] else empty end' 2>/dev/null)
  else
    EMPLOYEES_FOR_DM_TEXT=""
  fi
fi
if [ -z "$SELF_NAME" ]; then
  USER_PROFILE_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_user_profile","arguments":{}},"id":2}')
  if [ $? -eq 0 ]; then
    SELF_NAME=$(echo "$USER_PROFILE_TEXT" | jq -r '[.name, ((.firstName // "") + " " + (.lastName // ""))] | map(select(type == "string") | gsub("^ +| +$"; "")) | map(select(. != "")) | .[0] // empty' 2>/dev/null)
  fi
fi
if [ -n "$SELF_NAME" ]; then
  EXISTING_DM_PERSON_NAME=$(echo "$DM_LIST_TEXT" | jq -r --arg self "$SELF_NAME" '.conversations[]? | select((.participantIds // [] | length) == 2 and (.participants // [] | length) == 2 and ((.participants // []) | index($self) != null)) | .participants[]? | select(. != $self)' 2>/dev/null | head -1)
  if [ -n "$EXISTING_DM_PERSON_NAME" ]; then
    EXISTING_DM_PERSON_JSON=$(json_string "$EXISTING_DM_PERSON_NAME")
    run_capture_to_var CREATE_DM_TEXT "create_direct_message(existing:$EXISTING_DM_PERSON_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_direct_message\",\"arguments\":{\"person\":$EXISTING_DM_PERSON_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "create_direct_message existing created=false" "$CREATE_DM_TEXT" ".created" "false"
    fi
  else
    skip_test "create_direct_message(existing)" "no existing one-to-one DM participant found"
  fi
else
  skip_test "create_direct_message(existing)" "could not determine current employee name"
fi
GROUP_DM_PEOPLE_JSON=""
GROUP_DM_ID=""
CHANNEL_MEMBER_CANDIDATE=""
if [ -n "$EMPLOYEES_FOR_DM_TEXT" ] && [ -n "$SELF_NAME" ]; then
  CHANNEL_MEMBER_CANDIDATE=$(echo "$EMPLOYEES_FOR_DM_TEXT" | jq -r --arg self "$SELF_NAME" '[.[]? | select((.name // "") != "" and .name != $self and .active != false) | .name] | sort | group_by(.) | map(select(length == 1) | .[0]) | .[0] // empty' 2>/dev/null)
  GROUP_DM_PEOPLE_JSON=$(echo "$EMPLOYEES_FOR_DM_TEXT" | jq -c --arg self "$SELF_NAME" '[.[]? | select((.name // "") != "" and .name != $self and .active != false) | .name] | sort | group_by(.) | map(select(length == 1) | .[0]) | .[:2]' 2>/dev/null)
fi
if [ "$(printf '%s\n' "$GROUP_DM_PEOPLE_JSON" | jq -r 'length // 0' 2>/dev/null)" = "2" ]; then
  run_capture_to_var GROUP_DM_TEXT "create_group_direct_message" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_group_direct_message\",\"arguments\":{\"people\":$GROUP_DM_PEOPLE_JSON}},\"id\":2}"
  if [ $? -eq 0 ]; then
    GROUP_DM_ID=$(echo "$GROUP_DM_TEXT" | jq -r '.id // empty' 2>/dev/null)
    assert_json_field_nonempty "create_group_direct_message returns id" "$GROUP_DM_TEXT" ".id"
    assert_json_field_count "create_group_direct_message has three members" "$GROUP_DM_TEXT" ".members | length" "3"

    GROUP_DM_REVERSED_JSON=$(printf '%s\n' "$GROUP_DM_PEOPLE_JSON" | jq -c 'reverse')
    run_capture_to_var GROUP_DM_EXISTING_TEXT "create_group_direct_message(existing reversed)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_group_direct_message\",\"arguments\":{\"people\":$GROUP_DM_REVERSED_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "create_group_direct_message existing created=false" "$GROUP_DM_EXISTING_TEXT" ".created" "false"
      if [ -n "$GROUP_DM_ID" ]; then
        assert_json_field_equals "create_group_direct_message existing same id" "$GROUP_DM_EXISTING_TEXT" ".id" "$GROUP_DM_ID"
      fi
    fi
  fi
else
  skip_test "create_group_direct_message" "need at least two non-self employees with unique exact names"
fi
DM_ID="${HULY_TEST_DM_ID:-}"
if [ -z "$DM_ID" ]; then
  DM_ID=$(echo "$DM_LIST_TEXT" | jq -r '.conversations[0].id // empty' 2>/dev/null)
fi
if [ -n "$DM_ID" ]; then
  run_test "list_dm_messages($DM_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_dm_messages\",\"arguments\":{\"dm\":\"$DM_ID\",\"limit\":3}},\"id\":2}"
  run_capture_to_var DM_MSG_TEXT "send_dm_message($DM_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"send_dm_message\",\"arguments\":{\"dm\":\"$DM_ID\",\"body\":\"IntTest DM msg $RUN_ID\"}},\"id\":2}"
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
CHANNEL_NAME="inttest-chan-$RUN_ID"
CHANNEL_NAME_JSON=$(json_string "$CHANNEL_NAME")
CHANNEL_NAME_REGEX_JSON=$(json_string "%$CHANNEL_NAME%")
CHANNEL_NAME_CASE_REGEX_JSON=$(json_string "%INTTEST-CHAN-$RUN_ID%")
run_capture_to_var CH_TEXT "create_channel" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_channel\",\"arguments\":{\"name\":$CHANNEL_NAME_JSON,\"topic\":\"test channel\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  CH_ID=$(echo "$CH_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => channel: $CH_ID"

  run_capture_to_var CH_MEMBERS_TEXT "list_channel_members($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_count "list_channel_members sees creator" "$CH_MEMBERS_TEXT" ".members | length" "1"
    assert_json_field_nonempty "list_channel_members returns accountUuid" "$CH_MEMBERS_TEXT" ".members[0].accountUuid"
  fi

  run_capture_to_var JOIN_TEXT "join_channel($CH_ID idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"join_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "join_channel existing member changed=false" "$JOIN_TEXT" ".changed" "false"
  fi

  if [ -n "$CHANNEL_MEMBER_CANDIDATE" ]; then
    CHANNEL_MEMBER_CANDIDATE_JSON=$(json_string "$CHANNEL_MEMBER_CANDIDATE")
    run_capture_to_var ADD_MEMBERS_TEXT "add_channel_members($CH_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\",\"members\":[$CHANNEL_MEMBER_CANDIDATE_JSON]}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "add_channel_members changed" "$ADD_MEMBERS_TEXT" ".changed" "true"
      assert_json_field_count "add_channel_members has two members" "$ADD_MEMBERS_TEXT" ".members | length" "2"
    fi

    run_capture_to_var ADD_MEMBERS_AGAIN_TEXT "add_channel_members($CH_ID idempotent)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\",\"members\":[$CHANNEL_MEMBER_CANDIDATE_JSON]}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "add_channel_members idempotent changed=false" "$ADD_MEMBERS_AGAIN_TEXT" ".changed" "false"
    fi

    run_capture_to_var REMOVE_MEMBERS_TEXT "remove_channel_members($CH_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\",\"members\":[$CHANNEL_MEMBER_CANDIDATE_JSON]}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "remove_channel_members changed" "$REMOVE_MEMBERS_TEXT" ".changed" "true"
      assert_json_field_count "remove_channel_members leaves creator" "$REMOVE_MEMBERS_TEXT" ".members | length" "1"
    fi
  else
    skip_test "add/remove_channel_members" "need a non-self employee with a unique exact name"
  fi

  run_expect_error "leave_channel($CH_ID rejects last owner)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"leave_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"

  run_capture_to_var STAR_TEXT "set_conversation_starred(channel:$CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_conversation_starred\",\"arguments\":{\"channel\":\"$CH_ID\",\"starred\":true}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_conversation_starred channel kind" "$STAR_TEXT" ".kind" "channel"
    assert_json_field_equals "set_conversation_starred channel starred" "$STAR_TEXT" ".starred" "true"
  fi

  run_capture_to_var STAR_AGAIN_TEXT "set_conversation_starred(channel:$CH_ID idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_conversation_starred\",\"arguments\":{\"channel\":\"$CH_ID\",\"starred\":true}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_conversation_starred idempotent changed=false" "$STAR_AGAIN_TEXT" ".changed" "false"
  fi

  run_capture_to_var ARCHIVE_TEXT "archive_channel($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "archive_channel archived" "$ARCHIVE_TEXT" ".archived" "true"
    assert_json_field_equals "archive_channel changed" "$ARCHIVE_TEXT" ".changed" "true"
  fi

  run_capture_to_var ARCHIVE_AGAIN_TEXT "archive_channel($CH_ID idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "archive_channel idempotent changed=false" "$ARCHIVE_AGAIN_TEXT" ".changed" "false"
  fi

  if [ -n "$CHANNEL_MEMBER_CANDIDATE" ]; then
    run_expect_error "add_channel_members($CH_ID archived rejects)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_channel_members\",\"arguments\":{\"channel\":\"$CH_ID\",\"members\":[$CHANNEL_MEMBER_CANDIDATE_JSON]}},\"id\":2}"
  fi

  run_capture_to_var UNARCHIVE_TEXT "unarchive_channel($CH_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unarchive_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "unarchive_channel archived=false" "$UNARCHIVE_TEXT" ".archived" "false"
    assert_json_field_equals "unarchive_channel changed" "$UNARCHIVE_TEXT" ".changed" "true"
  fi

  run_capture_to_var UNARCHIVE_AGAIN_TEXT "unarchive_channel($CH_ID idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unarchive_channel\",\"arguments\":{\"channel\":\"$CH_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "unarchive_channel idempotent changed=false" "$UNARCHIVE_AGAIN_TEXT" ".changed" "false"
  fi

  run_capture_to_var CH_REGEX_TEXT "list_channels(nameRegex SIMILAR TO contains)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_channels\",\"arguments\":{\"nameRegex\":$CHANNEL_NAME_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_contains "list_channels nameRegex SIMILAR TO contains includes channel" "$CH_REGEX_TEXT" "map(.id)" "$CH_ID"
  fi

  run_capture_to_var CH_REGEX_CASE_TEXT "list_channels(nameRegex case-sensitive miss)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_channels\",\"arguments\":{\"nameRegex\":$CHANNEL_NAME_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_not_contains "list_channels nameRegex is case-sensitive" "$CH_REGEX_CASE_TEXT" "map(.id)" "$CH_ID"
  fi

  # Send a channel message, then reply + reactions
  run_capture_to_var MSG_TEXT "send_channel_message($CHANNEL_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"send_channel_message\",\"arguments\":{\"channel\":\"$CH_ID\",\"body\":\"IntTest msg\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    MSG_ID=$(echo "$MSG_TEXT" | jq -r '.id' 2>/dev/null)
    echo "  => msg: $MSG_ID"

    # Thread replies
    run_capture_to_var REPLY_TEXT "add_thread_reply($MSG_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_thread_reply\",\"arguments\":{\"channel\":\"$CH_ID\",\"messageId\":\"$MSG_ID\",\"body\":\"IntTest reply\"}},\"id\":2}"
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
if [ -n "$GROUP_DM_ID" ]; then
  run_capture_to_var CLOSE_DM_TEXT "set_conversation_closed(dm:$GROUP_DM_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_conversation_closed\",\"arguments\":{\"dm\":\"$GROUP_DM_ID\",\"closed\":true}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_conversation_closed dm kind" "$CLOSE_DM_TEXT" ".kind" "direct_message"
    assert_json_field_equals "set_conversation_closed dm closed" "$CLOSE_DM_TEXT" ".closed" "true"
  fi

  run_capture_to_var REOPEN_DM_TEXT "set_conversation_closed(dm:$GROUP_DM_ID reopen)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_conversation_closed\",\"arguments\":{\"dm\":\"$GROUP_DM_ID\",\"closed\":false}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "set_conversation_closed dm reopened" "$REOPEN_DM_TEXT" ".closed" "false"
  fi
else
  skip_test "set_conversation_closed(dm)" "no group direct-message id available"
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
run_test "list_contact_channel_providers" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_contact_channel_providers","arguments":{}},"id":2}'

PERSON_FIRST_NAME="IntTest-$RUN_ID"
PERSON_EMAIL="inttest-$RUN_ID@test.local"
PERSON_FIRST_NAME_JSON=$(json_string "$PERSON_FIRST_NAME")
PERSON_EMAIL_JSON=$(json_string "$PERSON_EMAIL")
PERSON_PHONE="+1555$RUN_ID"
PERSON_PHONE_UPDATED="+1666$RUN_ID"
PERSON_PHONE_JSON=$(json_string "$PERSON_PHONE")
PERSON_PHONE_UPDATED_JSON=$(json_string "$PERSON_PHONE_UPDATED")
PERSON_NAME_REGEX_JSON=$(json_string "%$PERSON_FIRST_NAME%")
PERSON_NAME_CASE_REGEX_JSON=$(json_string "%inttest-$RUN_ID%")
run_capture_to_var PERSON_TEXT "create_person" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":$PERSON_FIRST_NAME_JSON,\"lastName\":\"Person\",\"email\":$PERSON_EMAIL_JSON}},\"id\":2}"
if [ $? -eq 0 ]; then
  PERSON_ID=$(echo "$PERSON_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => person: $PERSON_ID"
  run_capture_to_var PERSON_REGEX_TEXT "list_persons(nameRegex SIMILAR TO contains)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_persons\",\"arguments\":{\"nameRegex\":$PERSON_NAME_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_contains "list_persons nameRegex SIMILAR TO contains includes person" "$PERSON_REGEX_TEXT" "map(.id)" "$PERSON_ID"
  fi

  run_capture_to_var PERSON_REGEX_CASE_TEXT "list_persons(nameRegex case-sensitive miss)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_persons\",\"arguments\":{\"nameRegex\":$PERSON_NAME_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_array_not_contains "list_persons nameRegex is case-sensitive" "$PERSON_REGEX_CASE_TEXT" "map(.id)" "$PERSON_ID"
  fi
	  run_test "update_person($PERSON_ID)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_person\",\"arguments\":{\"personId\":\"$PERSON_ID\",\"city\":\"TestCity\"}},\"id\":2}"
	  run_capture_to_var PERSON_CHANNEL_TEXT "add_person_channel($PERSON_ID phone)" \
	    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_person_channel\",\"arguments\":{\"person\":\"$PERSON_ID\",\"provider\":\"phone\",\"value\":$PERSON_PHONE_JSON}},\"id\":2}"
	  if [ $? -eq 0 ]; then
	    PERSON_CHANNEL_ID=$(echo "$PERSON_CHANNEL_TEXT" | jq -r '.channel.channelId' 2>/dev/null)
	    assert_json_field_equals "add_person_channel added" "$PERSON_CHANNEL_TEXT" ".added" "true"
	    run_capture_to_var PERSON_CHANNEL_AGAIN_TEXT "add_person_channel($PERSON_ID phone idempotent)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_person_channel\",\"arguments\":{\"person\":\"$PERSON_ID\",\"provider\":\"phone\",\"value\":$PERSON_PHONE_JSON}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      assert_json_field_equals "add_person_channel idempotent added=false" "$PERSON_CHANNEL_AGAIN_TEXT" ".added" "false"
	    fi
	    run_capture_to_var PERSON_CHANNELS_TEXT "list_person_channels($PERSON_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_person_channels\",\"arguments\":{\"person\":\"$PERSON_ID\"}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      assert_json_array_contains "list_person_channels includes phone channel" "$PERSON_CHANNELS_TEXT" ".channels | map(.channelId)" "$PERSON_CHANNEL_ID"
	    fi
	    run_capture_to_var PERSON_GET_TEXT "get_person($PERSON_ID channels)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_person\",\"arguments\":{\"personId\":\"$PERSON_ID\"}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      assert_json_array_contains "get_person includes channelId" "$PERSON_GET_TEXT" ".channels | map(.channelId)" "$PERSON_CHANNEL_ID"
	    fi
	    run_test "update_person_channel($PERSON_CHANNEL_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_person_channel\",\"arguments\":{\"person\":\"$PERSON_ID\",\"channelId\":\"$PERSON_CHANNEL_ID\",\"newValue\":$PERSON_PHONE_UPDATED_JSON}},\"id\":2}"
	    run_test "remove_person_channel($PERSON_ID provider+value)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_person_channel\",\"arguments\":{\"person\":\"$PERSON_ID\",\"provider\":\"phone\",\"value\":$PERSON_PHONE_UPDATED_JSON}},\"id\":2}"
	  fi
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
ORG_CHANNEL_UPDATED_EMAIL="org-updated-$ORG_SUFFIX@test.local"

run_capture_to_var ORG_PERSON_TEXT "create_person(for_org)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_person\",\"arguments\":{\"firstName\":\"Org\",\"lastName\":\"Member\",\"email\":\"$ORG_MEMBER_EMAIL\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  ORG_PERSON_ID=$(echo "$ORG_PERSON_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => org person: $ORG_PERSON_ID"

  ORG_NAME_JSON=$(json_string "$ORG_NAME")
  ORG_UPDATED_NAME_JSON=$(json_string "$ORG_UPDATED_NAME")
  ORG_DESC_JSON=$(json_string "$ORG_DESC")
  ORG_MEMBER_EMAIL_JSON=$(json_string "$ORG_MEMBER_EMAIL")
	  ORG_CHANNEL_EMAIL_JSON=$(json_string "$ORG_CHANNEL_EMAIL")
	  ORG_CHANNEL_UPDATED_EMAIL_JSON=$(json_string "$ORG_CHANNEL_UPDATED_EMAIL")

  run_expect_error "create_organization(rejects_missing_member)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_organization\",\"arguments\":{\"name\":\"IntTest Missing Member $ORG_SUFFIX\",\"members\":[\"missing-$ORG_SUFFIX@test.local\"]}},\"id\":2}"

  run_capture_to_var ORG_TEXT "create_organization" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_organization\",\"arguments\":{\"name\":$ORG_NAME_JSON,\"members\":[$ORG_MEMBER_EMAIL_JSON]}},\"id\":2}"
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
	    run_capture_to_var ORG_CHANNEL_TEXT "add_organization_channel($ORG_ID)" \
	      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_organization_channel\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"provider\":\"email\",\"value\":$ORG_CHANNEL_EMAIL_JSON}},\"id\":2}"
	    if [ $? -eq 0 ]; then
	      ORG_CHANNEL_ID=$(echo "$ORG_CHANNEL_TEXT" | jq -r '.channel.channelId' 2>/dev/null)
	      assert_json_field_equals "add_organization_channel added" "$ORG_CHANNEL_TEXT" ".added" "true"
	      run_capture_to_var ORG_CHANNEL_AGAIN_TEXT "add_organization_channel($ORG_ID idempotent)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_organization_channel\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"provider\":\"email\",\"value\":$ORG_CHANNEL_EMAIL_JSON}},\"id\":2}"
	      if [ $? -eq 0 ]; then
	        assert_json_field_equals "add_organization_channel idempotent added=false" "$ORG_CHANNEL_AGAIN_TEXT" ".added" "false"
	      fi
	      run_capture_to_var ORG_CHANNELS_TEXT "list_organization_channels($ORG_ID)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_organization_channels\",\"arguments\":{\"organizationId\":\"$ORG_ID\"}},\"id\":2}"
	      if [ $? -eq 0 ]; then
	        assert_json_array_contains "list_organization_channels includes email channel" "$ORG_CHANNELS_TEXT" ".channels | map(.channelId)" "$ORG_CHANNEL_ID"
	      fi
	      run_capture_to_var ORG_GET_TEXT "get_organization($ORG_ID channels)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_organization\",\"arguments\":{\"identifier\":\"$ORG_ID\"}},\"id\":2}"
	      if [ $? -eq 0 ]; then
	        assert_json_array_contains "get_organization includes channelId" "$ORG_GET_TEXT" ".channels | map(.channelId)" "$ORG_CHANNEL_ID"
	      fi
	      run_test "update_organization_channel($ORG_CHANNEL_ID)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_organization_channel\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"channelId\":\"$ORG_CHANNEL_ID\",\"newValue\":$ORG_CHANNEL_UPDATED_EMAIL_JSON}},\"id\":2}"
	      run_test "remove_organization_channel($ORG_ID provider+value)" \
	        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_organization_channel\",\"arguments\":{\"organizationId\":\"$ORG_ID\",\"provider\":\"email\",\"value\":$ORG_CHANNEL_UPDATED_EMAIL_JSON}},\"id\":2}"
	    fi
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
run_capture_to_var CALENDARS_TEXT "list_calendars" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_calendars","arguments":{}},"id":2}'
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
run_capture_to_var EVT_TEXT "create_event" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"create_event","arguments":{"title":"IntTest Event","date":1777000000000,"dueDate":1777003600000}},"id":2}'
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
  run_capture_to_var EXPLICIT_EVT_TEXT "create_event(explicit_calendar)" "$EXPLICIT_EVT_PAYLOAD"
  if [ $? -eq 0 ]; then
    EXPLICIT_EVT_ID=$(echo "$EXPLICIT_EVT_TEXT" | jq -r '.eventId' 2>/dev/null)
    echo "  => explicit calendar event: $EXPLICIT_EVT_ID"
    if [ -n "$EXPLICIT_EVT_ID" ] && [ "$EXPLICIT_EVT_ID" != "null" ]; then
      run_capture_to_var GET_EXPLICIT_EVT_TEXT "get_event(explicit_calendar:$EXPLICIT_EVT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_event\",\"arguments\":{\"eventId\":\"$EXPLICIT_EVT_ID\"}},\"id\":2}"
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

# Planner ToDo lifecycle + work slots
TODO_TITLE="IntTest Planner Todo $RUN_ID"
TODO_TITLE_JSON=$(json_string "$TODO_TITLE")
run_capture_to_var TODO_TEXT "create_todo(personal)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_todo\",\"arguments\":{\"title\":$TODO_TITLE_JSON,\"description\":\"planner integration todo\",\"priority\":\"medium\",\"visibility\":\"private\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  TODO_ID=$(echo "$TODO_TEXT" | jq -r '.todoId // empty' 2>/dev/null)
  echo "  => todo: $TODO_ID"
  if [ -n "$TODO_ID" ]; then
    run_capture_to_var LIST_TODOS_TEXT "list_todos($TODO_TITLE)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_todos\",\"arguments\":{\"titleSearch\":$TODO_TITLE_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_todos includes $TODO_ID" "$LIST_TODOS_TEXT" "map(.id)" "$TODO_ID"
    fi
    run_capture_to_var GET_TODO_TEXT "get_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_todo($TODO_ID) returns id" "$GET_TODO_TEXT" ".id" "$TODO_ID"
      assert_json_field_equals "get_todo($TODO_ID) priority before update" "$GET_TODO_TEXT" ".priority" "medium"
    fi
    run_capture_to_var UPDATE_TODO_TEXT "update_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"priority\":\"high\",\"dueDate\":1777020000000}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "update_todo($TODO_ID) updated" "$UPDATE_TODO_TEXT" ".updated" "true"
      run_capture_to_var GET_UPDATED_TODO_TEXT "get_todo($TODO_ID after update)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_todo($TODO_ID) priority after update" "$GET_UPDATED_TODO_TEXT" ".priority" "high"
        assert_json_field_equals "get_todo($TODO_ID) dueDate after update" "$GET_UPDATED_TODO_TEXT" ".dueDate" "1777020000000"
      fi
    fi

    run_capture_to_var SCHEDULE_TEXT "schedule_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"schedule_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"date\":1777020000000,\"dueDate\":1777023600000}},\"id\":2}"
    SCHEDULE_SLOT_ID=$(echo "$SCHEDULE_TEXT" | jq -r '.workSlotId // empty' 2>/dev/null)
    if [ -n "$SCHEDULE_SLOT_ID" ]; then
      run_capture_to_var UNSCHEDULE_SLOT_TEXT "unschedule_todo(workSlotId:$SCHEDULE_SLOT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unschedule_todo\",\"arguments\":{\"workSlotId\":\"$SCHEDULE_SLOT_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "unschedule_todo(workSlotId:$SCHEDULE_SLOT_ID) removed one" "$UNSCHEDULE_SLOT_TEXT" ".removed" "1"
      fi
    else
      skip_test "unschedule_todo(workSlotId)" "schedule_todo did not return a workSlotId"
    fi

    run_capture_to_var RAW_SLOT_TEXT "schedule_todo(raw_id:$TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"schedule_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"date\":1777027200000,\"dueDate\":1777030800000}},\"id\":2}"
    RAW_SLOT_ID=$(echo "$RAW_SLOT_TEXT" | jq -r '.workSlotId // empty' 2>/dev/null)
    if [ -n "$RAW_SLOT_ID" ]; then
      run_capture_to_var UNSCHEDULE_RAW_SLOT_TEXT "unschedule_todo(raw_workSlotId:$RAW_SLOT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unschedule_todo\",\"arguments\":{\"workSlotId\":\"$RAW_SLOT_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "unschedule_todo(raw_workSlotId:$RAW_SLOT_ID) removed one" "$UNSCHEDULE_RAW_SLOT_TEXT" ".removed" "1"
      fi
    else
      skip_test "unschedule_todo(raw_workSlotId)" "schedule_todo raw-id locator did not return a workSlotId"
    fi

    run_capture_to_var SCHEDULE_SCOPE_TEXT "schedule_todo(scope_cleanup:$TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"schedule_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"date\":1777034400000,\"dueDate\":1777038000000}},\"id\":2}"
    SCHEDULE_SCOPE_SLOT_ID=$(echo "$SCHEDULE_SCOPE_TEXT" | jq -r '.workSlotId // empty' 2>/dev/null)
    if [ -n "$SCHEDULE_SCOPE_SLOT_ID" ]; then
      run_capture_to_var UNSCHEDULE_SCOPE_TEXT "unschedule_todo(scope_all:$TODO_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unschedule_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"scope\":\"all\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "unschedule_todo(scope_all:$TODO_ID) removed one" "$UNSCHEDULE_SCOPE_TEXT" ".removed" "1"
      fi
    else
      skip_test "unschedule_todo(scope_all)" "schedule_todo did not return a workSlotId"
    fi

    run_capture_to_var COMPLETE_TODO_TEXT "complete_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"complete_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"},\"doneOn\":1777040000000}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "complete_todo($TODO_ID) updated" "$COMPLETE_TODO_TEXT" ".updated" "true"
      sleep 1
      run_capture_to_var GET_COMPLETED_TODO_TEXT "get_todo($TODO_ID completed)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_todo($TODO_ID) doneOn after complete" "$GET_COMPLETED_TODO_TEXT" ".doneOn" "1777040000000"
      fi
    fi
    run_capture_to_var REOPEN_TODO_TEXT "reopen_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"reopen_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "reopen_todo($TODO_ID) updated" "$REOPEN_TODO_TEXT" ".updated" "true"
      sleep 1
      run_capture_to_var GET_REOPENED_TODO_TEXT "get_todo($TODO_ID reopened)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_todo($TODO_ID) doneOn after reopen" "$GET_REOPENED_TODO_TEXT" ".doneOn" "null"
      fi
    fi
    run_capture_to_var DELETE_TODO_TEXT "delete_todo($TODO_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$TODO_ID\"}}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "delete_todo($TODO_ID) deleted" "$DELETE_TODO_TEXT" ".deleted" "true"
    fi
  else
    skip_test "planner_todo_lifecycle" "create_todo did not return a todoId"
  fi
fi

PLANNER_ISSUE_TITLE="Planner Attached ToDo $RUN_ID"
PLANNER_ISSUE_TITLE_JSON=$(json_string "$PLANNER_ISSUE_TITLE")
run_capture_to_var PLANNER_ISSUE_TEXT "create_issue(for_planner_todo)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":$PLANNER_ISSUE_TITLE_JSON}},\"id\":2}"
if [ $? -eq 0 ]; then
  PLANNER_ISSUE_ID=$(echo "$PLANNER_ISSUE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
  if [ -n "$PLANNER_ISSUE_ID" ]; then
    ISSUE_TODO_TITLE="IntTest Issue Planner Todo $RUN_ID"
    ISSUE_TODO_TITLE_JSON=$(json_string "$ISSUE_TODO_TITLE")
    run_capture_to_var ISSUE_TODO_TEXT "create_todo(issue:$PLANNER_ISSUE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_todo\",\"arguments\":{\"title\":$ISSUE_TODO_TITLE_JSON,\"attachedTo\":{\"type\":\"issue\",\"project\":\"$PROJECT\",\"identifier\":\"$PLANNER_ISSUE_ID\"}}},\"id\":2}"
    ISSUE_TODO_ID=$(echo "$ISSUE_TODO_TEXT" | jq -r '.todoId // empty' 2>/dev/null)
    if [ -n "$ISSUE_TODO_ID" ]; then
      run_capture_to_var ISSUE_TODO_GET_TEXT "get_todo(issue:$ISSUE_TODO_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$ISSUE_TODO_ID\"}}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "get_todo(issue:$ISSUE_TODO_ID) attached type" "$ISSUE_TODO_GET_TEXT" ".attachedTo.type" "issue"
        assert_json_field_equals "get_todo(issue:$ISSUE_TODO_ID) attached identifier" "$ISSUE_TODO_GET_TEXT" ".attachedTo.identifier" "$PLANNER_ISSUE_ID"
        assert_json_field_equals "get_todo(issue:$ISSUE_TODO_ID) default visibility" "$ISSUE_TODO_GET_TEXT" ".visibility" "public"
      fi
      run_capture_to_var ISSUE_TODO_LIST_TEXT "list_todos(issue:$PLANNER_ISSUE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_todos\",\"arguments\":{\"issue\":{\"project\":\"$PROJECT\",\"identifier\":\"$PLANNER_ISSUE_ID\"},\"limit\":10}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_array_contains "list_todos(issue:$PLANNER_ISSUE_ID) includes issue todo" "$ISSUE_TODO_LIST_TEXT" "map(.id)" "$ISSUE_TODO_ID"
      fi
      run_test "delete_issue(planner_todo:$PLANNER_ISSUE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$PLANNER_ISSUE_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        run_expect_error "get_todo(issue:$ISSUE_TODO_ID after issue delete)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_todo\",\"arguments\":{\"locator\":{\"todoId\":\"$ISSUE_TODO_ID\"}}},\"id\":2}"
      fi
    else
      skip_test "issue_planner_todo_lifecycle" "create_todo did not return a todoId"
    fi
  else
    skip_test "issue_planner_todo_lifecycle" "create_issue did not return an identifier"
  fi
fi

# Timer — requires project + issue identifier
run_capture_to_var TIMER_ISSUE_TEXT "create_issue(for_timer)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Timer Test\"}},\"id\":2}"
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
run_test "list_notification_contexts(includeHidden)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notification_contexts","arguments":{"limit":3,"includeHidden":true}},"id":2}'
run_test "list_notification_settings" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notification_settings","arguments":{}},"id":2}'
# mark_all_notifications_read, archive_all_notifications, delete_notification,
# update_notification_provider_setting — all require existing notifications, skipped if none
NOTIF_TEXT=$(run_capture_only \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_notifications","arguments":{"limit":1}},"id":2}')
NOTIF_ID=$(echo "$NOTIF_TEXT" | jq -r '.[0].id // .notifications[0].id // empty' 2>/dev/null)
if [ -n "$NOTIF_ID" ]; then
  run_capture_to_var GET_NOTIF_TEXT "get_notification($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_notification\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"

  ORIGINAL_VIEWED=$(echo "$GET_NOTIF_TEXT" | jq -r '.isViewed // empty' 2>/dev/null)
  DOC_CONTEXT_ID=$(echo "$GET_NOTIF_TEXT" | jq -r '.docNotifyContextId // empty' 2>/dev/null)
  NOTIF_OBJECT_ID=$(echo "$GET_NOTIF_TEXT" | jq -r '.objectId // empty' 2>/dev/null)
  NOTIF_OBJECT_CLASS=$(echo "$GET_NOTIF_TEXT" | jq -r '.objectClass // empty' 2>/dev/null)

  run_test "mark_notification_unread($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"mark_notification_unread\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  run_test "mark_notification_read($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"mark_notification_read\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  if [ "$ORIGINAL_VIEWED" = "false" ]; then
    run_test "mark_notification_unread($NOTIF_ID restore)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"mark_notification_unread\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  fi

  run_test "archive_notification($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"archive_notification\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"
  run_test "unarchive_notification($NOTIF_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"unarchive_notification\",\"arguments\":{\"notificationId\":\"$NOTIF_ID\"}},\"id\":2}"

  if [ -n "$NOTIF_OBJECT_ID" ] && [ -n "$NOTIF_OBJECT_CLASS" ]; then
    NOTIF_OBJECT_ID_JSON=$(json_string "$NOTIF_OBJECT_ID")
    NOTIF_OBJECT_CLASS_JSON=$(json_string "$NOTIF_OBJECT_CLASS")
    run_capture_to_var CONTEXT_TEXT "get_notification_context($NOTIF_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_notification_context\",\"arguments\":{\"objectId\":$NOTIF_OBJECT_ID_JSON,\"objectClass\":$NOTIF_OBJECT_CLASS_JSON}},\"id\":2}"
    CONTEXT_ID=$(echo "$CONTEXT_TEXT" | jq -r '.id // empty' 2>/dev/null)
    ORIGINAL_PINNED=$(echo "$CONTEXT_TEXT" | jq -r '.isPinned // empty' 2>/dev/null)
    ORIGINAL_HIDDEN=$(echo "$CONTEXT_TEXT" | jq -r '.hidden // empty' 2>/dev/null)
    if [ -n "$CONTEXT_ID" ]; then
      if [ "$ORIGINAL_PINNED" = "true" ]; then
        run_test "pin_notification_context($CONTEXT_ID unpin)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"pinned\":false}},\"id\":2}"
        run_test "pin_notification_context($CONTEXT_ID restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"pinned\":true}},\"id\":2}"
      else
        run_test "pin_notification_context($CONTEXT_ID pin)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"pinned\":true}},\"id\":2}"
        run_test "pin_notification_context($CONTEXT_ID restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"pin_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"pinned\":false}},\"id\":2}"
      fi

      if [ "$ORIGINAL_HIDDEN" = "true" ]; then
        run_test "hide_notification_context($CONTEXT_ID unhide)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"hide_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"hidden\":false}},\"id\":2}"
        run_test "hide_notification_context($CONTEXT_ID restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"hide_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"hidden\":true}},\"id\":2}"
      else
        run_test "hide_notification_context($CONTEXT_ID hide)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"hide_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"hidden\":true}},\"id\":2}"
        run_test "hide_notification_context($CONTEXT_ID restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"hide_notification_context\",\"arguments\":{\"contextId\":\"$CONTEXT_ID\",\"hidden\":false}},\"id\":2}"
      fi
    else
      skip_test "pin_notification_context" "notification context not found"
      skip_test "hide_notification_context" "notification context not found"
    fi
  elif [ -n "$DOC_CONTEXT_ID" ]; then
    skip_test "get_notification_context" "notification missing object locator"
    skip_test "pin_notification_context" "notification missing object locator"
    skip_test "hide_notification_context" "notification missing object locator"
  else
    skip_test "get_notification_context" "notification has no context"
    skip_test "pin_notification_context" "notification has no context"
    skip_test "hide_notification_context" "notification has no context"
  fi

  skip_test "mark_all_notifications_read" "would clear all notifications"
  skip_test "archive_all_notifications" "would archive all"
  skip_test "delete_notification" "requires notification ID"
  skip_test "update_notification_provider_setting" "would modify settings"
else
  skip_test "get_notification" "no notifications"
  skip_test "mark_notification_read" "no notifications"
  skip_test "mark_notification_unread" "no notifications"
  skip_test "mark_all_notifications_read" "no notifications"
  skip_test "archive_notification" "no notifications"
  skip_test "unarchive_notification" "no notifications"
  skip_test "archive_all_notifications" "no notifications"
  skip_test "delete_notification" "no notifications"
  skip_test "get_notification_context" "no notifications"
  skip_test "pin_notification_context" "no notifications"
  skip_test "hide_notification_context" "no notifications"
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
# 13a. SDK DISCOVERY
##############################
echo "=== 13a. SDK Discovery ==="
run_capture_to_var SDK_CLASSES_TEXT "list_huly_classes(issue)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_classes","arguments":{"query":"Issue","limit":10}},"id":2}'
if [ $? -eq 0 ]; then
  if printf '%s\n' "$SDK_CLASSES_TEXT" | jq -e 'any(.classes[]?; .classId == "tracker:class:Issue" and .label == "Issue")' >/dev/null 2>&1; then
    echo "PASS: list_huly_classes includes tracker issue"
    PASSED=$((PASSED + 1))
  else
    fail_test "list_huly_classes includes tracker issue" "tracker:class:Issue missing"
  fi
fi

run_capture_to_var SDK_CLASS_TEXT "get_huly_class(tracker:class:Issue)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_huly_class","arguments":{"class":"tracker:class:Issue"}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_equals "get_huly_class returns issue class" "$SDK_CLASS_TEXT" ".class.classId" "tracker:class:Issue"
  assert_json_field_nonempty "get_huly_class returns attributes" "$SDK_CLASS_TEXT" ".attributes[0].attributeId"
  if printf '%s\n' "$SDK_CLASS_TEXT" | jq -e 'any(.attributes[]?; .inherited == true)' >/dev/null 2>&1; then
    echo "PASS: get_huly_class returns inherited attributes"
    PASSED=$((PASSED + 1))
  else
    fail_test "get_huly_class returns inherited attributes" "no inherited attributes returned"
  fi
  if printf '%s\n' "$SDK_CLASS_TEXT" | jq -e 'any(.class.firstClassToolHints[]?; .category == "issues" and any(.exampleTools[]?; . == "get_issue"))' >/dev/null 2>&1; then
    echo "PASS: get_huly_class returns first-class tool hints"
    PASSED=$((PASSED + 1))
  else
    fail_test "get_huly_class returns first-class tool hints" "issues tool hint missing"
  fi
fi

run_capture_to_var SDK_ATTRIBUTES_TEXT "list_huly_attributes(issue)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_attributes","arguments":{"class":"tracker:class:Issue","limit":5}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_huly_attributes returns attribute id" "$SDK_ATTRIBUTES_TEXT" ".attributes[0].attributeId"
fi

run_capture_to_var SDK_ENUMS_TEXT "list_huly_enums" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_enums","arguments":{"limit":5}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_huly_enums returns total" "$SDK_ENUMS_TEXT" ".total"
fi
echo ""

##############################
# 13b. SPACES
##############################
echo "=== 13b. Spaces ==="
run_capture_to_var SPACES_TEXT "list_spaces" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_spaces","arguments":{"limit":5}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_spaces returns total" "$SPACES_TEXT" ".total"
  FIRST_SPACE_ID=$(echo "$SPACES_TEXT" | jq -r '.spaces[0].id // empty' 2>/dev/null)
  if [ -n "$FIRST_SPACE_ID" ]; then
    run_test "get_space($FIRST_SPACE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$FIRST_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"
  fi
fi

run_capture_to_var SPACE_TYPES_TEXT "list_space_types" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_space_types","arguments":{"limit":50}},"id":2}'
if [ $? -eq 0 ]; then
  assert_json_field_nonempty "list_space_types returns total" "$SPACE_TYPES_TEXT" ".total"
  FIRST_SPACE_TYPE_ID=$(echo "$SPACE_TYPES_TEXT" | jq -r '.spaceTypes[0].id // empty' 2>/dev/null)
  if [ -n "$FIRST_SPACE_TYPE_ID" ]; then
    run_test "get_space_type($FIRST_SPACE_TYPE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space_type\",\"arguments\":{\"spaceType\":\"$FIRST_SPACE_TYPE_ID\"}},\"id\":2}"
  else
    skip_test "get_space_type" "no space types found"
  fi
fi

run_test "list_space_permissions" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_space_permissions","arguments":{"limit":5}},"id":2}'

ROLE_SPACE_FIXTURE=""
if [ -n "$SPACE_TYPES_TEXT" ]; then
  while IFS=$'\t' read -r ROLE_SPACE_TYPE_CANDIDATE _role_count; do
    if [ -z "$ROLE_SPACE_TYPE_CANDIDATE" ]; then
      continue
    fi
    ROLE_SPACE_TYPE_CANDIDATE_JSON=$(json_string "$ROLE_SPACE_TYPE_CANDIDATE")
    ROLE_SPACE_CANDIDATES_TEXT=$(run_capture_only \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_spaces\",\"arguments\":{\"type\":$ROLE_SPACE_TYPE_CANDIDATE_JSON,\"includeArchived\":true,\"limit\":10}},\"id\":2}")
    if [ -z "$ROLE_SPACE_CANDIDATES_TEXT" ]; then
      continue
    fi
    ROLE_SPACE_CANDIDATE=$(printf '%s\n' "$ROLE_SPACE_CANDIDATES_TEXT" | jq -r \
      '.spaces[]? | select(.archived == false and ((.membersCount // 0) > 0)) | .id' 2>/dev/null | head -n 1)
    if [ -n "$ROLE_SPACE_CANDIDATE" ]; then
      ROLE_SPACE_FIXTURE="${ROLE_SPACE_TYPE_CANDIDATE}"$'\t'"${ROLE_SPACE_CANDIDATE}"
      break
    fi
  done < <(printf '%s\n' "$SPACE_TYPES_TEXT" | jq -r '.spaceTypes[]? | select((.rolesCount // 0) > 0) | [.id, .rolesCount] | @tsv' 2>/dev/null)
fi

if [ -n "$ROLE_SPACE_FIXTURE" ]; then
  ROLE_SPACE_TYPE_ID=$(printf '%s\n' "$ROLE_SPACE_FIXTURE" | cut -f1)
  ROLE_SPACE_ID=$(printf '%s\n' "$ROLE_SPACE_FIXTURE" | cut -f2)
  ROLE_SPACE_TYPE_ID_JSON=$(json_string "$ROLE_SPACE_TYPE_ID")
  ROLE_SPACE_ID_JSON=$(json_string "$ROLE_SPACE_ID")

  if run_capture_to_var ROLE_SPACE_TYPE_TEXT "get_space_type($ROLE_SPACE_TYPE_ID role fixture)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space_type\",\"arguments\":{\"spaceType\":$ROLE_SPACE_TYPE_ID_JSON}},\"id\":2}" \
    && run_capture_to_var ROLE_SPACE_DETAIL_TEXT "get_space($ROLE_SPACE_ID role fixture)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
    ROLE_ID=$(printf '%s\n' "$ROLE_SPACE_TYPE_TEXT" | jq -r '.roles[0].id // empty' 2>/dev/null)
    ROLE_MEMBER_CANDIDATE=$(printf '%s\n' "$ROLE_SPACE_DETAIL_TEXT" | jq -r '.members[0] // empty' 2>/dev/null)
    if [ -n "$ROLE_ID" ] && [ -n "$ROLE_MEMBER_CANDIDATE" ]; then
      ROLE_ID_JSON=$(json_string "$ROLE_ID")
      ROLE_MEMBER_CANDIDATE_JSON=$(json_string "$ROLE_MEMBER_CANDIDATE")
      ROLE_MEMBER_SINGLETON_JSON=$(jq -cn --arg member "$ROLE_MEMBER_CANDIDATE" '[$member]')
      INITIAL_ROLE_MEMBERS_JSON=$(printf '%s\n' "$ROLE_SPACE_DETAIL_TEXT" | jq -c --arg role_id "$ROLE_ID" \
        '(.roleAssignments // []) | map(select(.roleId == $role_id)) | first | .members // [] | sort' 2>/dev/null)
      if [ -z "$INITIAL_ROLE_MEMBERS_JSON" ]; then
        INITIAL_ROLE_MEMBERS_JSON="[]"
      fi

      if run_capture_to_var SET_ROLE_MEMBERS_TEXT "set_space_role_members($ROLE_SPACE_ID,$ROLE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_role_members\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"role\":$ROLE_ID_JSON,\"members\":$ROLE_MEMBER_SINGLETON_JSON}},\"id\":2}"; then
        assert_json_array_same_set "set_space_role_members returns requested members" "$SET_ROLE_MEMBERS_TEXT" ".members // []" "$ROLE_MEMBER_SINGLETON_JSON"
        sleep 2
        if run_capture_to_var SET_ROLE_MEMBERS_PERSISTED_TEXT "get_space($ROLE_SPACE_ID after set_space_role_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
          assert_json_role_members_same_set "get_space sees set_space_role_members persisted" "$SET_ROLE_MEMBERS_PERSISTED_TEXT" "$ROLE_ID" "$ROLE_MEMBER_SINGLETON_JSON"
        fi
      fi

      if run_capture_to_var ADD_ROLE_MEMBERS_TEXT "add_space_role_members($ROLE_SPACE_ID,$ROLE_ID idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_space_role_members\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"role\":$ROLE_ID_JSON,\"members\":[$ROLE_MEMBER_CANDIDATE_JSON]}},\"id\":2}"; then
        assert_json_array_contains "add_space_role_members returns candidate" "$ADD_ROLE_MEMBERS_TEXT" ".members // []" "$ROLE_MEMBER_CANDIDATE"
        sleep 2
        if run_capture_to_var ADD_ROLE_MEMBERS_PERSISTED_TEXT "get_space($ROLE_SPACE_ID after add_space_role_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
          assert_json_role_members_contains "get_space sees add_space_role_members persisted" "$ADD_ROLE_MEMBERS_PERSISTED_TEXT" "$ROLE_ID" "$ROLE_MEMBER_CANDIDATE"
        fi
      fi

      if run_capture_to_var REMOVE_ROLE_MEMBERS_TEXT "remove_space_role_members($ROLE_SPACE_ID,$ROLE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_space_role_members\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"role\":$ROLE_ID_JSON,\"members\":[$ROLE_MEMBER_CANDIDATE_JSON]}},\"id\":2}"; then
        assert_json_array_not_contains "remove_space_role_members removes candidate" "$REMOVE_ROLE_MEMBERS_TEXT" ".members // []" "$ROLE_MEMBER_CANDIDATE"
        sleep 2
        if run_capture_to_var REMOVE_ROLE_MEMBERS_PERSISTED_TEXT "get_space($ROLE_SPACE_ID after remove_space_role_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
          assert_json_role_members_not_contains "get_space sees remove_space_role_members persisted" "$REMOVE_ROLE_MEMBERS_PERSISTED_TEXT" "$ROLE_ID" "$ROLE_MEMBER_CANDIDATE"
        fi
      fi

      if run_test "set_space_role_members($ROLE_SPACE_ID,$ROLE_ID restore)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_role_members\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"role\":$ROLE_ID_JSON,\"members\":$INITIAL_ROLE_MEMBERS_JSON}},\"id\":2}"; then
        sleep 2
        if run_capture_to_var ROLE_MEMBERS_RESTORE_PERSISTED_TEXT "get_space($ROLE_SPACE_ID after role restore)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":$ROLE_SPACE_ID_JSON,\"includeArchived\":true}},\"id\":2}"; then
          assert_json_role_members_same_set "get_space sees set_space_role_members restore persisted" "$ROLE_MEMBERS_RESTORE_PERSISTED_TEXT" "$ROLE_ID" "$INITIAL_ROLE_MEMBERS_JSON"
        fi
      fi
    else
      skip_test "set/add/remove_space_role_members" "role fixture missing role or member candidate"
    fi
  else
    skip_test "set/add/remove_space_role_members" "could not load typed role fixture"
  fi
else
  skip_test "set/add/remove_space_role_members" "no typed space with roles and members found"
fi

GENERIC_SPACE_NAME="IntTest Generic Space $RUN_ID"
GENERIC_SPACE_UPDATED_NAME="IntTest Generic Space Updated $RUN_ID"
GENERIC_SPACE_NAME_JSON=$(json_string "$GENERIC_SPACE_NAME")
GENERIC_SPACE_UPDATED_NAME_JSON=$(json_string "$GENERIC_SPACE_UPDATED_NAME")
run_capture_to_var GENERIC_SPACE_TEXT "create_teamspace(for_generic_space)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_teamspace\",\"arguments\":{\"name\":$GENERIC_SPACE_NAME_JSON,\"description\":\"generic spaces integration fixture\",\"private\":false}},\"id\":2}"
if [ $? -eq 0 ]; then
  GENERIC_SPACE_ID=$(echo "$GENERIC_SPACE_TEXT" | jq -r '.id' 2>/dev/null)
  echo "  => generic_space_fixture: $GENERIC_SPACE_ID"
  run_capture_to_var GENERIC_SPACE_GET_TEXT "get_space($GENERIC_SPACE_ID fixture)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"

  run_test "update_space($GENERIC_SPACE_ID metadata)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"name\":$GENERIC_SPACE_UPDATED_NAME_JSON,\"description\":\"generic spaces integration updated\",\"private\":true}},\"id\":2}"
  sleep 2
  run_capture_to_var UPDATED_TEAMSPACE_TEXT "get_teamspace($GENERIC_SPACE_ID after update_space)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_teamspace\",\"arguments\":{\"teamspace\":\"$GENERIC_SPACE_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "get_teamspace sees update_space name" "$UPDATED_TEAMSPACE_TEXT" ".name" "$GENERIC_SPACE_UPDATED_NAME"
    assert_json_field_equals "get_teamspace sees update_space private" "$UPDATED_TEAMSPACE_TEXT" ".private" "true"
  fi
  run_test "update_space($GENERIC_SPACE_ID restore public)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"private\":false}},\"id\":2}"
  sleep 1

  MEMBERS_TEXT=$(run_capture_only \
    '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_workspace_members","arguments":{"limit":20}},"id":2}')
  if [ -n "$MEMBERS_TEXT" ] && [ -n "$GENERIC_SPACE_GET_TEXT" ]; then
    INITIAL_OWNERS_JSON=$(printf '%s\n' "$GENERIC_SPACE_GET_TEXT" | jq -c '.owners // []' 2>/dev/null)
    INITIAL_OWNER_COUNT=$(printf '%s\n' "$INITIAL_OWNERS_JSON" | jq -r 'length' 2>/dev/null)
    GENERIC_MEMBER_CANDIDATE=$(jq -nr \
      --argjson members "$MEMBERS_TEXT" \
      --argjson space "$GENERIC_SPACE_GET_TEXT" \
      '$members[]?.personId as $person | select((($space.members // []) | index($person) | not) and (($space.owners // []) | index($person) | not)) | $person' \
      2>/dev/null | head -n 1)
    if [ -n "$GENERIC_MEMBER_CANDIDATE" ]; then
      GENERIC_MEMBER_JSON=$(json_string "$GENERIC_MEMBER_CANDIDATE")
      run_capture_to_var ADD_MEMBERS_TEXT "add_space_members($GENERIC_SPACE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_space_members\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"members\":[$GENERIC_MEMBER_JSON]}},\"id\":2}"
      if [ $? -eq 0 ]; then
        if printf '%s\n' "$ADD_MEMBERS_TEXT" | jq -e --arg member "$GENERIC_MEMBER_CANDIDATE" 'any(.members[]?; . == $member)' >/dev/null 2>&1; then
          echo "PASS: add_space_members includes candidate"
          PASSED=$((PASSED + 1))
        else
          fail_test "add_space_members includes candidate" "member not returned after add"
        fi
        sleep 2
        if run_capture_to_var ADD_MEMBERS_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after add_space_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
          assert_json_array_contains "get_space sees add_space_members persisted" "$ADD_MEMBERS_PERSISTED_TEXT" ".members // []" "$GENERIC_MEMBER_CANDIDATE"
        fi
      fi

      if [ "${INITIAL_OWNER_COUNT:-0}" -gt 0 ]; then
        OWNER_ARGS_JSON=$(printf '%s\n' "$INITIAL_OWNERS_JSON" | jq -c --arg member "$GENERIC_MEMBER_CANDIDATE" '. + [$member] | unique' 2>/dev/null)
        if run_test "set_space_owners($GENERIC_SPACE_ID add candidate owner)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_owners\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"owners\":$OWNER_ARGS_JSON,\"ensureMembers\":true}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var OWNERS_ADD_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after set_space_owners add)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_contains "get_space sees set_space_owners owner persisted" "$OWNERS_ADD_PERSISTED_TEXT" ".owners // []" "$GENERIC_MEMBER_CANDIDATE"
            assert_json_array_contains "get_space sees set_space_owners ensureMembers persisted" "$OWNERS_ADD_PERSISTED_TEXT" ".members // []" "$GENERIC_MEMBER_CANDIDATE"
          fi
        fi
        if run_test "set_space_owners($GENERIC_SPACE_ID restore owners)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_owners\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"owners\":$INITIAL_OWNERS_JSON,\"ensureMembers\":true}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var OWNERS_RESTORE_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after set_space_owners restore)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_same_set "get_space sees set_space_owners restore persisted" "$OWNERS_RESTORE_PERSISTED_TEXT" ".owners // []" "$INITIAL_OWNERS_JSON"
          fi
        fi
      else
        skip_test "set_space_owners" "generic space fixture has no owner list to restore"
      fi

      if run_test "remove_space_members($GENERIC_SPACE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_space_members\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"members\":[$GENERIC_MEMBER_JSON]}},\"id\":2}"; then
        sleep 2
        if run_capture_to_var REMOVE_MEMBERS_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after remove_space_members)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
          assert_json_array_not_contains "get_space sees remove_space_members persisted" "$REMOVE_MEMBERS_PERSISTED_TEXT" ".members // []" "$GENERIC_MEMBER_CANDIDATE"
        fi
      fi
    else
      GENERIC_EXISTING_MEMBER=$(printf '%s\n' "$GENERIC_SPACE_GET_TEXT" | jq -r '.members[0] // empty' 2>/dev/null)
      if [ -n "$GENERIC_EXISTING_MEMBER" ]; then
        GENERIC_EXISTING_MEMBER_JSON=$(json_string "$GENERIC_EXISTING_MEMBER")
        if run_test "remove_space_members($GENERIC_SPACE_ID existing member)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_space_members\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"members\":[$GENERIC_EXISTING_MEMBER_JSON]}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var REMOVE_EXISTING_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after remove existing member)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_not_contains "get_space sees remove existing member persisted" "$REMOVE_EXISTING_PERSISTED_TEXT" ".members // []" "$GENERIC_EXISTING_MEMBER"
          fi
        fi
        if run_test "add_space_members($GENERIC_SPACE_ID restore existing member)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_space_members\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"members\":[$GENERIC_EXISTING_MEMBER_JSON]}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var RESTORE_EXISTING_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after restore existing member)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_contains "get_space sees restore existing member persisted" "$RESTORE_EXISTING_PERSISTED_TEXT" ".members // []" "$GENERIC_EXISTING_MEMBER"
          fi
        fi
      else
        skip_test "add/remove_space_members" "generic space fixture has no members to restore"
      fi
      if [ "${INITIAL_OWNER_COUNT:-0}" -gt 0 ]; then
        if run_test "set_space_owners($GENERIC_SPACE_ID existing owners)" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_space_owners\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"owners\":$INITIAL_OWNERS_JSON,\"ensureMembers\":true}},\"id\":2}"; then
          sleep 2
          if run_capture_to_var OWNERS_EXISTING_PERSISTED_TEXT "get_space($GENERIC_SPACE_ID after set existing owners)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_space\",\"arguments\":{\"space\":\"$GENERIC_SPACE_ID\",\"includeArchived\":true}},\"id\":2}"; then
            assert_json_array_same_set "get_space sees set existing owners persisted" "$OWNERS_EXISTING_PERSISTED_TEXT" ".owners // []" "$INITIAL_OWNERS_JSON"
          fi
        fi
      else
        skip_test "set_space_owners" "generic space fixture has no owner list to restore"
      fi
    fi
  else
    skip_test "add/remove_space_members" "workspace members or generic space details unavailable"
    skip_test "set_space_owners" "workspace members or generic space details unavailable"
  fi

  run_test "delete_teamspace($GENERIC_SPACE_ID generic_fixture)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_teamspace\",\"arguments\":{\"teamspace\":\"$GENERIC_SPACE_ID\"}},\"id\":2}"
fi
echo ""

##############################
# 13c. GENERIC ASSOCIATIONS
##############################
echo "=== 13c. Generic Associations ==="
run_capture_to_var ASSOCIATIONS_TEXT "list_associations" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_associations","arguments":{"limit":5}},"id":2}'
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

run_capture_to_var WRITABLE_ASSOCIATIONS_TEXT "list_associations(writableOnly)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_associations","arguments":{"writableOnly":true,"limit":1}},"id":2}'
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
run_capture_to_var CREATED_ASSOC_TEXT "create_association(generic_issue_one_to_many)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":\"tracker:class:Issue\",\"targetClass\":\"tracker:class:Issue\",\"sourceRole\":$GENERIC_ROLE_SOURCE_JSON,\"targetRole\":$GENERIC_ROLE_TARGET_JSON,\"cardinality\":\"one-to-many\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  CREATED_ASSOC_ID=$(echo "$CREATED_ASSOC_TEXT" | jq -r '.association.associationId // empty' 2>/dev/null)
  if [ -n "$CREATED_ASSOC_ID" ]; then
    GENERIC_ASSOCIATION_CLEANUP_IDS="$GENERIC_ASSOCIATION_CLEANUP_IDS $CREATED_ASSOC_ID"
  fi
  assert_json_field_equals "create_association created" "$CREATED_ASSOC_TEXT" ".created" "true"
  run_capture_to_var DUP_ASSOC_TEXT "create_association(idempotent)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":\"tracker:class:Issue\",\"targetClass\":\"tracker:class:Issue\",\"sourceRole\":$GENERIC_ROLE_SOURCE_JSON,\"targetRole\":$GENERIC_ROLE_TARGET_JSON,\"cardinality\":\"one-to-many\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    assert_json_field_equals "create_association idempotent existing" "$DUP_ASSOC_TEXT" ".existing" "true"
  fi
else
  CREATED_ASSOC_ID=""
  skip_test "create_association idempotent existing" "create_association failed"
fi

run_capture_to_var GENERIC_SOURCE_TEXT "create_issue(for_generic_associations)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Associations Source $RUN_ID\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  GENERIC_SOURCE_ID=$(echo "$GENERIC_SOURCE_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
  GENERIC_SOURCE_OBJ_ID=$(echo "$GENERIC_SOURCE_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  GENERIC_SOURCE_OBJ_ID_JSON=$(json_string "$GENERIC_SOURCE_OBJ_ID")
  if [ -n "$GENERIC_SOURCE_OBJ_ID" ]; then
    run_capture_to_var OMITTED_RELATIONS_TEXT "list_relations(source raw issue)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"limit\":3}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "list_relations(source raw issue) has total" "$OMITTED_RELATIONS_TEXT" ".total"
    fi

    run_capture_to_var EITHER_RELATIONS_TEXT "list_relations(source raw issue,either)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"direction\":\"either\",\"limit\":3}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_nonempty "list_relations(source raw issue,either) has total" "$EITHER_RELATIONS_TEXT" ".total"
    fi
  else
    skip_test "list_relations(source raw issue)" "generic association source issue did not return issueId"
    skip_test "list_relations(source raw issue,either)" "generic association source issue did not return issueId"
  fi
  run_capture_to_var GENERIC_TARGET_TEXT "create_issue(for_generic_associations_target)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Associations Target $RUN_ID\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    GENERIC_TARGET_ID=$(echo "$GENERIC_TARGET_TEXT" | jq -r '.identifier // empty' 2>/dev/null)
    GENERIC_TARGET_OBJ_ID=$(echo "$GENERIC_TARGET_TEXT" | jq -r '.issueId // empty' 2>/dev/null)
  else
    GENERIC_TARGET_ID=""
    GENERIC_TARGET_OBJ_ID=""
  fi
  run_capture_to_var GENERIC_SOURCE2_TEXT "create_issue(for_generic_associations_cardinality)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Associations Cardinality $RUN_ID\"}},\"id\":2}"
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
    run_capture_to_var CREATED_RELATION_TEXT "create_relation(generic)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
    if [ $? -eq 0 ]; then
      CREATED_RELATION_ID=$(echo "$CREATED_RELATION_TEXT" | jq -r '.relationId // empty' 2>/dev/null)
      assert_json_field_equals "create_relation created" "$CREATED_RELATION_TEXT" ".created" "true"
      run_capture_to_var EXISTING_RELATION_TEXT "create_relation(idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "create_relation idempotent existing" "$EXISTING_RELATION_TEXT" ".existing" "true"
      fi
      run_capture_to_var LIST_CREATED_RELATION_TEXT "list_relations(generic created)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\",\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"target\":{\"kind\":\"raw\",\"id\":$GENERIC_TARGET_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"limit\":3}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "list_relations(generic created) total" "$LIST_CREATED_RELATION_TEXT" ".total" "1"
      fi
      run_expect_error "delete_association(in use)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\"}},\"id\":2}"
      run_expect_error "create_relation(cardinality violation)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\",\"source\":{\"kind\":\"raw\",\"id\":$GENERIC_SOURCE2_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"target\":{\"kind\":\"raw\",\"id\":$GENERIC_TARGET_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"}}},\"id\":2}"
      run_capture_to_var DELETE_TRIPLE_TEXT "delete_relation(generic triple)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_relation triple deleted" "$DELETE_TRIPLE_TEXT" ".deleted" "true"
      fi
      run_capture_to_var DELETE_TRIPLE_AGAIN_TEXT "delete_relation(generic triple idempotent)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_relation triple idempotent" "$DELETE_TRIPLE_AGAIN_TEXT" ".deleted" "false"
      fi
      run_capture_to_var CREATED_RELATION_BY_ID_TEXT "create_relation(generic for id delete)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CREATE_RELATION_ARGS},\"id\":2}"
      if [ $? -eq 0 ]; then
        RELATION_DELETE_ID=$(echo "$CREATED_RELATION_BY_ID_TEXT" | jq -r '.relationId // empty' 2>/dev/null)
        if [ -n "$RELATION_DELETE_ID" ]; then
          run_capture_to_var DELETE_BY_ID_TEXT "delete_relation(generic id)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":{\"relation\":\"$RELATION_DELETE_ID\"}},\"id\":2}"
          if [ $? -eq 0 ]; then
            assert_json_field_equals "delete_relation id deleted" "$DELETE_BY_ID_TEXT" ".deleted" "true"
          fi
          run_capture_to_var DELETE_BY_ID_AGAIN_TEXT "delete_relation(generic id idempotent)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_relation\",\"arguments\":{\"relation\":\"$RELATION_DELETE_ID\"}},\"id\":2}"
          if [ $? -eq 0 ]; then
            assert_json_field_equals "delete_relation id idempotent" "$DELETE_BY_ID_AGAIN_TEXT" ".deleted" "false"
          fi
        fi
      fi
      run_capture_to_var DELETE_ASSOC_TEXT "delete_association(unused)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\"}},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "delete_association unused deleted" "$DELETE_ASSOC_TEXT" ".deleted" "true"
        assert_json_field_equals "delete_association unused relation count" "$DELETE_ASSOC_TEXT" ".relationCount" "0"
      fi
      run_capture_to_var DELETE_ASSOC_AGAIN_TEXT "delete_association(idempotent missing)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_association\",\"arguments\":{\"association\":\"$CREATED_ASSOC_ID\"}},\"id\":2}"
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

run_capture_to_var CARD_LOCATOR_MASTER_TEXT "card locator list_master_tags(Default)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_master_tags","arguments":{"cardSpace":"Default"}},"id":2}'
CARD_LOCATOR_MASTER_ID=$(echo "$CARD_LOCATOR_MASTER_TEXT" | jq -r '.masterTags[0].id // empty' 2>/dev/null)
if [ -n "$CARD_LOCATOR_MASTER_ID" ]; then
  CARD_LOCATOR_TITLE="IntTest Generic Association Card $RUN_ID"
  CARD_LOCATOR_TITLE_JSON=$(json_string "$CARD_LOCATOR_TITLE")
  CARD_LOCATOR_MASTER_ID_JSON=$(json_string "$CARD_LOCATOR_MASTER_ID")
  run_capture_to_var CARD_LOCATOR_CARD_TEXT "create_card(for_generic_card_locator)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_card\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$CARD_LOCATOR_MASTER_ID_JSON,\"title\":$CARD_LOCATOR_TITLE_JSON,\"content\":\"Temporary card for generic association locator integration.\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    CARD_LOCATOR_CARD_ID=$(echo "$CARD_LOCATOR_CARD_TEXT" | jq -r '.id // empty' 2>/dev/null)
  else
    CARD_LOCATOR_CARD_ID=""
  fi

  run_capture_to_var CARD_LOCATOR_ISSUE_TEXT "create_issue(for_generic_card_locator)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Generic Card Locator Target $RUN_ID\"}},\"id\":2}"
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
  run_capture_to_var CARD_LOCATOR_ASSOC_TEXT "create_association(generic_card_to_issue)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_association\",\"arguments\":{\"sourceClass\":$CARD_LOCATOR_MASTER_ID_JSON,\"targetClass\":\"tracker:class:Issue\",\"sourceRole\":$CARD_LOCATOR_SOURCE_ROLE_JSON,\"targetRole\":$CARD_LOCATOR_TARGET_ROLE_JSON,\"cardinality\":\"many-to-many\"}},\"id\":2}"
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
    run_capture_to_var CARD_RELATION_TEXT "create_relation(card locator by id)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CARD_RELATION_ARGS_BY_ID},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "create_relation card locator by id created" "$CARD_RELATION_TEXT" ".created" "true"
      run_capture_to_var CARD_RELATION_TITLE_TEXT "create_relation(card locator by title)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_relation\",\"arguments\":$CARD_RELATION_ARGS_BY_TITLE},\"id\":2}"
      if [ $? -eq 0 ]; then
        assert_json_field_equals "create_relation card locator by title existing" "$CARD_RELATION_TITLE_TEXT" ".existing" "true"
      fi
      run_capture_to_var CARD_LIST_RELATIONS_TEXT "list_relations(card locator by title)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_relations\",\"arguments\":{\"association\":\"$CARD_LOCATOR_ASSOC_ID\",\"source\":{\"kind\":\"card\",\"card\":$CARD_LOCATOR_TITLE_JSON,\"cardSpace\":\"Default\"},\"target\":{\"kind\":\"raw\",\"id\":$CARD_LOCATOR_ISSUE_OBJ_ID_JSON,\"class\":\"tracker:class:Issue\"},\"limit\":3}},\"id\":2}"
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
run_capture_to_var CARDS_MASTER_TEXT "list_master_tags(Default)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_master_tags","arguments":{"cardSpace":"Default"}},"id":2}'
run_test "list_cards(Default)" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_cards","arguments":{"cardSpace":"Default","limit":3}},"id":2}'
DERIVED_CARD_TYPE_NAME=$(printf '%s\n' "$CARDS_MASTER_TEXT" | jq -r '.masterTags[0].name // empty' 2>/dev/null)
DERIVED_CARD_TYPE_ID=$(printf '%s\n' "$CARDS_MASTER_TEXT" | jq -r '.masterTags[0].id // empty' 2>/dev/null)
if [ -n "$DERIVED_CARD_TYPE_ID" ]; then
  DERIVED_CARD_TYPE_NAME_JSON=$(json_string "$DERIVED_CARD_TYPE_NAME")
  DERIVED_CARD_TYPE_ID_JSON=$(json_string "$DERIVED_CARD_TYPE_ID")
  DERIVED_CARD_LABEL_TITLE="IntTest Derived Label Card $RUN_ID"
  DERIVED_CARD_ID_TITLE="IntTest Derived Id Card $RUN_ID"
  DERIVED_CARD_LABEL_TITLE_JSON=$(json_string "$DERIVED_CARD_LABEL_TITLE")
  DERIVED_CARD_ID_TITLE_JSON=$(json_string "$DERIVED_CARD_ID_TITLE")
  DERIVED_CARD_LABEL_TITLE_LOWER=$(printf '%s' "$DERIVED_CARD_LABEL_TITLE" | tr '[:upper:]' '[:lower:]')
  DERIVED_CARD_LABEL_REGEX_JSON=$(json_string "%$DERIVED_CARD_LABEL_TITLE%")
  DERIVED_CARD_LABEL_PREFIX_REGEX_JSON=$(json_string "$DERIVED_CARD_LABEL_TITLE%")
  DERIVED_CARD_LABEL_CASE_REGEX_JSON=$(json_string "%$DERIVED_CARD_LABEL_TITLE_LOWER%")

  run_capture_to_var DERIVED_CARD_LABEL_TEXT "create_card(derived label:$DERIVED_CARD_TYPE_NAME)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_card\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$DERIVED_CARD_TYPE_NAME_JSON,\"title\":$DERIVED_CARD_LABEL_TITLE_JSON,\"content\":\"Temporary derived card created by label.\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    DERIVED_CARD_LABEL_ID=$(printf '%s\n' "$DERIVED_CARD_LABEL_TEXT" | jq -r '.id // empty' 2>/dev/null)
  else
    DERIVED_CARD_LABEL_ID=""
  fi
  if [ -n "$DERIVED_CARD_LABEL_ID" ]; then
    DERIVED_CARD_LABEL_ID_JSON=$(json_string "$DERIVED_CARD_LABEL_ID")
    run_capture_to_var DERIVED_CARD_LABEL_GET_TEXT "get_card(derived label:$DERIVED_CARD_LABEL_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_LABEL_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_card derived label keeps type" "$DERIVED_CARD_LABEL_GET_TEXT" ".type" "$DERIVED_CARD_TYPE_ID"
    fi
    run_capture_to_var DERIVED_CARD_LIST_TEXT "list_cards(Default,type:$DERIVED_CARD_TYPE_NAME)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$DERIVED_CARD_TYPE_NAME_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_cards derived label includes card" "$DERIVED_CARD_LIST_TEXT" ".cards | map(.id)" "$DERIVED_CARD_LABEL_ID"
    fi
    run_capture_to_var DERIVED_CARD_REGEX_TEXT "list_cards(Default,titleRegex SIMILAR TO contains)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":\"Default\",\"titleRegex\":$DERIVED_CARD_LABEL_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_cards titleRegex SIMILAR TO contains includes card" "$DERIVED_CARD_REGEX_TEXT" ".cards | map(.id)" "$DERIVED_CARD_LABEL_ID"
    fi
    run_capture_to_var DERIVED_CARD_REGEX_PREFIX_TEXT "list_cards(Default,titleRegex SIMILAR TO prefix)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":\"Default\",\"titleRegex\":$DERIVED_CARD_LABEL_PREFIX_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_contains "list_cards titleRegex SIMILAR TO prefix includes card" "$DERIVED_CARD_REGEX_PREFIX_TEXT" ".cards | map(.id)" "$DERIVED_CARD_LABEL_ID"
    fi
    run_capture_to_var DERIVED_CARD_REGEX_CASE_TEXT "list_cards(Default,titleRegex case-sensitive miss)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_cards\",\"arguments\":{\"cardSpace\":\"Default\",\"titleRegex\":$DERIVED_CARD_LABEL_CASE_REGEX_JSON,\"limit\":10}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_array_not_contains "list_cards titleRegex is case-sensitive" "$DERIVED_CARD_REGEX_CASE_TEXT" ".cards | map(.id)" "$DERIVED_CARD_LABEL_ID"
    fi
  else
    fail_test "create_card(derived label:$DERIVED_CARD_TYPE_NAME) returns id" "missing id"
  fi

  run_capture_to_var DERIVED_CARD_ID_TEXT "create_card(derived id:$DERIVED_CARD_TYPE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_card\",\"arguments\":{\"cardSpace\":\"Default\",\"type\":$DERIVED_CARD_TYPE_ID_JSON,\"title\":$DERIVED_CARD_ID_TITLE_JSON,\"content\":\"Temporary derived card created by id.\"}},\"id\":2}"
  if [ $? -eq 0 ]; then
    DERIVED_CARD_ID_ID=$(printf '%s\n' "$DERIVED_CARD_ID_TEXT" | jq -r '.id // empty' 2>/dev/null)
  else
    DERIVED_CARD_ID_ID=""
  fi
  if [ -n "$DERIVED_CARD_ID_ID" ]; then
    DERIVED_CARD_ID_ID_JSON=$(json_string "$DERIVED_CARD_ID_ID")
    run_capture_to_var DERIVED_CARD_ID_GET_TEXT "get_card(derived id:$DERIVED_CARD_ID_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":$DERIVED_CARD_ID_ID_JSON}},\"id\":2}"
    if [ $? -eq 0 ]; then
      assert_json_field_equals "get_card derived id keeps type" "$DERIVED_CARD_ID_GET_TEXT" ".type" "$DERIVED_CARD_TYPE_ID"
    fi
  else
    fail_test "create_card(derived id:$DERIVED_CARD_TYPE_ID) returns id" "missing id"
  fi

  if [ -n "$DERIVED_CARD_LABEL_ID" ]; then
    run_test "delete_card(derived label:$DERIVED_CARD_LABEL_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":\"$DERIVED_CARD_LABEL_ID\"}},\"id\":2}"
  fi
  if [ -n "$DERIVED_CARD_ID_ID" ]; then
    run_test "delete_card(derived id:$DERIVED_CARD_ID_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_card\",\"arguments\":{\"cardSpace\":\"Default\",\"card\":\"$DERIVED_CARD_ID_ID\"}},\"id\":2}"
  fi
else
  skip_test "create_card(derived label)" "Default card space has no master tags"
  skip_test "get_card(derived label)" "Default card space has no master tags"
  skip_test "list_cards(Default,type)" "Default card space has no master tags"
  skip_test "create_card(derived id)" "Default card space has no master tags"
  skip_test "get_card(derived id)" "Default card space has no master tags"
  skip_test "delete_card(derived cards)" "Default card space has no master tags"
fi
skip_test "update_card" "requires card"
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
run_capture_to_var ATT_ISSUE_TEXT "create_issue(for_attachment)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_issue\",\"arguments\":{\"project\":\"$PROJECT\",\"title\":\"Attachment Test\"}},\"id\":2}"
if [ $? -eq 0 ]; then
  ATT_ISSUE_ID=$(echo "$ATT_ISSUE_TEXT" | jq -r '.identifier' 2>/dev/null)
  ATT_ISSUE_OBJ=$(echo "$ATT_ISSUE_TEXT" | jq -r '.issueId' 2>/dev/null)

  # upload_file — skipped standalone (no blob delete tool); covered via add_issue_attachment
  skip_test "upload_file(standalone)" "no blob delete tool — would leak data"

  echo "test attachment content" > "$TEST_TMPDIR/inttest_attach.txt"

  # add_issue_attachment (also exercises upload internally)
  run_capture_to_var ATT_TEXT "add_issue_attachment($ATT_ISSUE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_issue_attachment\",\"arguments\":{\"project\":\"$PROJECT\",\"identifier\":\"$ATT_ISSUE_ID\",\"filePath\":\"$TEST_TMPDIR/inttest_attach.txt\",\"filename\":\"test.txt\",\"contentType\":\"text/plain\"}},\"id\":2}"
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
  run_capture_to_var TS_TEXT "create_test_suite" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_suite\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Suite\"}},\"id\":2}"
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
    run_capture_to_var TC_TEXT "create_test_case" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_case\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Case\",\"testSuite\":\"$TSID\"}},\"id\":2}"
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
      run_capture_to_var TP_TEXT "create_test_plan" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Plan\"}},\"id\":2}"
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
        run_capture_to_var TR_TEXT "create_test_run" \
          "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_run\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"name\":\"IntTest Run\",\"testPlan\":\"$TPID\"}},\"id\":2}"
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
          run_capture_to_var RESULT_TEXT "create_test_result" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_test_result\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testRun\":\"$TRID\",\"testCase\":\"$TCID\",\"status\":\"passed\"}},\"id\":2}"
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
          run_capture_to_var RTP_TEXT "run_test_plan($TPID)" \
            "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"run_test_plan\",\"arguments\":{\"project\":\"$TM_PROJ_ID\",\"testPlan\":\"$TPID\"}},\"id\":2}"
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
    run_capture_to_var START_TEXT "start_process($PROCESS_ID,$SAFE_CARD_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"start_process\",\"arguments\":{\"process\":\"$PROCESS_ID\",\"card\":\"$SAFE_CARD_ID\"}},\"id\":2}"
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
# 20. DRIVE
##############################
echo "=== 20. Drive ==="
run_capture_to_var DRIVES_TEXT "list_drives" \
  '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_drives","arguments":{"limit":5}},"id":2}'

DRIVE_ID=$(echo "$DRIVES_TEXT" | jq -r '.drives[0].id // empty' 2>/dev/null)

if [ -n "$DRIVE_ID" ]; then
  DRIVE_JSON=$(json_string "$DRIVE_ID")
  DRIVE_TEST_FOLDER="/mcp-integration-$RUN_ID"
  DRIVE_TEST_NESTED="$DRIVE_TEST_FOLDER/nested"
  DRIVE_TEST_FILE="$DRIVE_TEST_NESTED/hello.txt"
  DRIVE_TEST_MOVED_FILE="$DRIVE_TEST_FOLDER/hello.txt"
  DRIVE_TEST_RENAMED_FILE="$DRIVE_TEST_FOLDER/hello-renamed.txt"
  DRIVE_TEST_FOLDER_JSON=$(json_string "$DRIVE_TEST_FOLDER")
  DRIVE_TEST_NESTED_JSON=$(json_string "$DRIVE_TEST_NESTED")
  DRIVE_TEST_FILE_JSON=$(json_string "$DRIVE_TEST_FILE")
  DRIVE_TEST_MOVED_FILE_JSON=$(json_string "$DRIVE_TEST_MOVED_FILE")
  DRIVE_TEST_RENAMED_FILE_JSON=$(json_string "$DRIVE_TEST_RENAMED_FILE")
  DRIVE_TEST_DATA=$(printf 'Drive integration %s' "$RUN_ID" | base64 | tr -d '\n')
  DRIVE_TEST_VERSION_DATA=$(printf 'Drive integration version 2 %s' "$RUN_ID" | base64 | tr -d '\n')
  DRIVE_TEST_DATA_JSON=$(json_string "$DRIVE_TEST_DATA")
  DRIVE_TEST_VERSION_DATA_JSON=$(json_string "$DRIVE_TEST_VERSION_DATA")
  DRIVE_TEST_COMMENT_BODY_JSON=$(json_string "Drive comment $RUN_ID")
  DRIVE_TEST_COMMENT_UPDATED_BODY_JSON=$(json_string "Drive comment updated $RUN_ID")
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_RENAMED_FILE"
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_MOVED_FILE"
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_FILE"
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_NESTED"
  remember_drive_item_cleanup "$DRIVE_ID" "$DRIVE_TEST_FOLDER"

  run_test "get_drive($DRIVE_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_drive\",\"arguments\":{\"drive\":$DRIVE_JSON}},\"id\":2}"
  run_test "list_drive_items(root)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_items\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":\"/\",\"limit\":10}},\"id\":2}"
  run_capture_to_var DRIVE_FOLDER_TEXT "create_drive_folder($DRIVE_TEST_NESTED)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_drive_folder\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_NESTED_JSON}},\"id\":2}"
  run_test "get_drive_item(folder)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_FOLDER_JSON}},\"id\":2}"
  run_capture_to_var DRIVE_UPLOAD_TEXT "upload_drive_file($DRIVE_TEST_FILE)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"upload_drive_file\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_FILE_JSON,\"contentType\":\"text/plain\",\"data\":$DRIVE_TEST_DATA_JSON}},\"id\":2}"
  DRIVE_FILE_ID=$(echo "$DRIVE_UPLOAD_TEXT" | jq -r '.file.id // empty' 2>/dev/null)
  if [ -n "$DRIVE_FILE_ID" ]; then
    DRIVE_FILE_ID_JSON=$(json_string "$DRIVE_FILE_ID")
    run_test "get_drive_item(file)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"get_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"itemId\":$DRIVE_FILE_ID_JSON}},\"id\":2}"
    run_test "list_drive_file_versions($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_file_versions\",\"arguments\":{\"drive\":$DRIVE_JSON,\"file\":$DRIVE_FILE_ID_JSON}},\"id\":2}"
    run_capture_to_var DRIVE_ADD_COMMENT_TEXT "add_drive_file_comment($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_drive_file_comment\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"body\":$DRIVE_TEST_COMMENT_BODY_JSON}},\"id\":2}"
    DRIVE_COMMENT_ID=$(echo "$DRIVE_ADD_COMMENT_TEXT" | jq -r '.commentId // empty' 2>/dev/null)
    if [ -n "$DRIVE_COMMENT_ID" ]; then
      DRIVE_COMMENT_ID_JSON=$(json_string "$DRIVE_COMMENT_ID")
      run_capture_to_var DRIVE_COMMENTS_TEXT "list_drive_file_comments($DRIVE_FILE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_file_comments\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"limit\":10}},\"id\":2}"
      assert_json_field_equals "list_drive_file_comments sees comment" "$DRIVE_COMMENTS_TEXT" ".comments[0].id" "$DRIVE_COMMENT_ID"
      run_capture_to_var DRIVE_UPDATE_COMMENT_TEXT "update_drive_file_comment($DRIVE_COMMENT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_drive_file_comment\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"commentId\":$DRIVE_COMMENT_ID_JSON,\"body\":$DRIVE_TEST_COMMENT_UPDATED_BODY_JSON}},\"id\":2}"
      assert_json_field_equals "update_drive_file_comment updates comment" "$DRIVE_UPDATE_COMMENT_TEXT" ".updated" "true"
      run_test "list_drive_file_activity($DRIVE_FILE_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_file_activity\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"limit\":10}},\"id\":2}"
      run_capture_to_var DRIVE_DELETE_COMMENT_TEXT "delete_drive_file_comment($DRIVE_COMMENT_ID)" \
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_file_comment\",\"arguments\":{\"drive\":$DRIVE_JSON,\"fileId\":$DRIVE_FILE_ID_JSON,\"commentId\":$DRIVE_COMMENT_ID_JSON}},\"id\":2}"
      assert_json_field_equals "delete_drive_file_comment deletes comment" "$DRIVE_DELETE_COMMENT_TEXT" ".deleted" "true"
    else
      skip_test "list_drive_file_comments" "add_drive_file_comment did not return a comment id"
      skip_test "update_drive_file_comment" "add_drive_file_comment did not return a comment id"
      skip_test "list_drive_file_activity" "add_drive_file_comment did not return a comment id"
      skip_test "delete_drive_file_comment" "add_drive_file_comment did not return a comment id"
    fi
    run_capture_to_var DRIVE_VERSION_TEXT "upload_drive_file_version($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"upload_drive_file_version\",\"arguments\":{\"drive\":$DRIVE_JSON,\"file\":$DRIVE_FILE_ID_JSON,\"contentType\":\"text/plain\",\"data\":$DRIVE_TEST_VERSION_DATA_JSON}},\"id\":2}"
    assert_json_field_equals "upload_drive_file_version increments version" "$DRIVE_VERSION_TEXT" ".currentVersion.version" "2"
    run_capture_to_var DRIVE_VERSIONS_TEXT "list_drive_file_versions($DRIVE_FILE_ID, after version)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"list_drive_file_versions\",\"arguments\":{\"drive\":$DRIVE_JSON,\"file\":$DRIVE_FILE_ID_JSON}},\"id\":2}"
    assert_json_field_equals "list_drive_file_versions sees two versions" "$DRIVE_VERSIONS_TEXT" ".total" "2"
    run_capture_to_var DRIVE_MOVE_TEXT "move_drive_item($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"move_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"itemId\":$DRIVE_FILE_ID_JSON,\"targetFolderPath\":$DRIVE_TEST_FOLDER_JSON}},\"id\":2}"
    assert_json_field_equals "move_drive_item updates path" "$DRIVE_MOVE_TEXT" ".toPath" "$DRIVE_TEST_MOVED_FILE"
    run_capture_to_var DRIVE_RENAME_TEXT "rename_drive_item($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"rename_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"itemId\":$DRIVE_FILE_ID_JSON,\"title\":\"hello-renamed.txt\"}},\"id\":2}"
    assert_json_field_equals "rename_drive_item updates path" "$DRIVE_RENAME_TEXT" ".toPath" "$DRIVE_TEST_RENAMED_FILE"
    run_capture_to_var DRIVE_DELETE_TEXT "delete_drive_item($DRIVE_FILE_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"itemId\":$DRIVE_FILE_ID_JSON}},\"id\":2}"
    assert_json_field_equals "delete_drive_item deletes file" "$DRIVE_DELETE_TEXT" ".deleted" "true"
    run_test "delete_drive_item(empty nested folder)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_NESTED_JSON}},\"id\":2}"
    run_test "delete_drive_item(empty parent folder)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$DRIVE_JSON,\"path\":$DRIVE_TEST_FOLDER_JSON}},\"id\":2}"
  else
    skip_test "get_drive_item(file)" "upload_drive_file did not return a file id"
    skip_test "list_drive_file_versions" "upload_drive_file did not return a file id"
    skip_test "add_drive_file_comment" "upload_drive_file did not return a file id"
    skip_test "list_drive_file_comments" "upload_drive_file did not return a file id"
    skip_test "update_drive_file_comment" "upload_drive_file did not return a file id"
    skip_test "list_drive_file_activity" "upload_drive_file did not return a file id"
    skip_test "delete_drive_file_comment" "upload_drive_file did not return a file id"
    skip_test "upload_drive_file_version" "upload_drive_file did not return a file id"
    skip_test "move_drive_item" "upload_drive_file did not return a file id"
    skip_test "rename_drive_item" "upload_drive_file did not return a file id"
    skip_test "delete_drive_item(file)" "upload_drive_file did not return a file id"
  fi
else
  skip_test "get_drive" "no Drive spaces found in workspace"
  skip_test "list_drive_items" "no Drive spaces found in workspace"
  skip_test "create_drive_folder" "no Drive spaces found in workspace"
  skip_test "upload_drive_file" "no Drive spaces found in workspace"
  skip_test "add_drive_file_comment" "no Drive spaces found in workspace"
  skip_test "list_drive_file_comments" "no Drive spaces found in workspace"
  skip_test "update_drive_file_comment" "no Drive spaces found in workspace"
  skip_test "list_drive_file_activity" "no Drive spaces found in workspace"
  skip_test "delete_drive_file_comment" "no Drive spaces found in workspace"
  skip_test "upload_drive_file_version" "no Drive spaces found in workspace"
  skip_test "move_drive_item" "no Drive spaces found in workspace"
  skip_test "rename_drive_item" "no Drive spaces found in workspace"
  skip_test "delete_drive_item" "no Drive spaces found in workspace"
  skip_test "list_drive_file_versions" "no Drive spaces found in workspace"
  skip_test "restore_drive_file_version" "no Drive spaces found in workspace"
fi

DRIVE_ADMIN_NAME="MCP Integration Drive $RUN_ID"
DRIVE_ADMIN_UPDATED_NAME="MCP Integration Drive Updated $RUN_ID"
DRIVE_ADMIN_FOLDER="/non-empty"
DRIVE_ADMIN_NAME_JSON=$(json_string "$DRIVE_ADMIN_NAME")
DRIVE_ADMIN_UPDATED_NAME_JSON=$(json_string "$DRIVE_ADMIN_UPDATED_NAME")
DRIVE_ADMIN_FOLDER_JSON=$(json_string "$DRIVE_ADMIN_FOLDER")
run_capture_to_var DRIVE_ADMIN_CREATE_TEXT "create_drive($DRIVE_ADMIN_NAME)" \
  "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_drive\",\"arguments\":{\"name\":$DRIVE_ADMIN_NAME_JSON,\"description\":\"Drive admin integration fixture\",\"private\":true,\"members\":[],\"owners\":[]}},\"id\":2}"
DRIVE_ADMIN_ID=$(echo "$DRIVE_ADMIN_CREATE_TEXT" | jq -r '.drive.id // empty' 2>/dev/null)
if [ -n "$DRIVE_ADMIN_ID" ]; then
  DRIVE_ADMIN_JSON=$(json_string "$DRIVE_ADMIN_ID")
  remember_drive_cleanup "$DRIVE_ADMIN_ID"
  remember_drive_item_cleanup "$DRIVE_ADMIN_ID" "$DRIVE_ADMIN_FOLDER"
  run_capture_to_var DRIVE_ADMIN_UPDATE_TEXT "update_drive($DRIVE_ADMIN_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"update_drive\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"name\":$DRIVE_ADMIN_UPDATED_NAME_JSON,\"description\":\"Drive admin integration updated\",\"autoJoin\":true}},\"id\":2}"
  assert_json_field_equals "update_drive updates name" "$DRIVE_ADMIN_UPDATE_TEXT" ".drive.name" "$DRIVE_ADMIN_UPDATED_NAME"
  assert_json_field_equals "update_drive updates autoJoin" "$DRIVE_ADMIN_UPDATE_TEXT" ".drive.autoJoin" "true"
  if [ -n "${HULY_EMAIL:-}" ]; then
    HULY_EMAIL_JSON=$(json_string "$HULY_EMAIL")
    run_test "add_drive_members($DRIVE_ADMIN_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"add_drive_members\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"members\":[$HULY_EMAIL_JSON]}},\"id\":2}"
    run_test "remove_drive_members($DRIVE_ADMIN_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"remove_drive_members\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"members\":[$HULY_EMAIL_JSON]}},\"id\":2}"
    run_test "set_drive_owners($DRIVE_ADMIN_ID)" \
      "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"set_drive_owners\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"owners\":[$HULY_EMAIL_JSON]}},\"id\":2}"
  else
    skip_test "add_drive_members" "HULY_EMAIL not set"
    skip_test "remove_drive_members" "HULY_EMAIL not set"
    skip_test "set_drive_owners" "HULY_EMAIL not set"
  fi
  run_test "create_drive_folder($DRIVE_ADMIN_FOLDER in temp Drive)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"create_drive_folder\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"path\":$DRIVE_ADMIN_FOLDER_JSON}},\"id\":2}"
  run_expect_error_contains "delete_drive(non-empty)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON}},\"id\":2}" \
    "is not empty"
  run_test "delete_drive_item(temp Drive folder)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive_item\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON,\"path\":$DRIVE_ADMIN_FOLDER_JSON}},\"id\":2}"
  run_capture_to_var DRIVE_ADMIN_DELETE_TEXT "delete_drive($DRIVE_ADMIN_ID)" \
    "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{\"name\":\"delete_drive\",\"arguments\":{\"drive\":$DRIVE_ADMIN_JSON}},\"id\":2}"
  assert_json_field_equals "delete_drive deletes empty Drive" "$DRIVE_ADMIN_DELETE_TEXT" ".deleted" "true"
else
  skip_test "update_drive" "create_drive did not return a Drive id"
  skip_test "add_drive_members" "create_drive did not return a Drive id"
  skip_test "remove_drive_members" "create_drive did not return a Drive id"
  skip_test "set_drive_owners" "create_drive did not return a Drive id"
  skip_test "delete_drive(non-empty)" "create_drive did not return a Drive id"
  skip_test "delete_drive" "create_drive did not return a Drive id"
fi
echo ""

##############################
# 21. USER STATUSES
##############################
echo "=== 21. User Statuses ==="
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
