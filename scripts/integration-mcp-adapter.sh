#!/usr/bin/env bash
# Each command owns a fresh official native SDK connection; mutations are never retried.
MOVEMENT_MCP_COMMAND_TIMEOUT_SECONDS=80
MOVEMENT_MCP_COMMAND=(node scripts/run-bundled.mjs scripts/integration-mcp-call-main.ts)
movement_mcp_exchange() {
  local -n command="$1"
  shift
  local response status=0 category=process-exit
  response=$(timeout "$MOVEMENT_MCP_COMMAND_TIMEOUT_SECONDS" "${command[@]}" "$@") || status=$?
  if (( status != 0 )); then
    [[ "$status" == 124 ]] && category=timeout
    printf 'FAIL: movement MCP phase=%s exit=%s\n' "$category" "$status" >&2
    return "$status"
  fi
  if ! jq -es 'length==1 and (.[0]|type=="object" and .jsonrpc=="2.0" and .id==2 and (.result|type=="object") and .error==null)' >/dev/null 2>&1 <<<"$response"; then
    printf 'FAIL: movement MCP phase=envelope-shape\n' >&2
    return 1
  fi
  printf '%s\n' "$response"
}
movement_mcp_call() {
  local response text
  response=$(movement_mcp_exchange "${3:-MOVEMENT_MCP_COMMAND}" "$1" "$2") || return "$?"
  if ! jq -e '((.result|has("isError")|not) or .result.isError==false) and (.result.content|type=="array" and length==1) and (.result.content[0]|type=="object" and .type=="text" and (.text|type=="string" and length>0))' >/dev/null 2>&1 <<<"$response"; then
    printf 'FAIL: movement MCP phase=tool-reply\n' >&2
    return 1
  fi
  text=$(jq -r '.result.content[0].text' <<<"$response")
  if ! jq -es 'length==1' >/dev/null 2>&1 <<<"$text"; then
    printf 'FAIL: movement MCP phase=result-json\n' >&2
    return 1
  fi
  printf '%s\n' "$text"
}
movement_mcp_list_tools() {
  local response
  response=$(movement_mcp_exchange "${1:-MOVEMENT_MCP_COMMAND}" --list-tools) || return "$?"
  if ! jq -e '.result.tools|type=="array" and all(.[]; type=="object" and (.name|type=="string" and length>0) and (.inputSchema|type=="object"))' >/dev/null 2>&1 <<<"$response"; then
    printf 'FAIL: movement MCP phase=list-reply\n' >&2
    return 1
  fi
  printf '%s\n' "$response"
}
