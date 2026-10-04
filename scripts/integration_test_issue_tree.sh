#!/usr/bin/env bash
# Root runs this after coherent all-slice build/preflight checks for repair feedback.
# Qualification still requires the same candidate gate, all five suites and final input audits.
set -Eeuo pipefail
# Report the source location, never command arguments or SDK credential payloads.
trap 'printf "FAIL: fixture command at line %s (exit %s)\n" "$LINENO" "$?" >&2' ERR
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh" || exit 1
CLI=(node packages/huly-cli/dist/index.cjs)
printf -v SOURCE 'T%04X' "$RANDOM"
printf -v TARGET 'U%04X' "$RANDOM"
ISSUES=(); PROJECTS=(); PROJECT_IDS=(); UNRESOLVED_CREATION=false; TEAMSPACE=''; DOCUMENT=''
tree_mcp_reply() {
  local tool="$1" response="$2" text
  if [[ -z "$response" ]]; then
    printf 'FAIL: tree MCP tool=%s phase=empty-reply\n' "$tool" >&2
    return 1
  fi
  if ! jq -es 'length==1 and (.[0]|type=="object" and .jsonrpc=="2.0" and .id==2 and (((.result|type)=="object") or ((.error|type)=="object")))' >/dev/null 2>&1 <<<"$response"; then
    printf 'FAIL: tree MCP tool=%s phase=envelope-shape\n' "$tool" >&2
    return 1
  fi
  if jq -e '.error!=null or .result.isError==true' >/dev/null <<<"$response"; then
    printf 'FAIL: tree MCP tool=%s phase=envelope-error\n' "$tool" >&2
    return 1
  fi
  if ! jq -e '(.result.content | type=="array" and length==1) and (.result.content[0] | type=="object" and .type=="text" and (.text | type=="string" and length>0)) and ((.result | has("isError") | not) or (.result.isError | type=="boolean"))' >/dev/null 2>&1 <<<"$response"; then
    printf 'FAIL: tree MCP tool=%s phase=result-shape\n' "$tool" >&2
    return 1
  fi
  text=$(jq -er '.result.content[0].text | select(type=="string" and length>0)' 2>/dev/null <<<"$response") || {
    printf 'FAIL: tree MCP tool=%s phase=result-text\n' "$tool" >&2
    return 1
  }
  if ! jq -es 'length==1' >/dev/null 2>&1 <<<"$text"; then
    printf 'FAIL: tree MCP tool=%s phase=result-json\n' "$tool" >&2
    return 1
  fi
  printf '%s\n' "$text"
}
TREE_MCP_COMMAND_TIMEOUT_SECONDS=80
mcp() {
  local response call_status=0 category=process-exit
  printf 'PHASE: tree MCP tool=%s call\n' "$1" >&2
  response=$(timeout "$TREE_MCP_COMMAND_TIMEOUT_SECONDS" node scripts/run-bundled.mjs scripts/integration-mcp-call-main.ts "$1" "$2") || call_status=$?
  if (( call_status != 0 )); then
    [[ "$call_status" == 124 ]] && category=timeout
    printf 'FAIL: tree MCP tool=%s phase=%s exit=%s\n' "$1" "$category" "$call_status" >&2
    return "$call_status"
  fi
  tree_mcp_reply "$1" "$response" || return 1
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
retain_tree_result() {
  local result="$1" transport="$2" directory="${MOVEMENT_PRIVATE_EVIDENCE_DIR:-}" normalized
  [[ -z "$directory" ]] && return 0
  if [[ "$directory" != /* || ! -d "$directory" || -L "$directory" || ! -O "$directory" ]]; then
    printf 'FAIL: private tree evidence directory unavailable\n' >&2
    return 1
  fi
  normalized=$(cd -P -- "$directory" && pwd) || return 1
  if [[ "$normalized" != "$directory" || "$transport" != mcp && "$transport" != cli ]]; then
    printf 'FAIL: private tree evidence path invalid\n' >&2
    return 1
  fi
  if [[ "$(stat -c '%a' "$directory" 2>/dev/null || stat -f '%Lp' "$directory")" != 700 ]]; then
    printf 'FAIL: private tree evidence directory permissions invalid\n' >&2
    return 1
  fi
  (umask 077; set -o noclobber; printf '%s\n' "$result" > "$directory/tree-final-$transport.json") 2>/dev/null || {
    printf 'FAIL: private tree evidence write unavailable\n' >&2
    return 1
  }
}
assert_tree_completion() {
  local result="$1"
  shift
  if ! jq -e "$@" >/dev/null 2>/dev/null <<<"$result"; then
    jq -nc --argjson result "$result" '
      def allowed($value; $values): if ($values|index($value))!=null then $value else null end;
      def count_array($value): if ($value|type)=="array" then ($value|length) else null end;
      # Categories describe audited producer prefixes, never arbitrary reason text.
      def reason_category($value):
        if ($value|type)!="string" then "unclassified"
        elif $value=="Complete post-write project inventory is unavailable." then "project-inventory-unavailable"
        elif $value=="Descendant closure could not be read completely." then "descendant-closure-unavailable"
        elif $value=="Observed descendant closure differs from the complete planned tree." then "descendant-closure-mismatch"
        elif $value|startswith("Movement deadline or response unavailable;") then "movement-deadline-or-unavailable"
        elif $value|startswith("Movement deadline interrupted remaining verification reads.") then "verification-deadline-interrupted"
        elif $value|startswith("Post-send verification read failed or exceeded the deadline.") then "verification-read-or-deadline"
        elif $value|startswith("Verification reads unavailable;") then "verification-unavailable"
        elif $value|startswith("Earlier observed discrepancies remain unresolved by subsequent incomplete reads:") then "earlier-discrepancy-retained"
        elif $value|startswith("Protected payload of ") then "protected-task-payload"
        elif $value|startswith("Observed protected payload or ownership of record ") then "protected-record-payload"
        elif $value|startswith("Own migration metadata of record ") then "record-metadata-authentication"
        elif $value|startswith("Current task ") then "current-task-observation"
        elif $value|startswith("Current payload of ") then "current-task-payload-observation"
        elif $value|startswith("Record closure of ") then "record-closure-observation"
        else "unclassified" end;
      {expected:"complete-tree-mapping",
       outcome:(allowed($result.outcome; ["completed","blocked","no-op","incomplete","indeterminate"]) // "invalid"),
       changed:(if ($result.changed|type)=="boolean" then $result.changed else null end),
       taskCount:count_array($result.tasks),
       executionPhase:allowed($result.execution.phase; ["allocation","commit","verification"]),
       commitConfirmation:allowed($result.execution.commit; ["not-sent","sent","refused","reply-lost","acknowledged"]),
       reservationCount:count_array($result.execution.reservations),
       confirmedReservationCount:(if ($result.execution.reservations|type)=="array" then ([$result.execution.reservations[]|select(.status=="confirmed")]|length) else null end),
       uncertainReservationCount:(if ($result.execution.reservations|type)=="array" then ([$result.execution.reservations[]|select(.status=="uncertain")]|length) else null end),
       verificationStatus:allowed($result.verification.status; ["not-attempted","unavailable","observed"]),
       verificationCompleteness:allowed($result.verification.completeness; ["complete","incomplete"]),
       verificationConsistency:allowed($result.verification.consistency; ["consistent","inconsistent","undetermined"]),
       observedTaskCount:count_array($result.verification.tasks),
       observedRecordCount:count_array($result.verification.records),
       confirmedAbsentTaskCount:count_array($result.verification.absentIssueIds),
       reasonCategory:reason_category($result.reason),
       verificationReasonCategory:reason_category($result.verification.reason)}
    ' >&2 2>/dev/null || printf 'FAIL: tree completion result is not JSON\n' >&2
    return 1
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
  local cleanup_input
  cleanup_input=$(jq -nc --argjson issues "$(printf '%s\n' "${ISSUES[@]}" | jq -Rsc 'split("\n")|map(select(length>0))')" --argjson projects "$(printf '%s\n' "${PROJECT_IDS[@]}" | jq -Rsc 'split("\n")|map(select(length>0))')" --arg document "$DOCUMENT" --arg teamspace "$TEAMSPACE" --argjson records "$FIXTURE_RECORD_IDS" --argjson unresolved "$UNRESOLVED_CREATION" '{mode:"cleanup",input:{issueIds:$issues,projectIds:$projects,unresolvedCreation:$unresolved,documentIds:([$document]|map(select(length>0))),teamspaceIds:([$teamspace]|map(select(length>0))),recordIds:$records}}') || cleanup_status=1
  if [[ "$cleanup_status" == 0 ]]; then
    # One finite cleanup process. Its public receipt distinguishes acknowledgement from observed absence.
    timeout --signal=KILL 120 node scripts/run-bundled.mjs scripts/integration-issue-tree-cleanup.ts "$cleanup_input" || cleanup_status=1
  fi
  if [[ "$cleanup_status" != 0 ]]; then printf 'FAIL: tree cleanup resource absence unresolved\n' >&2; fi
  trap - EXIT
  if [[ "$original_status" -ne 0 ]]; then exit "$original_status"; fi
  exit "$cleanup_status"
}
FIXTURE_RECORD_IDS='[]'
trap cleanup EXIT
for project in "$SOURCE" "$TARGET"; do
  UNRESOLVED_CREATION=true
  mcp create_project "$(jq -nc --arg identifier "$project" '{identifier:$identifier,name:("Complete tree " + $identifier)}')" >/dev/null
  PROJECTS+=("$project")
  UNRESOLVED_CREATION=true
  captured_project=$(node scripts/run-bundled.mjs scripts/integration-issue-tree-cleanup.ts "$(jq -nc --arg project "$project" '{mode:"capture-project",identifier:$project,name:("Complete tree " + $project)}')" | jq -er '.projectId | select(type=="string" and length>0)')
  PROJECT_IDS+=("$captured_project")
  UNRESOLVED_CREATION=false
done
UNRESOLVED_CREATION=true
TEAMSPACE=$(mcp create_teamspace '{"name":"Independent tree reference fixture"}' | jq -er '.id | select(type=="string" and length>0)')
DOC=$(mcp create_document "$(jq -nc --arg teamspace "$TEAMSPACE" '{teamspace:$teamspace,title:"Independent tree document",content:"Retain my location and content."}')")
DOCUMENT=$(jq -er ' .id | select(type=="string" and length>0)' <<<"$DOC"); DOC_URL=$(jq -r .url <<<"$DOC")
UNRESOLVED_CREATION=false
SC=$(mcp create_component "$(jq -nc --arg project "$SOURCE" '{project:$project,label:"Source tree attribute"}')" | jq -r .id)
TC=$(mcp create_component "$(jq -nc --arg project "$TARGET" '{project:$project,label:"Explicit child replacement"}')" | jq -r .id)
SM=$(mcp create_milestone "$(jq -nc --arg project "$SOURCE" '{project:$project,label:"Exact tree milestone",targetDate:1893456000000}')" | jq -r .id)
TM=$(mcp create_milestone "$(jq -nc --arg project "$TARGET" '{project:$project,label:"Exact tree milestone",targetDate:1893456000000}')" | jq -r .id)
create() {
  UNRESOLVED_CREATION=true
  CREATED=$(mcp create_issue "$(jq -nc --arg project "$1" --arg parent "$2" --arg title "$3" --arg url "$DOC_URL" '{project:$project,title:$title,estimation:2,description:("Preserved independent [document](" + $url + ")")} + (if $parent=="" then {} else {parentIssue:$parent} end)')" | jq -er '.issueId | select(type=="string" and length>0)')
  ISSUES+=("$CREATED")
  UNRESOLVED_CREATION=false
}
component() { mcp set_issue_component "$(jq -nc --arg project "$SOURCE" --arg identifier "$1" --arg component "$SC" '{project:$project,identifier:$identifier,component:$component}')" >/dev/null; }
rich_records() {
  local issue="$1" comment space
  UNRESOLVED_CREATION=true
  comment=$(mcp add_comment "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$issue" '{project:$project,issueIdentifier:$issueIdentifier,body:"Each descendant retains nested supporting data"}')" | jq -r .commentId)
  space=$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-state.ts "$(jq -nc --arg issue "$issue" --arg source "$SOURCE" --arg target "$TARGET" '{issues:[$issue],projects:[$source,$target]}')" | jq -r '.issues[0].issue.space')
  mcp add_attachment "$(jq -nc --arg objectId "$comment" --arg space "$space" '{objectId:$objectId,objectClass:"chunter:class:ChatMessage",space:$space,filename:"nested.txt",contentType:"text/plain",data:"dHJlZS1ibG9i"}')" >/dev/null
  mcp add_issue_attachment "$(jq -nc --arg project "$SOURCE" --arg identifier "$issue" '{project:$project,identifier:$identifier,filename:"task.txt",contentType:"text/plain",data:"dHJlZS1ibG9i"}')" >/dev/null
  mcp add_issue_label "$(jq -nc --arg project "$SOURCE" --arg identifier "$issue" '{project:$project,identifier:$identifier,label:"Complete tree certification"}')" >/dev/null
  mcp log_time "$(jq -nc --arg project "$SOURCE" --arg identifier "$issue" '{project:$project,identifier:$identifier,value:1.25,description:"Per-task preserved report"}')" >/dev/null
  RECORD_RESULT=$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-records.ts "$(jq -nc --arg issue "$issue" --arg document "$DOCUMENT" '{issue:$issue,document:$document,mode:"references"}')")
  FIXTURE_RECORD_IDS=$(jq -nc --argjson before "$FIXTURE_RECORD_IDS" --argjson result "$RECORD_RESULT" '$before + $result.recordIds')
  UNRESOLVED_CREATION=false
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
  assert_document_unchanged
  RETRY=$(jq -c --arg root "$ROOT" --arg target "$TC" '.nextCall + {resolutions:[.conflicts[]|select(.code=="attribute")|{issueId,field,from,to:(if .issueId==$root then null else $target end)}]}' <<<"$BLOCKED")
  create "$SOURCE" "$ROOT" "New descendant $TRANSPORT"; ADDED="$CREATED"; component "$ADDED"; rich_records "$ADDED"
  DOC_BEFORE=$(mcp get_document "$(jq -nc --arg teamspace "$TEAMSPACE" --arg document "$DOCUMENT" '{teamspace:$teamspace,document:$document}')")
  NEW_BLOCKED=$(move "$RETRY")
  jq -e --arg added "$ADDED" '.outcome=="blocked" and .changed==false and any(.conflicts[];.code=="attribute" and .issueId==$added)' >/dev/null <<<"$NEW_BLOCKED"
  assert_document_unchanged
  FINAL=$(jq -c --arg target "$TC" '.nextCall + {resolutions:(.nextCall.resolutions + [.conflicts[]|select(.code=="attribute")|{issueId,field,from,to:$target}])}' <<<"$NEW_BLOCKED")
  IDS=$(jq -c --arg added "$ADDED" '.+[$added]' <<<"$IDS"); STATE=$(jq -c --argjson issues "$IDS" '.issues=$issues' <<<"$STATE")
  BEFORE=$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-state.ts "$STATE")
  COMPLETED=$(move "$FINAL")
  retain_tree_result "$COMPLETED" "$TRANSPORT"
  assert_tree_completion "$COMPLETED" --arg root "$ROOT" --arg child "$CHILD" --arg grandchild "$GRANDCHILD" --arg added "$ADDED" --arg milestone "$TM" '.outcome=="completed" and (.tasks|length)==4 and ([.tasks[].issueId]|sort)==([$root,$child,$grandchild,$added]|sort) and ([.tasks[].identifier]|unique|length)==4 and any(.attributeChanges[];.issueId==$root and .to==null and .reason=="explicit-clear") and any(.attributeChanges[];.issueId==$grandchild and .to==$milestone and .reason=="exact-name")' || exit 1
  assert_document_unchanged
  AFTER_ARGS=$(jq -nc --argjson args "$STATE" --argjson before "$BEFORE" --arg destination "$TARGET" '$args + {migrationEvidence:{destinationSpace:($before.projects[]|select(.identifier==$destination)|._id),beforeRecordIds:[$before.issues[].owned.records[]._id]}}')
  AFTER=$(node scripts/run-bundled.mjs scripts/integration-issue-transfer-state.ts "$AFTER_ARGS")
  jq -L scripts -e --argjson before "$BEFORE" --argjson moved "$COMPLETED" 'include "issue-transfer-record-preservation"; include "issue-tree-aggregates"; . as $after | tree_aggregates_valid($after) and (.migrationTransactions as $transactions | all($moved.tasks[]; . as $task | ($before.issues[]|select(.issue._id==$task.issueId)) as $old | ($after.issues[]|select(.issue._id==$task.issueId)) as $new | issue_history_anchor($old; $new) as $anchor | $new.issue.identifier==$task.identifier and $new.issue.attachedTo==($task.parentId // "tracker:ids:NoParent") and ($new.issue|del(.space,.identifier,.number,.rank,.attachedTo,.parents,.modifiedOn,.component,.milestone,.childInfo))==($old.issue|del(.space,.identifier,.number,.rank,.attachedTo,.parents,.modifiedOn,.component,.milestone,.childInfo)) and all($old.owned.records[]; . as $record | any($new.owned.records[]; ._id==$record._id and preserved_record($record; .; $transactions; $anchor) and .space==$new.issue.space))))' >/dev/null <<<"$AFTER"
  jq -e --arg op "$OLD_PARENT" --arg oa "$OLD_ANCESTOR" --arg np "$NEW_PARENT" --arg na "$NEW_ANCESTOR" --arg root "$ROOT" --arg child "$CHILD" --arg gc "$GRANDCHILD" --arg added "$ADDED" 'all(.issues[]|select(.issue._id==$op or .issue._id==$oa); .issue.subIssues==(if .issue._id==$op then 0 else 1 end) and (.issue.childInfo|all(.childId!=$root and .childId!=$child and .childId!=$gc and .childId!=$added))) and all(.issues[]|select(.issue._id==$np or .issue._id==$na); (.issue.childInfo|map(.childId)|contains([$root,$child,$gc,$added])))' >/dev/null <<<"$AFTER"
  NOOP=$(jq -c 'del(.resolutions)' <<<"$FINAL")
  jq -e '.outcome=="no-op" and .changed==false and (.tasks|length)==4' >/dev/null <<<"$(move "$NOOP")"
  assert_document_unchanged
  echo "PASS: $TRANSPORT complete four-task tree, new-child scoped consent, nested data, history, references, mappings and ancestor aggregates"
done
assert_document_unchanged
