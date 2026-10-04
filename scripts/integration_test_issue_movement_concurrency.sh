#!/usr/bin/env bash
# Final integrated 306–311 certification only. Creates disposable ordinary Huly fixtures.
set -Eeuo pipefail
FIXTURE_PHASE=setup
trap 'printf "FAIL: concurrency fixture phase=%s line=%s exit=%s\n" "$FIXTURE_PHASE" "$LINENO" "$?" >&2' ERR
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh" || exit 1
: "${HULY_URL:?Set ordinary local Huly URL}"
CLI=(node packages/huly-cli/dist/index.cjs)
TSX=(node node_modules/tsx/dist/cli.mjs)
BUNDLED=(node scripts/run-bundled.mjs)
CONCURRENCY_PROFILE=${HULY_MOVEMENT_CONCURRENCY_PROFILE:-routine}
case "$CONCURRENCY_PROFILE" in routine|expanded) ;; *) echo "Invalid concurrency profile: use routine or expanded" >&2; exit 1 ;; esac
# All unique cases remain on MCP; CLI retains refusal, both lost replies and outage/recovery.
select_concurrency_cases() {
  jq -c --arg transport "$1" --arg profile "$CONCURRENCY_PROFILE" 'select($profile=="expanded" or $transport=="mcp" or (.name as $name | ["refuse-stale-attribute","allocated-reply-lost","successful-batch-reply-lost","verification-outage"] | index($name)!=null))'
}
ALL_CASE_NAMES='["refuse-stale-child","preserve-later-child","refuse-stale-comment","preserve-later-comment","refuse-stale-time","preserve-later-time","refuse-stale-attribute","preserve-later-attribute","refuse-stale-ancestry","preserve-later-ancestry","before-allocation-send","allocated-reply-lost","successful-batch-reply-lost","verification-outage"]'
ROUTINE_CLI_NAMES='["refuse-stale-attribute","allocated-reply-lost","successful-batch-reply-lost","verification-outage"]'
CASE_MATRIX=$("${TSX[@]}" scripts/issue-movement-concurrency/matrix.ts) || exit 1
jq -es --argjson expected "$ALL_CASE_NAMES" 'length==14 and (map(.name)|sort)==($expected|sort)' >/dev/null <<<"$CASE_MATRIX"
printf -v SOURCE 'C%04X' "$RANDOM"
printf -v DESTINATION 'R%04X' "$RANDOM"
PROJECTS=()
declare -A COMPONENTS
INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"two-client-movement-certification","version":"1.0"}},"id":1}'
mcp() {
  local request response
  request=$(jq -nc --arg tool "$1" --argjson args "$2" '{jsonrpc:"2.0",method:"tools/call",params:{name:$tool,arguments:$args},id:2}')
  response=$(printf '%s\n%s\n' "$INIT" "$request" | timeout 45 env MCP_AUTO_EXIT=true HULY_TOOL_MODE=native node dist/index.cjs 2>/dev/null | jq -c 'select(.id == 2)')
  jq -e '.result.isError != true and .error == null' >/dev/null <<<"$response"
  jq -r '.result.content[0].text' <<<"$response"
}
cleanup() {
  local project ids id
  for project in "${PROJECTS[@]}"; do
    ids=$("${CLI[@]}" issues list --project "$project" --limit 200 --json 2>/dev/null | jq -r 'reverse | .[].issueId') || ids=''
    while IFS= read -r id; do
      [[ -n "$id" ]] || continue
      mcp delete_issue "$(jq -nc --arg project "$project" --arg identifier "$id" '{project:$project,identifier:$identifier}')" >/dev/null 2>&1 || true
    done <<<"$ids"
    mcp delete_project "$(jq -nc --arg project "$project" '{project:$project}')" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT
VERSION=$("${TSX[@]}" scripts/issue-movement-concurrency/version.ts "$HULY_URL")
jq -nc --argjson server "$VERSION" '{server:$server,transportBoundary:"ordinary REST; no custom extension",unobservable:["inside server batch execution; request boundaries do not prove partial-write isolation","config.json VERSION and model APIs do not establish transactor image identity"]}'
for project in "$SOURCE" "$DESTINATION"; do
  mcp create_project "$(jq -nc --arg identifier "$project" '{identifier:$identifier,name:("Disposable movement concurrency " + $identifier)}')" >/dev/null
  PROJECTS+=("$project")
  COMPONENTS[$project]=$("${CLI[@]}" components create "$project" 'Concurrent component' --json | jq -er .id)
done
create() {
  local result
  local args=(issues create --project "$1" --title "$2")
  if [[ -n "${3:-}" ]]; then args+=(--parent-issue "$3"); fi
  result=$("${CLI[@]}" "${args[@]}" --json)
  CREATED_ID=$(jq -er .issueId <<<"$result")
  CREATED_IDENTIFIER=$(jq -er .identifier <<<"$result")
}
create "$SOURCE" 'Alternative source ancestor'; SOURCE_PARENT="$CREATED_ID"
create "$DESTINATION" 'Alternative destination ancestor'; DESTINATION_PARENT="$CREATED_ID"
for transport in mcp cli; do
  SELECTED_CASES=$(select_concurrency_cases "$transport" <<<"$CASE_MATRIX") || exit 1
  EXPECTED_CASE_NAMES="$ALL_CASE_NAMES"
  if [[ "$CONCURRENCY_PROFILE" == routine && "$transport" == cli ]]; then EXPECTED_CASE_NAMES="$ROUTINE_CLI_NAMES"; fi
  jq -es --argjson expected "$EXPECTED_CASE_NAMES" 'length==($expected|length) and (map(.name)|sort)==($expected|sort)' >/dev/null <<<"$SELECTED_CASES"
  while IFS= read -r entry; do
    NAME=$(jq -r .name <<<"$entry")
    FIXTURE_PHASE="$transport:$NAME:setup"
    printf 'PHASE: concurrency profile=%s case=%s transport=%s\n' "$CONCURRENCY_PROFILE" "$NAME" "$transport" >&2
    KIND=$(jq -r .mutationKind <<<"$entry")
    create "$SOURCE" "Concurrency $transport $NAME"; ROOT_ID="$CREATED_ID"; ROOT_IDENTIFIER="$CREATED_IDENTIFIER"
    create "$SOURCE" "Existing child $NAME" "$ROOT_IDENTIFIER"; CHILD_ID="$CREATED_ID"; CHILD_IDENTIFIER="$CREATED_IDENTIFIER"
    create "$SOURCE" "Existing grandchild $NAME" "$CHILD_IDENTIFIER"; GRANDCHILD_ID="$CREATED_ID"
    "${CLI[@]}" comments add --project "$SOURCE" --issue-identifier "$CHILD_IDENTIFIER" --body "Preserved descendant comment $NAME" --json >/dev/null
    "${CLI[@]}" time log "$SOURCE" "$CHILD_IDENTIFIER" 0.25 --description "Preserved descendant report $NAME" --json >/dev/null
    MUTATION='[]'
    case "$KIND" in
      child) MUTATION='["issues","create","--project","@PROJECT","--title","Concurrent child","--parent-issue","@IDENTIFIER"]' ;;
      comment) MUTATION='["comments","add","--project","@PROJECT","--issue-identifier","@IDENTIFIER","--body","Concurrent preserved comment"]' ;;
      time) MUTATION='["time","log","@PROJECT","@IDENTIFIER","0.5","--description","Concurrent preserved time report"]' ;;
      attribute) MUTATION='["issues","component","set","--project","@PROJECT","--identifier","@IDENTIFIER","--component","Concurrent component"]' ;;
      ancestry) MUTATION='["issues","move","@ISSUE_ID","--destination","@PARENT_DESTINATION"]' ;;
    esac
    SNAPSHOT_ARGS=$(jq -nc --arg root "$ROOT_ID" --arg child "$CHILD_ID" --arg grandchild "$GRANDCHILD_ID" --arg source "$SOURCE" --arg destination "$DESTINATION" '{issues:[$root,$child,$grandchild],projects:[$source,$destination]}')
    BEFORE=$("${BUNDLED[@]}" scripts/integration-issue-transfer-state.ts "$SNAPSHOT_ARGS")
    ARGS=$(jq -nc --argjson entry "$entry" --arg upstream "$HULY_URL" --arg transport "$transport" --arg root "$ROOT_ID" --arg source "$SOURCE" --arg destination "$DESTINATION" --arg sourceParent "$SOURCE_PARENT" --arg destinationParent "$DESTINATION_PARENT" --argjson mutation "$MUTATION" '$entry + {upstream:$upstream,transport:$transport,movement:{issue:$root,destination:{project:$destination}},timeoutMs:90000,mutationTarget:{project:$source,issueId:$root},mutationParents:{($source):$sourceParent,($destination):$destinationParent},mutationArgs:$mutation} | del(.name,.expectedLocation)')
    FIXTURE_PHASE="$transport:$NAME:movement"
    RESULT=$("${BUNDLED[@]}" scripts/issue-movement-concurrency/scenario.ts "$ARGS")
    FIXTURE_PHASE="$transport:$NAME:verification"
    jq -c --arg transport "$transport" --arg case "$NAME" '{transport:$transport,case:$case,observation:.observation.status,outcome:.observation.result.outcome,changed:.observation.result.changed,reason:.observation.result.reason,discovery:.observation.result.discovery,verificationStatus:.observation.result.verification.status,verificationConsistency:.observation.result.verification.consistency}' <<<"$RESULT" >&2
    jq -e '.observation.status == "result" and any(.gatewayEvents[]; .event == "barrier")' >/dev/null <<<"$RESULT"
    AFTER_ARGS=$(jq -nc --argjson args "$SNAPSHOT_ARGS" --argjson before "$BEFORE" --arg destination "$DESTINATION" '$args + {migrationEvidence:{destinationSpace:($before.projects[]|select(.identifier==$destination)|._id),beforeRecordIds:[$before.issues[].owned.records[]._id]}}')
    AFTER=$("${BUNDLED[@]}" scripts/integration-issue-transfer-state.ts "$AFTER_ARGS")
    EXPECTED=$(jq -r .expectedLocation <<<"$entry")
    PROJECT="$SOURCE"; [[ "$EXPECTED" == destination ]] && PROJECT="$DESTINATION"
    jq -e --arg id "$ROOT_ID" --arg project "$PROJECT" '.mutation.after.issueId == $id and .mutation.after.project == $project' >/dev/null <<<"$RESULT"
    # Each original stable task remains readable in its independently observed current project.
    for id in "$ROOT_ID" "$CHILD_ID" "$GRANDCHILD_ID"; do
      "${CLI[@]}" issues get "$SOURCE" "$id" --json | jq -e --arg id "$id" --arg project "$PROJECT" '.issueId == $id and .project == $project' >/dev/null
    done
    if [[ "$KIND" == comment || "$KIND" == time ]]; then
      RECORD_ID=$(jq -er '.mutation.action.result.commentId // .mutation.action.result.reportId' <<<"$RESULT")
      jq -e --arg id "$RECORD_ID" --arg root "$ROOT_ID" '.issues[] | select(.issue._id == $root) | any(.owned.records[]; ._id == $id)' >/dev/null <<<"$AFTER"
    elif [[ "$KIND" == child ]]; then
      NEW_CHILD=$(jq -er .mutation.action.result.issueId <<<"$RESULT")
      "${CLI[@]}" issues get "$SOURCE" "$NEW_CHILD" --json | jq -e --arg id "$NEW_CHILD" --arg parent "$(jq -r .mutation.after.identifier <<<"$RESULT")" '.issueId == $id and .parentIssue == $parent' >/dev/null
    elif [[ "$KIND" == ancestry ]]; then
      jq -e '.mutation.action.result.outcome == "completed" and .mutation.after.parentIssue != null' >/dev/null <<<"$RESULT"
      EXPECTED_PARENT="$SOURCE_PARENT"; [[ "$EXPECTED" == destination ]] && EXPECTED_PARENT="$DESTINATION_PARENT"
      jq -e --arg root "$ROOT_ID" --arg parent "$EXPECTED_PARENT" '.issues[] | select(.issue._id == $root) | .issue.attachedTo == $parent' >/dev/null <<<"$AFTER"
    elif [[ "$KIND" == attribute ]]; then
      jq -e --arg root "$ROOT_ID" --arg component "${COMPONENTS[$PROJECT]}" '.issues[] | select(.issue._id == $root) | .issue.component == $component' >/dev/null <<<"$AFTER"
    fi
    # Baseline descendant-owned IDs must survive every race and interruption.
    RECORD_EVIDENCE=$(jq -L scripts -c --argjson before "$BEFORE" --arg root "$ROOT_ID" -f scripts/issue-movement-concurrency/assert-record-preservation.jq <<<"$AFTER")
    jq -c '{phase:"owned-record-preservation",valid,lastModificationEvidence,recordCount:(.records|length)}' <<<"$RECORD_EVIDENCE" >&2
    jq -e '.valid' >/dev/null <<<"$RECORD_EVIDENCE"
    # Unavailable metadata never authenticates completed movement; uncertainty remains explicit.
    if jq -e '.lastModificationEvidence=="unavailable"' >/dev/null <<<"$RECORD_EVIDENCE"; then
      jq -e '.observation.result.outcome=="incomplete" or .observation.result.outcome=="indeterminate"' >/dev/null <<<"$RESULT"
    fi
    # Single-send sequence evidence is measured independently, not inferred from a gateway response.
    EXPECTED_INCREMENT=3
    # A later independently created destination child reserves its own fourth number.
    [[ "$NAME" == preserve-later-child ]] && EXPECTED_INCREMENT=4
    [[ "$NAME" == before-allocation-send ]] && EXPECTED_INCREMENT=0
    [[ "$NAME" == allocated-reply-lost ]] && EXPECTED_INCREMENT=1
    jq -e --argjson before "$BEFORE" --arg destination "$DESTINATION" --argjson increment "$EXPECTED_INCREMENT" '(.projects[] | select(.identifier == $destination) | .sequence) == (($before.projects[] | select(.identifier == $destination) | .sequence) + $increment)' >/dev/null <<<"$AFTER"
    DESTINATION_ID=$(jq -er --arg destination "$DESTINATION" '.projects[] | select(.identifier == $destination) | ._id' <<<"$AFTER")
    PREVIOUS_SEQUENCE=$(jq -er --arg destination "$DESTINATION" '.projects[] | select(.identifier == $destination) | .sequence' <<<"$BEFORE")
    IDS=$(jq -nc --arg root "$ROOT_ID" --arg child "$CHILD_ID" --arg grandchild "$GRANDCHILD_ID" '[$root,$child,$grandchild]')
    jq -e --arg name "$NAME" --arg destinationId "$DESTINATION_ID" --argjson ids "$IDS" --argjson previousSequence "$PREVIOUS_SEQUENCE" --argjson after "$AFTER" -f scripts/issue-movement-concurrency/assert-outcome.jq >/dev/null <<<"$RESULT"
    if [[ "$NAME" == allocated-reply-lost || "$NAME" == successful-batch-reply-lost ]]; then
      jq -e '.observation.result.outcome == "indeterminate" and all(.gatewayEvents[]; .event != "retry-suppressed")' >/dev/null <<<"$RESULT"
    fi
    jq -nc --arg transport "$transport" --arg name "$NAME" --argjson result "$RESULT" '{transport:$transport,case:$name,evidence:$result}'
  done <<<"$SELECTED_CASES"
done
