#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh"
PROJECT="${HULY_TEST_PROJECT:-HULY}"
CLI=(node packages/huly-cli/dist/index.cjs)
ISSUES=()
INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"movement-integration","version":"1.0"}},"id":1}'
mcp() {
  local request response
  request=$(jq -nc --arg tool "$1" --argjson args "$2" '{jsonrpc:"2.0",method:"tools/call",params:{name:$tool,arguments:$args},id:2}')
  response=$(printf '%s\n%s\n' "$INIT" "$request" | timeout 30 env MCP_AUTO_EXIT=true HULY_TOOL_MODE=native node dist/index.cjs 2>/dev/null | jq -c 'select(.id == 2)')
  jq -e '.result.isError != true and .error == null' >/dev/null <<<"$response"
  jq -r '.result.content[0].text' <<<"$response"
}
cleanup() {
  for ((i=${#ISSUES[@]}-1; i>=0; i--)); do
    mcp delete_issue "$(jq -nc --arg project "$PROJECT" --arg identifier "${ISSUES[$i]}" '{project:$project,identifier:$identifier}')" >/dev/null || true
  done
}
trap cleanup EXIT
create() {
  local parent="$1" result
  result=$(mcp create_issue "$(jq -nc --arg project "$PROJECT" --arg parent "$parent" '{project:$project,title:"Issue movement certification",description:"Preserved movement content",estimation:2} + (if $parent == "" then {} else {parentIssue:$parent} end)')")
  CREATED=$(jq -r '.identifier' <<<"$result")
  ISSUES+=("$CREATED")
}
snapshot() {
  local ids
  ids=$(printf '%s\n' "${ISSUES[@]}" | jq -R . | jq -s .)
  pnpm exec tsx scripts/integration-issue-movement-state.ts "$(jq -nc --arg project "$PROJECT" --argjson issues "$ids" '{project:$project,issues:$issues}')"
}
assert_result() {
  jq -e --arg outcome "$2" '.outcome == $outcome' >/dev/null <<<"$1"
}
# Discovery proves the published destination contract, including invalid empty shapes.
DISCOVERY=$(printf '%s\n%s\n' "$INIT" '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}' | timeout 30 env MCP_AUTO_EXIT=true HULY_TOOL_MODE=native node dist/index.cjs 2>/dev/null | jq -c 'select(.id == 2)')
jq -e '.result.tools[] | select(.name == "move_issue") | (.inputSchema | tostring | contains("destination"))' >/dev/null <<<"$DISCOVERY"
echo "PASS: MCP discovers destination-based movement"
create ""; OLD="$CREATED"
create "$OLD"; ROOT="$CREATED"
create "$ROOT"; CHILD="$CREATED"
create "$CHILD"; LEAF="$CREATED"
create ""; ANCESTOR="$CREATED"
create "$ANCESTOR"; DEST="$CREATED"
BEFORE=$(snapshot)
ROOT_ID=$(jq -r --arg identifier "$ROOT" '.[] | select(.preserved.identifier == $identifier) | .preserved._id' <<<"$BEFORE")
DEST_ID=$(jq -r --arg identifier "$DEST" '.[] | select(.preserved.identifier == $identifier) | .preserved._id' <<<"$BEFORE")
PROJECT_ID=$(jq -r '.[0].preserved.space' <<<"$BEFORE")
# Relations are task-owned references and must survive movement unchanged.
mcp add_issue_relation "$(jq -nc --arg project "$PROJECT" --arg issueIdentifier "$ROOT" --arg targetIssue "$OLD" '{project:$project,issueIdentifier:$issueIdentifier,targetIssue:$targetIssue,relationType:"is-blocked-by"}')" >/dev/null
RELATIONS_BEFORE=$(mcp list_issue_relations "$(jq -nc --arg project "$PROJECT" --arg issueIdentifier "$ROOT" '{project:$project,issueIdentifier:$issueIdentifier}')")
RESULT=$(mcp move_issue "$(jq -nc --arg issue "$ROOT_ID" --arg parent "$DEST_ID" '{issue:$issue,destination:{parent:$parent}}')")
assert_result "$RESULT" completed
AFTER=$(snapshot)
jq -e --argjson before "$BEFORE" '([.[].preserved] | sort_by(._id)) == ([$before[].preserved] | sort_by(._id))' >/dev/null <<<"$AFTER"
jq -e --arg old "$OLD" --arg dest "$DEST" --arg leaf "$LEAF" --arg child "$CHILD" --arg root "$ROOT" --arg ancestor "$ANCESTOR" '
  (map(select(.preserved.identifier == $old))[0].hierarchy | .subIssues == 0 and .childInfo == []) and
  (map(select(.preserved.identifier == $dest))[0].hierarchy | .subIssues == 1 and (.childInfo | length) == 3 and all(.childInfo[]; .estimation == 2)) and
  (map(select(.preserved.identifier == $leaf))[0].hierarchy.parents | map(.identifier)) == [$child,$root,$dest,$ancestor]' >/dev/null <<<"$AFTER"
RELATIONS_AFTER=$(mcp list_issue_relations "$(jq -nc --arg project "$PROJECT" --arg issueIdentifier "$ROOT" '{project:$project,issueIdentifier:$issueIdentifier}')")
[[ "$(jq -Sc . <<<"$RELATIONS_BEFORE")" == "$(jq -Sc . <<<"$RELATIONS_AFTER")" ]]
echo "PASS: MCP moves three-level tree, preserves identity/content/attributes/relations and verifies actual ancestry/counts/aggregate state"
RESULT=$(mcp move_issue "$(jq -nc --arg issue "$ROOT_ID" --arg parent "$DEST_ID" --arg project "$PROJECT_ID" '{issue:$issue,destination:{project:$project,parent:$parent}}')")
assert_result "$RESULT" no-op
RESULT=$(mcp move_issue "$(jq -nc --arg issue "$ROOT_ID" --arg parent "$DEST_ID" '{issue:$issue,destination:{parent:$parent},resolutions:[]}')")
assert_result "$RESULT" blocked
jq -e '.changed == false and (.reason | contains("Omit resolutions"))' >/dev/null <<<"$RESULT"
[[ "$(jq -Sc . <<<"$(snapshot)")" == "$(jq -Sc . <<<"$AFTER")" ]]
echo "PASS: agreeing project/parent stable IDs no-op; same-project resolutions refused without writes"
RESULT=$("${CLI[@]}" issues move "$ROOT_ID" --destination '{"parent":null}' --json)
assert_result "$RESULT" completed
RESULT=$("${CLI[@]}" issues move "$ROOT_ID" --destination "$(jq -nc --arg project "$PROJECT" '{project:$project}')" --json)
assert_result "$RESULT" no-op
RESULT=$("${CLI[@]}" issues move "$ROOT" --destination "$(jq -nc --arg project "$PROJECT_ID" --arg parent "$DEST_ID" '{project:$project,parent:$parent}')" --json)
assert_result "$RESULT" completed
RESULT=$("${CLI[@]}" issues move "$ROOT" --destination "$(jq -nc --arg parent "$LEAF" '{parent:$parent}')" --json)
assert_result "$RESULT" blocked
FINAL=$(snapshot)
jq -e --argjson after "$AFTER" '([.[].preserved] | sort_by(._id)) == ([$after[].preserved] | sort_by(._id))' >/dev/null <<<"$FINAL"
echo "PASS: CLI destination forms, stable IDs, cycle refusal and real Huly preserved data"
