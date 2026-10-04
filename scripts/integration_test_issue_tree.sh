#!/usr/bin/env bash
# Root executes this only after final combined 306–311 certification preflight.
set -Eeuo pipefail
# Report the source location, never command arguments or SDK credential payloads.
trap 'printf "FAIL: fixture command at line %s (exit %s)\n" "$LINENO" "$?" >&2' ERR
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh" || exit 1
CLI=(node packages/huly-cli/dist/index.cjs)
printf -v SOURCE 'T%04X' "$RANDOM"
printf -v TARGET 'U%04X' "$RANDOM"
ISSUES=(); PROJECTS=(); TEAMSPACE=''; DOCUMENT=''
INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"tree-transfer-certification","version":"1.0"}},"id":1}'
mcp() {
  local request response
  request=$(jq -nc --arg tool "$1" --argjson args "$2" '{jsonrpc:"2.0",method:"tools/call",params:{name:$tool,arguments:$args},id:2}')
  response=$(printf '%s\n%s\n' "$INIT" "$request" | timeout 45 env MCP_AUTO_EXIT=true HULY_TOOL_MODE=native node dist/index.cjs 2>/dev/null | jq -c 'select(.id==2)')
  jq -e '.result.isError != true and .error==null' >/dev/null <<<"$response"
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
assert_document_unchanged() {
  local current
  current=$(mcp get_document "$(jq -nc --arg teamspace "$TEAMSPACE" --arg document "$DOCUMENT" '{teamspace:$teamspace,document:$document}')")
  if [[ "$(jq -Sc . <<<"$DOC_BEFORE")" != "$(jq -Sc . <<<"$current")" ]]; then
    jq -nc --argjson before "$DOC_BEFORE" --argjson after "$current" '{expected:"independent-document-unchanged",changedKeys:((($before|keys)+($after|keys)|unique)|map(. as $key|select($before[$key]!=$after[$key])))}' >&2
    exit 1
  fi
}
cleanup() {
  local original_status=$? cleanup_status=0
  if ! node scripts/run-bundled.mjs scripts/integration-issue-transfer-records.ts "$(jq -nc --argjson ids "$FIXTURE_RECORD_IDS" '{mode:"cleanup",recordIds:$ids}')"; then
    echo "FAIL: explicit fixture record cleanup" >&2
    cleanup_status=1
  fi
  for ((index=${#ISSUES[@]}-1; index>=0; index--)); do
    for project in "$SOURCE" "$TARGET"; do mcp delete_issue "$(jq -nc --arg project "$project" --arg identifier "${ISSUES[$index]}" '{project:$project,identifier:$identifier}')" >/dev/null 2>&1 || true; done
  done
  if [[ -n "$DOCUMENT" ]]; then mcp delete_document "$(jq -nc --arg teamspace "$TEAMSPACE" --arg document "$DOCUMENT" '{teamspace:$teamspace,document:$document}')" >/dev/null || true; fi
  if [[ -n "$TEAMSPACE" ]]; then mcp delete_teamspace "$(jq -nc --arg teamspace "$TEAMSPACE" '{teamspace:$teamspace}')" >/dev/null || true; fi
  for project in "${PROJECTS[@]}"; do
    for id in $(mcp list_components "$(jq -nc --arg project "$project" '{project:$project}')" | jq -r '.[].id'); do mcp delete_component "$(jq -nc --arg project "$project" --arg component "$id" '{project:$project,component:$component}')" >/dev/null || true; done
    for id in $(mcp list_milestones "$(jq -nc --arg project "$project" '{project:$project}')" | jq -r '.[].id'); do mcp delete_milestone "$(jq -nc --arg project "$project" --arg milestone "$id" '{project:$project,milestone:$milestone}')" >/dev/null || true; done
    mcp delete_project "$(jq -nc --arg project "$project" '{project:$project}')" >/dev/null || true
  done
  trap - EXIT
  if [[ "$original_status" -ne 0 ]]; then exit "$original_status"; fi
  exit "$cleanup_status"
}
FIXTURE_RECORD_IDS='[]'
trap cleanup EXIT
for project in "$SOURCE" "$TARGET"; do
  mcp create_project "$(jq -nc --arg identifier "$project" '{identifier:$identifier,name:("Complete tree " + $identifier)}')" >/dev/null
  PROJECTS+=("$project")
done
TEAMSPACE=$(mcp create_teamspace '{"name":"Independent tree reference fixture"}' | jq -r .id)
DOC=$(mcp create_document "$(jq -nc --arg teamspace "$TEAMSPACE" '{teamspace:$teamspace,title:"Independent tree document",content:"Retain my location and content."}')")
DOCUMENT=$(jq -r .id <<<"$DOC"); DOC_URL=$(jq -r .url <<<"$DOC")
SC=$(mcp create_component "$(jq -nc --arg project "$SOURCE" '{project:$project,label:"Source tree attribute"}')" | jq -r .id)
TC=$(mcp create_component "$(jq -nc --arg project "$TARGET" '{project:$project,label:"Explicit child replacement"}')" | jq -r .id)
SM=$(mcp create_milestone "$(jq -nc --arg project "$SOURCE" '{project:$project,label:"Exact tree milestone",targetDate:1893456000000}')" | jq -r .id)
TM=$(mcp create_milestone "$(jq -nc --arg project "$TARGET" '{project:$project,label:"Exact tree milestone",targetDate:1893456000000}')" | jq -r .id)
create() {
  CREATED=$(mcp create_issue "$(jq -nc --arg project "$1" --arg parent "$2" --arg title "$3" --arg url "$DOC_URL" '{project:$project,title:$title,estimation:2,description:("Preserved independent [document](" + $url + ")")} + (if $parent=="" then {} else {parentIssue:$parent} end)')" | jq -r .issueId)
  ISSUES+=("$CREATED")
}
component() { mcp set_issue_component "$(jq -nc --arg project "$SOURCE" --arg identifier "$1" --arg component "$SC" '{project:$project,identifier:$identifier,component:$component}')" >/dev/null; }
rich_records() {
  local issue="$1" comment space
  comment=$(mcp add_comment "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$issue" '{project:$project,issueIdentifier:$issueIdentifier,body:"Each descendant retains nested supporting data"}')" | jq -r .commentId)
  space=$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-state.ts "$(jq -nc --arg issue "$issue" --arg source "$SOURCE" --arg target "$TARGET" '{issues:[$issue],projects:[$source,$target]}')" | jq -r '.issues[0].issue.space')
  mcp add_attachment "$(jq -nc --arg objectId "$comment" --arg space "$space" '{objectId:$objectId,objectClass:"chunter:class:ChatMessage",space:$space,filename:"nested.txt",contentType:"text/plain",data:"dHJlZS1ibG9i"}')" >/dev/null
  mcp add_issue_attachment "$(jq -nc --arg project "$SOURCE" --arg identifier "$issue" '{project:$project,identifier:$identifier,filename:"task.txt",contentType:"text/plain",data:"dHJlZS1ibG9i"}')" >/dev/null
  mcp add_issue_label "$(jq -nc --arg project "$SOURCE" --arg identifier "$issue" '{project:$project,identifier:$identifier,label:"Complete tree certification"}')" >/dev/null
  mcp log_time "$(jq -nc --arg project "$SOURCE" --arg identifier "$issue" '{project:$project,identifier:$identifier,value:1.25,description:"Per-task preserved report"}')" >/dev/null
  RECORD_RESULT=$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-records.ts "$(jq -nc --arg issue "$issue" --arg document "$DOCUMENT" '{issue:$issue,document:$document,mode:"references"}')")
  FIXTURE_RECORD_IDS=$(jq -nc --argjson before "$FIXTURE_RECORD_IDS" --argjson result "$RECORD_RESULT" '$before + $result.recordIds')
}
for TRANSPORT in mcp cli; do
  create "$SOURCE" '' "Source grandparent $TRANSPORT"; OLD_ANCESTOR="$CREATED"
  create "$SOURCE" "$OLD_ANCESTOR" "Source parent $TRANSPORT"; OLD_PARENT="$CREATED"
  create "$TARGET" '' "Destination grandparent $TRANSPORT"; NEW_ANCESTOR="$CREATED"
  create "$TARGET" "$NEW_ANCESTOR" "Destination parent $TRANSPORT"; NEW_PARENT="$CREATED"
  create "$SOURCE" "$OLD_PARENT" "Root $TRANSPORT"; ROOT="$CREATED"
  create "$SOURCE" "$ROOT" "Child $TRANSPORT"; CHILD="$CREATED"
  create "$SOURCE" "$CHILD" "Grandchild $TRANSPORT"; GRANDCHILD="$CREATED"
  component "$ROOT"; component "$CHILD"
  mcp set_issue_milestone "$(jq -nc --arg project "$SOURCE" --arg identifier "$GRANDCHILD" --arg milestone "$SM" '{project:$project,identifier:$identifier,milestone:$milestone}')" >/dev/null
  for issue in "$ROOT" "$CHILD" "$GRANDCHILD"; do rich_records "$issue"; done
  mcp add_issue_relation "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$ROOT" --arg targetIssue "$OLD_ANCESTOR" '{project:$project,issueIdentifier:$issueIdentifier,targetIssue:$targetIssue,relationType:"is-blocked-by"}')" >/dev/null
  mcp add_issue_relation "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$OLD_ANCESTOR" --arg targetIssue "$GRANDCHILD" '{project:$project,issueIdentifier:$issueIdentifier,targetIssue:$targetIssue,relationType:"is-blocked-by"}')" >/dev/null
  CALL=$(jq -nc --arg issue "$ROOT" --arg project "$TARGET" --arg parent "$NEW_PARENT" '{issue:$issue,destination:{project:$project,parent:$parent}}')
  IDS=$(jq -nc --arg root "$ROOT" --arg child "$CHILD" --arg grandchild "$GRANDCHILD" --arg op "$OLD_PARENT" --arg oa "$OLD_ANCESTOR" --arg np "$NEW_PARENT" --arg na "$NEW_ANCESTOR" '[$root,$child,$grandchild,$op,$oa,$np,$na]')
  STATE=$(jq -nc --argjson issues "$IDS" --arg source "$SOURCE" --arg target "$TARGET" '{issues:$issues,projects:[$source,$target]}')
  BEFORE=$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-state.ts "$STATE")
  DOC_BEFORE=$(mcp get_document "$(jq -nc --arg teamspace "$TEAMSPACE" --arg document "$DOCUMENT" '{teamspace:$teamspace,document:$document}')")
  BLOCKED=$(move "$CALL")
  jq -e --arg root "$ROOT" --arg child "$CHILD" '.outcome=="blocked" and .changed==false and .discovery=="complete" and ([.conflicts[]|select(.code=="attribute")|.issueId]|sort)==([$root,$child]|sort)' >/dev/null <<<"$BLOCKED"
  [[ "$(jq -Sc . <<<"$BEFORE")" == "$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-state.ts "$STATE" | jq -Sc .)" ]]
  RETRY=$(jq -c --arg root "$ROOT" --arg target "$TC" '.nextCall + {resolutions:[.conflicts[]|select(.code=="attribute")|{issueId,field,from,to:(if .issueId==$root then null else $target end)}]}' <<<"$BLOCKED")
  create "$SOURCE" "$ROOT" "New descendant $TRANSPORT"; ADDED="$CREATED"; component "$ADDED"; rich_records "$ADDED"
  NEW_BLOCKED=$(move "$RETRY")
  jq -e --arg added "$ADDED" '.outcome=="blocked" and .changed==false and any(.conflicts[];.code=="attribute" and .issueId==$added)' >/dev/null <<<"$NEW_BLOCKED"
  FINAL=$(jq -c --arg target "$TC" '.nextCall + {resolutions:(.nextCall.resolutions + [.conflicts[]|select(.code=="attribute")|{issueId,field,from,to:$target}])}' <<<"$NEW_BLOCKED")
  IDS=$(jq -c --arg added "$ADDED" '.+[$added]' <<<"$IDS"); STATE=$(jq -c --argjson issues "$IDS" '.issues=$issues' <<<"$STATE")
  BEFORE=$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-state.ts "$STATE")
  COMPLETED=$(move "$FINAL")
  jq -e --arg root "$ROOT" --arg child "$CHILD" --arg grandchild "$GRANDCHILD" --arg added "$ADDED" --arg milestone "$TM" '.outcome=="completed" and (.tasks|length)==4 and ([.tasks[].issueId]|sort)==([$root,$child,$grandchild,$added]|sort) and ([.tasks[].identifier]|unique|length)==4 and any(.attributeChanges[];.issueId==$root and .to==null and .reason=="explicit-clear") and any(.attributeChanges[];.issueId==$grandchild and .to==$milestone and .reason=="exact-name")' >/dev/null <<<"$COMPLETED"
  assert_document_unchanged
  AFTER_ARGS=$(jq -nc --argjson args "$STATE" --argjson before "$BEFORE" --arg destination "$TARGET" '$args + {migrationEvidence:{destinationSpace:($before.projects[]|select(.identifier==$destination)|._id),beforeRecordIds:[$before.issues[].owned.records[]._id]}}')
  AFTER=$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-state.ts "$AFTER_ARGS")
  jq -L scripts -e --argjson before "$BEFORE" --argjson moved "$COMPLETED" 'include "issue-transfer-record-preservation"; .migrationTransactions as $transactions | all($moved.tasks[]; . as $task | ($before.issues[]|select(.issue._id==$task.issueId)) as $old | (.issues[]|select(.issue._id==$task.issueId)) as $new | $new.issue.identifier==$task.identifier and $new.issue.attachedTo==($task.parentId // "tracker:ids:NoParent") and ($new.issue|del(.space,.identifier,.number,.rank,.attachedTo,.parents,.modifiedOn,.component,.milestone))==($old.issue|del(.space,.identifier,.number,.rank,.attachedTo,.parents,.modifiedOn,.component,.milestone)) and all($old.owned.records[]; . as $record | any($new.owned.records[]; ._id==$record._id and preserved_record($record; .; $transactions) and .space==$new.issue.space)))' >/dev/null <<<"$AFTER"
  jq -e --arg op "$OLD_PARENT" --arg oa "$OLD_ANCESTOR" --arg np "$NEW_PARENT" --arg na "$NEW_ANCESTOR" --arg root "$ROOT" --arg child "$CHILD" --arg gc "$GRANDCHILD" --arg added "$ADDED" 'all(.issues[]|select(.issue._id==$op or .issue._id==$oa); .issue.subIssues==(if .issue._id==$op then 0 else 1 end) and (.issue.childInfo|all(.childId!=$root and .childId!=$child and .childId!=$gc and .childId!=$added))) and all(.issues[]|select(.issue._id==$np or .issue._id==$na); (.issue.childInfo|map(.childId)|contains([$root,$child,$gc,$added])))' >/dev/null <<<"$AFTER"
  NOOP=$(jq -c 'del(.resolutions)' <<<"$FINAL")
  jq -e '.outcome=="no-op" and .changed==false and (.tasks|length)==4' >/dev/null <<<"$(move "$NOOP")"
  assert_document_unchanged
  echo "PASS: $TRANSPORT complete four-task tree, new-child scoped consent, nested data, history, references, mappings and ancestor aggregates"
done
assert_document_unchanged
