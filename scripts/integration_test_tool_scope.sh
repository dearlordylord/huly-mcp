#!/usr/bin/env bash
set -euo pipefail

# Tool-scope integration matrix for stdio MCP discovery.
# Usage: set -a && source .env.local && set +a && pnpm integration:tool-scope

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required" >&2
  exit 1
fi

if [[ -z "${HULY_URL:-}" ]]; then
  echo "ERROR: HULY_URL must be set; source .env.local first" >&2
  exit 1
fi

TOOL_TIMEOUT="${TOOL_TIMEOUT:-30}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

json_string() {
  jq -Rn --arg value "$1" '$value'
}

run_case() {
  local case_name="$1"
  local client_name="$2"
  local toolsets="$3"
  local tools="$4"
  local tool_mode="$5"
  local proxy_output_strict="$6"
  local input_file="$TMP_DIR/$case_name.input.jsonl"
  local raw_file="$TMP_DIR/$case_name.raw"
  local output_file="$TMP_DIR/$case_name.jsonl"
  local client_json
  client_json="$(json_string "$client_name")"

  cat >"$input_file" <<EOF
{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":$client_json,"version":"1.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/list","id":2}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_huly_context","arguments":{}},"id":3}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_projects","arguments":{}},"id":4}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_teamspaces","arguments":{}},"id":5}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_tools","arguments":{"query":"list projects"}},"id":6}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_tool_schema","arguments":{"toolName":"list_projects"}},"id":7}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"invoke_tool","arguments":{"toolName":"list_projects","arguments":{}}},"id":8}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_tool_schema","arguments":{"toolName":"list_teamspaces"}},"id":9}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"search_tools","arguments":{"query":"teamspaces"}},"id":10}
EOF

  (
    export TOOLSETS="$toolsets"
    export TOOLS="$tools"
    export MCP_AUTO_EXIT=true
    if [[ -n "$tool_mode" ]]; then
      export HULY_TOOL_MODE="$tool_mode"
    else
      unset HULY_TOOL_MODE
    fi
    if [[ -n "$proxy_output_strict" ]]; then
      export PROXY_OUTPUT_STRICT="$proxy_output_strict"
    else
      unset PROXY_OUTPUT_STRICT
    fi
    timeout "$TOOL_TIMEOUT" node dist/index.cjs <"$input_file" >"$raw_file"
  )

  grep '^{' "$raw_file" >"$output_file"
  printf '%s\n' "$output_file"
}

response_by_id() {
  local output_file="$1"
  local id="$2"
  jq -c "select(.id == $id)" "$output_file" | tail -n 1
}

assert_tool_present() {
  local output_file="$1"
  local tool_name="$2"
  response_by_id "$output_file" 2 | jq -e --arg tool "$tool_name" '.result.tools | any(.name == $tool)' >/dev/null
}

assert_tool_absent() {
  local output_file="$1"
  local tool_name="$2"
  response_by_id "$output_file" 2 | jq -e --arg tool "$tool_name" '.result.tools | all(.name != $tool)' >/dev/null
}

assert_tool_names_exact() {
  local output_file="$1"
  shift
  local expected_json
  expected_json="$(printf '%s\n' "$@" | jq -R . | jq -s .)"
  response_by_id "$output_file" 2 \
    | jq -e --argjson expected "$expected_json" '[.result.tools[].name] == $expected' >/dev/null
}

assert_context() {
  local output_file="$1"
  local jq_expression="$2"
  response_by_id "$output_file" 3 \
    | jq -e ".result.structuredContent.result | $jq_expression" >/dev/null
}

assert_call_success() {
  local output_file="$1"
  local id="$2"
  response_by_id "$output_file" "$id" | jq -e '.result.isError != true' >/dev/null
}

assert_call_error() {
  local output_file="$1"
  local id="$2"
  response_by_id "$output_file" "$id" | jq -e '.result.isError == true' >/dev/null
}

assert_search_has() {
  local output_file="$1"
  local tool_name="$2"
  local id="${3:-6}"
  response_by_id "$output_file" "$id" \
    | jq -e --arg tool "$tool_name" '.result.structuredContent.result.matches | any(.name == $tool)' >/dev/null
}

assert_search_absent() {
  local output_file="$1"
  local tool_name="$2"
  local id="${3:-6}"
  response_by_id "$output_file" "$id" \
    | jq -e --arg tool "$tool_name" '.result.structuredContent.result.matches | all(.name != $tool)' >/dev/null
}

assert_search_empty() {
  local output_file="$1"
  response_by_id "$output_file" 6 \
    | jq -e '.result.structuredContent.result.matches == []' >/dev/null
}

echo "Running tool-scope integration matrix..."

default_proxy_output="$(run_case "default-codex-proxy" "codex-cli" "" "" "" "")"
assert_tool_names_exact "$default_proxy_output" \
  "get_version" "get_huly_context" "list_tool_categories" "search_tools" "get_tool_schema" "invoke_tool"
assert_context "$default_proxy_output" '.toolExposure.configuredMode == "auto"'
assert_context "$default_proxy_output" '.toolExposure.resolvedMode == "proxy"'
assert_context "$default_proxy_output" '.toolExposure.clientKind == "codex"'
assert_call_success "$default_proxy_output" 4
assert_search_has "$default_proxy_output" "list_projects"
assert_call_success "$default_proxy_output" 7
assert_call_success "$default_proxy_output" 8

claude_native_output="$(run_case "claude-code-native" "claude-code" "" "" "" "")"
assert_tool_present "$claude_native_output" "list_projects"
assert_tool_present "$claude_native_output" "list_teamspaces"
assert_tool_absent "$claude_native_output" "search_tools"
assert_context "$claude_native_output" '.toolExposure.resolvedMode == "native"'
assert_context "$claude_native_output" '.toolExposure.clientKind == "claude-code"'
assert_call_success "$claude_native_output" 4
assert_call_success "$claude_native_output" 5
assert_call_error "$claude_native_output" 6

native_override_output="$(run_case "codex-native-override" "codex-cli" "" "" "native" "")"
assert_tool_present "$native_override_output" "list_projects"
assert_tool_absent "$native_override_output" "search_tools"
assert_context "$native_override_output" '.toolExposure.configuredMode == "native"'
assert_context "$native_override_output" '.toolExposure.resolvedMode == "native"'
assert_call_success "$native_override_output" 4

proxy_override_output="$(run_case "claude-proxy-override" "claude-code" "" "" "proxy" "")"
assert_tool_names_exact "$proxy_override_output" \
  "get_version" "get_huly_context" "list_tool_categories" "search_tools" "get_tool_schema" "invoke_tool"
assert_context "$proxy_override_output" '.toolExposure.configuredMode == "proxy"'
assert_context "$proxy_override_output" '.toolExposure.resolvedMode == "proxy"'
assert_call_success "$proxy_override_output" 4
assert_call_success "$proxy_override_output" 8

pins_output="$(run_case "proxy-pins" "codex-cli" "projects" "" "" "")"
assert_tool_present "$pins_output" "list_projects"
assert_tool_absent "$pins_output" "list_teamspaces"
assert_context "$pins_output" '.toolScope.enabledToolsets == ["projects"]'
assert_context "$pins_output" '.toolExposure.proxyOutputStrict == false'
assert_call_success "$pins_output" 4
assert_call_success "$pins_output" 5
assert_call_success "$pins_output" 9

tools_pin_output="$(run_case "proxy-tools-pin" "codex-cli" "" "list_teamspaces" "" "")"
assert_tool_present "$tools_pin_output" "list_teamspaces"
assert_tool_absent "$tools_pin_output" "list_projects"
assert_context "$tools_pin_output" '.toolScope.enabledTools == ["list_teamspaces"]'
assert_context "$tools_pin_output" '.toolExposure.proxyOutputStrict == false'
assert_call_success "$tools_pin_output" 4
assert_call_success "$tools_pin_output" 5
assert_call_success "$tools_pin_output" 7
assert_call_success "$tools_pin_output" 8
assert_search_has "$tools_pin_output" "list_teamspaces" 10

strict_output="$(run_case "proxy-strict" "codex-cli" "projects" "" "" "true")"
assert_tool_names_exact "$strict_output" \
  "get_version" "get_huly_context" "list_tool_categories" "search_tools" "get_tool_schema" "invoke_tool"
assert_context "$strict_output" '.toolExposure.proxyOutputStrict == true'
assert_call_success "$strict_output" 4
assert_call_success "$strict_output" 7
assert_call_success "$strict_output" 8
assert_call_error "$strict_output" 9

strict_tools_output="$(run_case "proxy-strict-tools" "codex-cli" "" "list_teamspaces" "" "true")"
assert_tool_names_exact "$strict_tools_output" \
  "get_version" "get_huly_context" "list_tool_categories" "search_tools" "get_tool_schema" "invoke_tool"
assert_context "$strict_tools_output" '.toolScope.enabledTools == ["list_teamspaces"]'
assert_context "$strict_tools_output" '.toolExposure.proxyOutputStrict == true'
assert_call_error "$strict_tools_output" 4
assert_call_success "$strict_tools_output" 5
assert_search_absent "$strict_tools_output" "list_projects"
assert_search_has "$strict_tools_output" "list_teamspaces"
assert_call_error "$strict_tools_output" 7
assert_call_error "$strict_tools_output" 8
assert_call_success "$strict_tools_output" 9
assert_search_has "$strict_tools_output" "list_teamspaces" 10

invalid_output="$(run_case "invalid-strict" "opencode" "missing_category" "missing_tool" "" "true")"
assert_tool_names_exact "$invalid_output" \
  "get_version" "get_huly_context" "list_tool_categories" "search_tools" "get_tool_schema" "invoke_tool"
assert_context "$invalid_output" '.toolScope.active == true'
assert_context "$invalid_output" '.toolScope.ignoredToolsets == ["missing_category"]'
assert_context "$invalid_output" '.toolScope.ignoredTools == ["missing_tool"]'
assert_context "$invalid_output" '.toolExposure.proxyCandidateToolCount == 0'
assert_call_error "$invalid_output" 4
assert_search_empty "$invalid_output"
assert_call_error "$invalid_output" 7
assert_call_error "$invalid_output" 8

echo "Tool-scope integration matrix passed."
