#!/usr/bin/env bash
# Final certification only: run after slices 306–311 are integrated, through MCP and CLI.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh"
CLI=(node packages/huly-cli/dist/index.cjs)
printf -v SOURCE 'S%04X' "$RANDOM"
printf -v DESTINATION 'D%04X' "$RANDOM"
PROJECTS=()
ISSUES=()
TEAMSPACE=''
DOCUMENT=''
INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"leaf-transfer-certification","version":"1.0"}},"id":1}'
mcp() {
  local request response
  request=$(jq -nc --arg tool "$1" --argjson args "$2" '{jsonrpc:"2.0",method:"tools/call",params:{name:$tool,arguments:$args},id:2}')
  response=$(printf '%s\n%s\n' "$INIT" "$request" | timeout 45 env MCP_AUTO_EXIT=true HULY_TOOL_MODE=native node dist/index.cjs 2>/dev/null | jq -c 'select(.id == 2)')
  jq -e '.result.isError != true and .error == null' >/dev/null <<<"$response"
  jq -r '.result.content[0].text' <<<"$response"
}
cleanup() {
  for ((i=${#ISSUES[@]}-1; i>=0; i--)); do
    for project in "$SOURCE" "$DESTINATION"; do
      mcp delete_issue "$(jq -nc --arg project "$project" --arg identifier "${ISSUES[$i]}" '{project:$project,identifier:$identifier}')" >/dev/null 2>&1 || true
    done
  done
  if [[ -n "$DOCUMENT" ]]; then mcp delete_document "$(jq -nc --arg teamspace "$TEAMSPACE" --arg document "$DOCUMENT" '{teamspace:$teamspace,document:$document}')" >/dev/null || true; fi
  if [[ -n "$TEAMSPACE" ]]; then mcp delete_teamspace "$(jq -nc --arg teamspace "$TEAMSPACE" '{teamspace:$teamspace}')" >/dev/null || true; fi
  for project in "${PROJECTS[@]}"; do mcp delete_project "$(jq -nc --arg project "$project" '{project:$project}')" >/dev/null || true; done
}
trap cleanup EXIT
for project in "$SOURCE" "$DESTINATION"; do
  mcp create_project "$(jq -nc --arg identifier "$project" '{identifier:$identifier,name:("Leaf transfer certification " + $identifier)}')" >/dev/null
  PROJECTS+=("$project")
done
TEAMSPACE=$(mcp create_teamspace '{"name":"Disposable leaf transfer references"}' | jq -r .id)
DOC_RESULT=$(mcp create_document "$(jq -nc --arg teamspace "$TEAMSPACE" '{teamspace:$teamspace,title:"Independent transfer reference",content:"This document must stay independent."}')")
DOCUMENT=$(jq -r .id <<<"$DOC_RESULT")
DOC_URL=$(jq -r .url <<<"$DOC_RESULT")
DOC_BEFORE=$(mcp get_document "$(jq -nc --arg teamspace "$TEAMSPACE" --arg document "$DOCUMENT" '{teamspace:$teamspace,document:$document}')")
create() {
  local project="$1" parent="$2" result
  result=$(mcp create_issue "$(jq -nc --arg project "$project" --arg parent "$parent" --arg url "$DOC_URL" '{project:$project,title:"Leaf transfer fixture",description:("Independent [document](" + $url + ")"),estimation:2} + (if $parent == "" then {} else {parentIssue:$parent} end)')")
  CREATED=$(jq -r .identifier <<<"$result")
  CREATED_ID=$(jq -r .issueId <<<"$result")
  ISSUES+=("$CREATED_ID")
}
create "$SOURCE" ''; OLD="$CREATED"; OLD_ID="$CREATED_ID"
create "$DESTINATION" ''; PARENT="$CREATED"; PARENT_ID="$CREATED_ID"
create "$DESTINATION" "$PARENT"; EXISTING_ID="$CREATED_ID"
for transport in mcp cli; do
  create "$SOURCE" "$OLD"; ROOT="$CREATED"; ROOT_ID="$CREATED_ID"
  create "$SOURCE" ''; COUNTERPART="$CREATED"
  mcp add_issue_relation "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$ROOT" --arg targetIssue "$COUNTERPART" '{project:$project,issueIdentifier:$issueIdentifier,targetIssue:$targetIssue,relationType:"is-blocked-by"}')" >/dev/null
  mcp add_issue_relation "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$COUNTERPART" --arg targetIssue "$ROOT" '{project:$project,issueIdentifier:$issueIdentifier,targetIssue:$targetIssue,relationType:"is-blocked-by"}')" >/dev/null
  ARGS=$(jq -nc --arg root "$ROOT_ID" --arg old "$OLD_ID" --arg parent "$PARENT_ID" --arg existing "$EXISTING_ID" --arg source "$SOURCE" --arg target "$DESTINATION" '{issues:[$root,$old,$parent,$existing],projects:[$source,$target]}')
  BEFORE=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$ARGS")
  jq -e --arg root "$ROOT_ID" '.issues[] | select(.issue._id == $root) | .owned.records | any(.automaticHistory)' >/dev/null <<<"$BEFORE"
  DEST=$(jq -nc --arg project "$DESTINATION" --arg parent "$PARENT_ID" '{project:$project,parent:$parent}')
  if [[ "$transport" == mcp ]]; then RESULT=$(mcp move_issue "$(jq -nc --arg issue "$ROOT_ID" --argjson destination "$DEST" '{issue:$issue,destination:$destination}')"); else RESULT=$("${CLI[@]}" issues move "$ROOT_ID" --destination "$DEST" --json); fi
  jq -e --arg old "$ROOT" --arg root "$ROOT_ID" --arg parent "$PARENT_ID" '.outcome == "completed" and .changed and .issueId == $root and .parentId == $parent and .tasks[0].previousIdentifier == $old and .tasks[0].identifier != $old and (.tasks[0].url | startswith("http"))' >/dev/null <<<"$RESULT"
  AFTER=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$ARGS")
  jq -e --argjson before "$BEFORE" --arg root "$ROOT_ID" --arg parent "$PARENT_ID" '
    (.issues[] | select(.issue._id == $root)) as $after |
    ($before.issues[] | select(.issue._id == $root)) as $old |
    ($after.issue | del(.space,.identifier,.number,.rank,.attachedTo,.parents,.modifiedOn)) == ($old.issue | del(.space,.identifier,.number,.rank,.attachedTo,.parents,.modifiedOn)) and
    $after.issue.attachedTo == $parent and
    all($old.owned.records[]; . as $record | any($after.owned.records[]; ._id == $record._id and .history == $record.history and .modifiedBy == $record.modifiedBy and .modifiedOn == $record.modifiedOn and .space == $after.issue.space))' >/dev/null <<<"$AFTER"
  READ=$("${CLI[@]}" issues get "$SOURCE" "$ROOT_ID" --json)
  jq -e --arg project "$DESTINATION" --arg parent "$PARENT" '.project == $project and .parentIssue == $parent' >/dev/null <<<"$READ"
  REPEAT=$(mcp move_issue "$(jq -nc --arg issue "$ROOT_ID" --argjson destination "$DEST" '{issue:$issue,destination:$destination}')")
  jq -e '.outcome == "no-op" and .changed == false' >/dev/null <<<"$REPEAT"
  [[ "$(jq -Sc . <<<"$AFTER")" == "$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$ARGS" | jq -Sc .)" ]]
  # Ordinary comments are unsupported in slice 307; refusal must leave sequence and records untouched.
  create "$SOURCE" ''; REFUSED_ID="$CREATED_ID"
  mcp add_comment "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$CREATED" '{project:$project,issueIdentifier:$issueIdentifier,body:"Owned comment: refuse before writes"}')" >/dev/null
  REFUSED_ARGS=$(jq -nc --arg issue "$REFUSED_ID" --arg source "$SOURCE" --arg target "$DESTINATION" '{issues:[$issue],projects:[$source,$target]}')
  REFUSED_BEFORE=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$REFUSED_ARGS")
  BLOCKED=$(mcp move_issue "$(jq -nc --arg issue "$REFUSED_ID" --arg project "$DESTINATION" '{issue:$issue,destination:{project:$project}}')")
  jq -e '.outcome == "blocked" and .changed == false and (.reason | contains("Unsupported owned record"))' >/dev/null <<<"$BLOCKED"
  [[ "$(jq -Sc . <<<"$REFUSED_BEFORE")" == "$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$REFUSED_ARGS" | jq -Sc .)" ]]
  echo "PASS: $transport compatible leaf, history, stable recovery, independent reference, relations, no-op and pre-write owned-record refusal"
done
[[ "$(jq -Sc . <<<"$DOC_BEFORE")" == "$(mcp get_document "$(jq -nc --arg teamspace "$TEAMSPACE" --arg document "$DOCUMENT" '{teamspace:$teamspace,document:$document}')" | jq -Sc .)" ]]
