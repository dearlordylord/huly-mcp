#!/usr/bin/env bash
# Final integrated 306–311 certification only. Creates disposable ordinary Huly fixtures.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh"
: "${HULY_URL:?Set ordinary local Huly URL}"
: "${HULY_SERVER_BUILD:?Set exact running server image digest/build revision from deployment inspection}"
CLI=(node packages/huly-cli/dist/index.cjs)
TSX=(node node_modules/tsx/dist/cli.mjs)
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
jq -nc --argjson server "$VERSION" --arg build "$HULY_SERVER_BUILD" '{server:$server,serverBuild:$build,transportBoundary:"ordinary REST; no custom extension",unobservable:["inside server batch execution; request boundaries do not prove partial-write isolation"]}'
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
  while IFS= read -r entry; do
    NAME=$(jq -r .name <<<"$entry")
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
    BEFORE=$("${TSX[@]}" scripts/integration-issue-transfer-state.ts "$SNAPSHOT_ARGS")
    ARGS=$(jq -nc --argjson entry "$entry" --arg upstream "$HULY_URL" --arg transport "$transport" --arg root "$ROOT_ID" --arg source "$SOURCE" --arg destination "$DESTINATION" --arg sourceParent "$SOURCE_PARENT" --arg destinationParent "$DESTINATION_PARENT" --argjson mutation "$MUTATION" '$entry + {upstream:$upstream,transport:$transport,movement:{issue:$root,destination:{project:$destination}},timeoutMs:90000,mutationTarget:{project:$source,issueId:$root},mutationParents:{($source):$sourceParent,($destination):$destinationParent},mutationArgs:$mutation} | del(.name,.expectedLocation)')
    RESULT=$("${TSX[@]}" scripts/issue-movement-concurrency/scenario.ts "$ARGS")
    jq -e '.observation.status == "result" and any(.gatewayEvents[]; .event == "barrier")' >/dev/null <<<"$RESULT"
    AFTER=$("${TSX[@]}" scripts/integration-issue-transfer-state.ts "$SNAPSHOT_ARGS")
    EXPECTED=$(jq -r .expectedLocation <<<"$entry")
    PROJECT="$SOURCE"; [[ "$EXPECTED" == destination ]] && PROJECT="$DESTINATION"
    jq -e --arg id "$ROOT_ID" --arg project "$PROJECT" '.mutation.after.issueId == $id and .mutation.after.project == $project' >/dev/null <<<"$RESULT"
    # Each original stable task remains readable in its independently observed current project.
    for id in "$ROOT_ID" "$CHILD_ID" "$GRANDCHILD_ID"; do
      "${CLI[@]}" issues get "$SOURCE" "$id" --json | jq -e --arg id "$id" --arg project "$PROJECT" '.issueId == $id and .project == $project' >/dev/null
    done
    if [[ "$EXPECTED" == source ]]; then
      jq -e '.observation.result.outcome != "completed"' >/dev/null <<<"$RESULT"
    fi
    if [[ "$KIND" == comment || "$KIND" == time ]]; then
      RECORD_ID=$(jq -er '.mutation.result.commentId // .mutation.result.reportId' <<<"$RESULT")
      jq -e --arg id "$RECORD_ID" --arg root "$ROOT_ID" '.issues[] | select(.issue._id == $root) | any(.owned.records[]; ._id == $id)' >/dev/null <<<"$AFTER"
    elif [[ "$KIND" == child ]]; then
      NEW_CHILD=$(jq -er .mutation.result.issueId <<<"$RESULT")
      "${CLI[@]}" issues get "$SOURCE" "$NEW_CHILD" --json | jq -e --arg id "$NEW_CHILD" --arg parent "$(jq -r .mutation.after.identifier <<<"$RESULT")" '.issueId == $id and .parentIssue == $parent' >/dev/null
    elif [[ "$KIND" == ancestry ]]; then
      jq -e '.mutation.result.outcome == "completed" and .mutation.after.parentIssue != null' >/dev/null <<<"$RESULT"
      EXPECTED_PARENT="$SOURCE_PARENT"; [[ "$EXPECTED" == destination ]] && EXPECTED_PARENT="$DESTINATION_PARENT"
      jq -e --arg root "$ROOT_ID" --arg parent "$EXPECTED_PARENT" '.issues[] | select(.issue._id == $root) | .issue.attachedTo == $parent' >/dev/null <<<"$AFTER"
    elif [[ "$KIND" == attribute ]]; then
      jq -e --arg root "$ROOT_ID" --arg component "${COMPONENTS[$PROJECT]}" '.issues[] | select(.issue._id == $root) | .issue.component == $component' >/dev/null <<<"$AFTER"
    fi
    # Baseline descendant-owned IDs must survive every race and interruption.
    jq -e --argjson before "$BEFORE" '. as $after | all($before.issues[]; . as $old | any($after.issues[]; . as $current | .issue._id == $old.issue._id and all($old.owned.records[]; . as $record | any($current.owned.records[]; ._id == $record._id and .snapshot == $record.snapshot))))' >/dev/null <<<"$AFTER"
    # Single-send sequence evidence is measured independently, not inferred from a gateway response.
    EXPECTED_INCREMENT=3
    [[ "$NAME" == before-allocation-send ]] && EXPECTED_INCREMENT=0
    [[ "$NAME" == allocated-reply-lost ]] && EXPECTED_INCREMENT=1
    jq -e --argjson before "$BEFORE" --arg destination "$DESTINATION" --argjson increment "$EXPECTED_INCREMENT" '(.projects[] | select(.identifier == $destination) | .sequence) == (($before.projects[] | select(.identifier == $destination) | .sequence) + $increment)' >/dev/null <<<"$AFTER"
    if [[ "$NAME" == allocated-reply-lost || "$NAME" == successful-batch-reply-lost ]]; then
      jq -e '.observation.result.outcome == "indeterminate" and all(.gatewayEvents[]; .event != "retry-suppressed")' >/dev/null <<<"$RESULT"
    fi
    jq -nc --arg transport "$transport" --arg name "$NAME" --argjson result "$RESULT" '{transport:$transport,case:$name,evidence:$result}'
  done < <("${TSX[@]}" scripts/issue-movement-concurrency/matrix.ts)
done
