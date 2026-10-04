#!/usr/bin/env bash
# Execute only during final combined 306–311 certification, after build and integration preflight.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh"
CLI=(node packages/huly-cli/dist/index.cjs)
printf -v SOURCE 'A%04X' "$RANDOM"
printf -v TARGET 'B%04X' "$RANDOM"
PROJECTS=(); ISSUES=()
INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"attribute-retry-certification","version":"1.0"}},"id":1}'
mcp() {
  local request response
  request=$(jq -nc --arg tool "$1" --argjson args "$2" '{jsonrpc:"2.0",method:"tools/call",params:{name:$tool,arguments:$args},id:2}')
  response=$(printf '%s\n%s\n' "$INIT" "$request" | timeout 45 env MCP_AUTO_EXIT=true HULY_TOOL_MODE=native node dist/index.cjs 2>/dev/null | jq -c 'select(.id == 2)')
  jq -e '.result.isError != true and .error == null' >/dev/null <<<"$response"
  jq -r '.result.content[0].text' <<<"$response"
}
move() {
  if [[ "$TRANSPORT" == mcp ]]; then mcp move_issue "$1"; else
    local issue destination resolutions
    issue=$(jq -r .issue <<<"$1"); destination=$(jq -c .destination <<<"$1")
    if jq -e 'has("resolutions")' >/dev/null <<<"$1"; then
      resolutions=$(jq -c .resolutions <<<"$1")
      "${CLI[@]}" issues move "$issue" --destination "$destination" --resolutions "$resolutions" --json
    else "${CLI[@]}" issues move "$issue" --destination "$destination" --json; fi
  fi
}
cleanup() {
  for issue in "${ISSUES[@]}"; do
    for project in "$SOURCE" "$TARGET"; do
      mcp delete_issue "$(jq -nc --arg project "$project" --arg identifier "$issue" '{project:$project,identifier:$identifier}')" >/dev/null 2>&1 || true
    done
  done
  for project in "${PROJECTS[@]}"; do
    for id in $(mcp list_components "$(jq -nc --arg project "$project" '{project:$project,limit:1000}')" | jq -r '.[].id'); do mcp delete_component "$(jq -nc --arg project "$project" --arg component "$id" '{project:$project,component:$component}')" >/dev/null || true; done
    for id in $(mcp list_milestones "$(jq -nc --arg project "$project" '{project:$project,limit:1000}')" | jq -r '.[].id'); do mcp delete_milestone "$(jq -nc --arg project "$project" --arg milestone "$id" '{project:$project,milestone:$milestone}')" >/dev/null || true; done
    mcp delete_project "$(jq -nc --arg project "$project" '{project:$project}')" >/dev/null || true; done
}
trap cleanup EXIT
for project in "$SOURCE" "$TARGET"; do
  mcp create_project "$(jq -nc --arg identifier "$project" '{identifier:$identifier,name:("Attribute retry " + $identifier)}')" >/dev/null
  PROJECTS+=("$project")
done
component() { mcp create_component "$(jq -nc --arg project "$1" --arg label "$2" '{project:$project,label:$label}')" | jq -r .id; }
milestone() { mcp create_milestone "$(jq -nc --arg project "$1" --arg label "$2" '{project:$project,label:$label,targetDate:1893456000000}')" | jq -r .id; }
SC=$(component "$SOURCE" 'Source only'); SM=$(milestone "$SOURCE" 'Source only')
TC=$(component "$TARGET" 'Destination replacement'); TM=$(milestone "$TARGET" 'Destination replacement')
EXSC=$(component "$SOURCE" 'Exact'); EXSM=$(milestone "$SOURCE" 'Exact')
EXTC=$(component "$TARGET" 'Exact'); EXTM=$(milestone "$TARGET" 'Exact')
ASC=$(component "$SOURCE" 'Ambiguous'); ATC1=$(component "$TARGET" 'Ambiguous'); ATC2=$(component "$TARGET" 'Ambiguous')
for TRANSPORT in mcp cli; do
  create() {
    local result
    result=$(mcp create_issue "$(jq -nc --arg project "$SOURCE" --arg component "$1" --arg milestone "$2" '{project:$project,title:"Attribute retry fixture"}')")
    ROOT=$(jq -r .issueId <<<"$result"); IDENTIFIER=$(jq -r .identifier <<<"$result"); ISSUES+=("$ROOT")
    mcp set_issue_component "$(jq -nc --arg project "$SOURCE" --arg identifier "$IDENTIFIER" --arg component "$1" '{project:$project,identifier:$identifier,component:$component}')" >/dev/null
    mcp set_issue_milestone "$(jq -nc --arg project "$SOURCE" --arg identifier "$IDENTIFIER" --arg milestone "$2" '{project:$project,identifier:$identifier,milestone:$milestone}')" >/dev/null
    CALL=$(jq -nc --arg issue "$ROOT" --arg project "$TARGET" '{issue:$issue,destination:{project:$project}}')
    STATE_ARGS=$(jq -nc --arg root "$ROOT" --arg source "$SOURCE" --arg target "$TARGET" '{issues:[$root],projects:[$source,$target]}')
  }
  create "$SC" "$SM"
  BEFORE=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$STATE_ARGS")
  BLOCKED=$(move "$CALL")
  jq -e --arg root "$ROOT" '.outcome == "blocked" and .changed == false and .discovery == "complete" and ([.conflicts[]|select(.code=="attribute")]|length)==2 and all(.conflicts[]; .issueId==$root and .clearingAllowed)' >/dev/null <<<"$BLOCKED"
  [[ "$(jq -Sc . <<<"$BEFORE")" == "$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$STATE_ARGS" | jq -Sc .)" ]]
  # Construct the accepted next call using only response field names and candidate IDs.
  RETRY=$(jq -c '.nextCall + {resolutions:[.conflicts[]|select(.code=="attribute")|{issueId,field,from,to:(if .field=="milestone" then null else .candidates[0]._id end)}]}' <<<"$BLOCKED")
  # Change the current source reference after the blocked response; stale consent cannot clear it.
  mcp set_issue_component "$(jq -nc --arg project "$SOURCE" --arg identifier "$IDENTIFIER" --arg component "$EXSC" '{project:$project,identifier:$identifier,component:$component}')" >/dev/null
  STALE_BEFORE=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$STATE_ARGS")
  STALE=$(move "$RETRY")
  jq -e --arg current "$EXSC" '.outcome=="blocked" and any(.conflicts[];.code=="stale-resolution" and .from==$current)' >/dev/null <<<"$STALE"
  [[ "$(jq -Sc . <<<"$STALE_BEFORE")" == "$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$STATE_ARGS" | jq -Sc .)" ]]
  mcp set_issue_component "$(jq -nc --arg project "$SOURCE" --arg identifier "$IDENTIFIER" --arg component "$SC" '{project:$project,identifier:$identifier,component:$component}')" >/dev/null
  COMPLETED=$(move "$RETRY")
  jq -e '.outcome=="completed" and any(.attributeChanges[];.field=="milestone" and .to==null and .reason=="explicit-clear") and any(.attributeChanges[];.field=="component" and .reason=="explicit-replacement")' >/dev/null <<<"$COMPLETED"
  AFTER=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$STATE_ARGS")
  jq -e --argjson retry "$RETRY" '.issues[0].issue.milestone==null and .issues[0].issue.component==($retry.resolutions[]|select(.field=="component")|.to)' >/dev/null <<<"$AFTER"
  create "$EXSC" "$EXSM"
  EXACT=$(move "$CALL")
  jq -e --arg component "$EXTC" --arg milestone "$EXTM" '.outcome=="completed" and (.attributeChanges|length)==2 and all(.attributeChanges[];.reason=="exact-name") and any(.attributeChanges[];.to==$component) and any(.attributeChanges[];.to==$milestone)' >/dev/null <<<"$EXACT"
  create "$ASC" "$SM"
  AMBIGUOUS=$(move "$CALL")
  jq -e --arg a "$ATC1" --arg b "$ATC2" '.outcome=="blocked" and any(.conflicts[];.field=="component" and any(.candidates[];._id==$a) and any(.candidates[];._id==$b))' >/dev/null <<<"$AMBIGUOUS"
  RESOLVED=$(jq -c --arg target "$ATC2" '.nextCall + {resolutions:[.conflicts[]|select(.code=="attribute")|{issueId,field,from,to:(if .field=="component" then $target else null end)}]}' <<<"$AMBIGUOUS")
  jq -e '.outcome=="completed"' >/dev/null <<<"$(move "$RESOLVED")"
  echo "PASS: $TRANSPORT simultaneous conflicts, schema-shaped retry, unchanged sequence/state, stale consent, selective clear, exact matches and ambiguity"
done
