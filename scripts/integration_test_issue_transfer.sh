#!/usr/bin/env bash
# Final certification only: run after slices 306–311 are integrated, through MCP and CLI.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/test-telemetry-env.sh" || exit 1
CLI=(node packages/huly-cli/dist/index.cjs)
printf -v SOURCE 'S%04X' "$RANDOM"
printf -v DESTINATION 'D%04X' "$RANDOM"
PROJECTS=()
ISSUES=()
TEAMSPACE=''
DOCUMENT=''
DOWNLOAD_DIR=$(mktemp -d)
INIT='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"leaf-transfer-certification","version":"1.0"}},"id":1}'
mcp() {
  local request response
  request=$(jq -nc --arg tool "$1" --argjson args "$2" '{jsonrpc:"2.0",method:"tools/call",params:{name:$tool,arguments:$args},id:2}')
  response=$(printf '%s\n%s\n' "$INIT" "$request" | timeout 45 env MCP_AUTO_EXIT=true HULY_TOOL_MODE=native node dist/index.cjs 2>/dev/null | jq -c 'select(.id == 2)')
  jq -e '.result.isError != true and .error == null' >/dev/null <<<"$response"
  jq -r '.result.content[0].text' <<<"$response"
}
cleanup() {
  rm -rf "$DOWNLOAD_DIR"
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
  create "$SOURCE" ''; COUNTERPART="$CREATED"; COUNTERPART_ID="$CREATED_ID"
  mcp add_issue_relation "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$ROOT" --arg targetIssue "$COUNTERPART" '{project:$project,issueIdentifier:$issueIdentifier,targetIssue:$targetIssue,relationType:"is-blocked-by"}')" >/dev/null
  mcp add_issue_relation "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$COUNTERPART" --arg targetIssue "$ROOT" '{project:$project,issueIdentifier:$issueIdentifier,targetIssue:$targetIssue,relationType:"is-blocked-by"}')" >/dev/null
  ARGS=$(jq -nc --arg root "$ROOT_ID" --arg old "$OLD_ID" --arg parent "$PARENT_ID" --arg existing "$EXISTING_ID" --arg counterpart "$COUNTERPART_ID" --arg source "$SOURCE" --arg target "$DESTINATION" '{issues:[$root,$old,$parent,$existing,$counterpart],projects:[$source,$target]}')
  DESCRIPTION_BEFORE=$(mcp get_issue "$(jq -nc --arg project "$SOURCE" --arg identifier "$ROOT" '{project:$project,identifier:$identifier}')" | jq -r .description)
  # Rich leaf ownership fixture is exercised through both movement transports.
  COMMENT=$(mcp add_comment "$(jq -nc --arg project "$SOURCE" --arg issueIdentifier "$ROOT" '{project:$project,issueIdentifier:$issueIdentifier,body:"Owned comment with nested files"}')" | jq -r .commentId)
  REPLY=$(mcp add_activity_reply "$(jq -nc --arg messageId "$COMMENT" '{messageId:$messageId,body:"Nested thread preserves object refs"}')" | jq -r .replyId)
  mcp add_reaction "$(jq -nc --arg messageId "$COMMENT" '{messageId:$messageId,emoji:":thumbsup:"}')" >/dev/null
  mcp add_issue_label "$(jq -nc --arg project "$SOURCE" --arg identifier "$ROOT" '{project:$project,identifier:$identifier,label:"Transfer ownership certification"}')" >/dev/null
  mcp log_time "$(jq -nc --arg project "$SOURCE" --arg identifier "$ROOT" '{project:$project,identifier:$identifier,value:1.25,description:"Stable report payload"}')" >/dev/null
  ISSUE_FILE=$(mcp add_issue_attachment "$(jq -nc --arg project "$SOURCE" --arg identifier "$ROOT" '{project:$project,identifier:$identifier,filename:"issue.txt",contentType:"text/plain",data:"cHJlc2VydmVkIGJsb2I="}')" | jq -r .attachmentId)
  # The state helper supplies the SDK project ID; public get_issue is a presentation projection.
  SOURCE_SPACE=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$ARGS" | jq -r --arg root "$ROOT_ID" '.issues[] | select(.issue._id == $root) | .issue.space')
  NESTED_FILE=$(mcp add_attachment "$(jq -nc --arg objectId "$COMMENT" --arg space "$SOURCE_SPACE" '{objectId:$objectId,objectClass:"chunter:class:ChatMessage",space:$space,filename:"comment.txt",contentType:"text/plain",data:"cHJlc2VydmVkIGJsb2I="}')" | jq -r .attachmentId)
  REPLY_FILE=$(mcp add_attachment "$(jq -nc --arg objectId "$REPLY" --arg space "$SOURCE_SPACE" '{objectId:$objectId,objectClass:"chunter:class:ThreadMessage",space:$space,filename:"reply.txt",contentType:"text/plain",data:"cHJlc2VydmVkIGJsb2I="}')" | jq -r .attachmentId)
  pnpm exec tsx scripts/integration-issue-transfer-records.ts "$(jq -nc --arg issue "$ROOT_ID" --arg document "$DOCUMENT" '{issue:$issue,document:$document,mode:"references"}')" >/dev/null
  # Exercise the normal account against private/member-only destination permissions.
  # A restricted destination refuses before all movement effects, including allocation.
  pnpm exec tsx scripts/integration-issue-transfer-permissions.ts "$(jq -nc --arg project "$DESTINATION" '{project:$project,restricted:true}')" >/dev/null
  PERMISSION_BEFORE=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$ARGS")
  PERMISSION_DEST=$(jq -nc --arg project "$DESTINATION" --arg parent "$PARENT_ID" '{project:$project,parent:$parent}')
  if [[ "$transport" == mcp ]]; then PERMISSION_RESULT=$(mcp move_issue "$(jq -nc --arg issue "$ROOT_ID" --argjson destination "$PERMISSION_DEST" '{issue:$issue,destination:$destination}')"); else PERMISSION_RESULT=$("${CLI[@]}" issues move "$ROOT_ID" --destination "$PERMISSION_DEST" --json); fi
  jq -e '.outcome == "blocked" and .changed == false and (.reason | contains("Restricted project permissions"))' >/dev/null <<<"$PERMISSION_RESULT"
  [[ "$(jq -Sc . <<<"$PERMISSION_BEFORE")" == "$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$ARGS" | jq -Sc .)" ]]
  pnpm exec tsx scripts/integration-issue-transfer-permissions.ts "$(jq -nc --arg project "$DESTINATION" '{project:$project,restricted:false}')" >/dev/null
  BEFORE=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$ARGS")
  jq -e --arg root "$ROOT_ID" '.issues[] | select(.issue._id == $root) | .owned.records | any(.kind == "history")' >/dev/null <<<"$BEFORE"
  DEST=$(jq -nc --arg project "$DESTINATION" --arg parent "$PARENT_ID" '{project:$project,parent:$parent}')
  if [[ "$transport" == mcp ]]; then RESULT=$(mcp move_issue "$(jq -nc --arg issue "$ROOT_ID" --argjson destination "$DEST" '{issue:$issue,destination:$destination}')"); else RESULT=$("${CLI[@]}" issues move "$ROOT_ID" --destination "$DEST" --json); fi
  jq -e --arg old "$ROOT" --arg root "$ROOT_ID" --arg parent "$PARENT_ID" '.outcome == "completed" and .changed and .issueId == $root and .parentId == $parent and .tasks[0].previousIdentifier == $old and .tasks[0].identifier != $old and (.tasks[0].url | startswith("http"))' >/dev/null <<<"$RESULT"
  AFTER=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$ARGS")
  jq -e --argjson before "$BEFORE" --arg root "$ROOT_ID" --arg parent "$PARENT_ID" '
    (.issues[] | select(.issue._id == $root)) as $after |
    ($before.issues[] | select(.issue._id == $root)) as $old |
    ($after.issue | del(.space,.identifier,.number,.rank,.attachedTo,.parents,.modifiedOn)) == ($old.issue | del(.space,.identifier,.number,.rank,.attachedTo,.parents,.modifiedOn)) and
    $after.issue.attachedTo == $parent and
    $after.incomingReferences == $old.incomingReferences and
    (.projects | map(del(.sequence))) == ($before.projects | map(del(.sequence))) and
    all($old.owned.records[]; . as $record | any($after.owned.records[]; ._id == $record._id and (del(.space) == ($record | del(.space))) and .space == $after.issue.space))' >/dev/null <<<"$AFTER"
  jq -e --argjson before "$BEFORE" --arg root "$ROOT_ID" --arg old "$OLD_ID" --arg parent "$PARENT_ID" --arg existing "$EXISTING_ID" --arg counterpart "$COUNTERPART_ID" '
    (.issues[] | select(.issue._id == $old) | .issue) as $sourceParent |
    (.issues[] | select(.issue._id == $parent) | .issue) as $targetParent |
    ($before.issues[] | select(.issue._id == $parent) | .issue) as $previousParent |
    $sourceParent.subIssues == 0 and $sourceParent.childInfo == [] and
    $targetParent.subIssues == ($previousParent.subIssues + 1) and
    ($targetParent.childInfo | length) == (($previousParent.childInfo | length) + 1) and
    any($targetParent.childInfo[]; .childId == $root and .estimation == 2 and .reportedTime == 1.25) and
    all($previousParent.childInfo[]; . as $child | any($targetParent.childInfo[]; . == $child)) and
    (.issues[] | select(.issue._id == $existing) | .issue) == ($before.issues[] | select(.issue._id == $existing) | .issue) and
    (.issues[] | select(.issue._id == $counterpart) | .issue | del(.modifiedOn)) == ($before.issues[] | select(.issue._id == $counterpart) | .issue | del(.modifiedOn)) and
    (.issues[] | select(.issue._id == $root) | .issue.parents | map(.parentId)) == [$parent]' >/dev/null <<<"$AFTER"
  READ=$("${CLI[@]}" issues get "$SOURCE" "$ROOT_ID" --json)
  jq -e --arg project "$DESTINATION" --arg parent "$PARENT" '.project == $project and .parentIssue == $parent' >/dev/null <<<"$READ"
  jq -e --arg description "$DESCRIPTION_BEFORE" '.description == $description' >/dev/null <<<"$READ"
  MCP_DEST_READ=$(mcp get_issue "$(jq -nc --arg project "$DESTINATION" --arg identifier "$ROOT_ID" '{project:$project,identifier:$identifier}')")
  jq -e --arg description "$DESCRIPTION_BEFORE" '.description == $description' >/dev/null <<<"$MCP_DEST_READ"
  HISTORY_IDS=$(jq -c --arg root "$ROOT_ID" '[.issues[] | select(.issue._id == $root) | .owned.records[] | select(.kind == "history") | ._id]' <<<"$BEFORE")
  MCP_HISTORY=$(mcp list_activity "$(jq -nc --arg project "$DESTINATION" --arg issueIdentifier "$ROOT_ID" '{project:$project,issueIdentifier:$issueIdentifier,limit:200}')")
  CLI_HISTORY=$("${CLI[@]}" activity list --project "$DESTINATION" --issue-identifier "$ROOT_ID" --limit 200 --json)
  for history in "$MCP_HISTORY" "$CLI_HISTORY"; do
    jq -e --argjson ids "$HISTORY_IDS" '. as $messages | all($ids[]; . as $id | any($messages[]; .id == $id))' >/dev/null <<<"$history"
  done
  REPEAT=$(mcp move_issue "$(jq -nc --arg issue "$ROOT_ID" --argjson destination "$DEST" '{issue:$issue,destination:$destination}')")
  jq -e '.outcome == "no-op" and .changed == false' >/dev/null <<<"$REPEAT"
  [[ "$(jq -Sc . <<<"$AFTER")" == "$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$ARGS" | jq -Sc .)" ]]
  # Ordinary destination callers can still read comments/history and download unchanged blobs.
  mcp get_activity_message "$(jq -nc --arg messageId "$COMMENT" '{messageId:$messageId}')" | jq -e --arg id "$COMMENT" '.id == $id' >/dev/null
  mcp list_comments "$(jq -nc --arg project "$DESTINATION" --arg issueIdentifier "$ROOT_ID" '{project:$project,issueIdentifier:$issueIdentifier}')" | jq -e --arg id "$COMMENT" 'any(.[]; .id == $id)' >/dev/null
  mcp get_time_report "$(jq -nc --arg project "$DESTINATION" --arg identifier "$ROOT_ID" '{project:$project,identifier:$identifier}')" | jq -e '.totalTime == 1.25' >/dev/null
  for attachment in "$ISSUE_FILE" "$NESTED_FILE" "$REPLY_FILE"; do
    DOWNLOAD=$(mcp download_attachment "$(jq -nc --arg attachmentId "$attachment" '{attachmentId:$attachmentId}')" | jq -r .url)
    [[ -n "$DOWNLOAD" ]]
    "${CLI[@]}" attachments download "$attachment" --output "$DOWNLOAD_DIR/blob.txt" --json >/dev/null
    [[ "$(cat "$DOWNLOAD_DIR/blob.txt")" == 'preserved blob' ]]
    rm "$DOWNLOAD_DIR/blob.txt"
  done
  # A real unaudited attached class still refuses before sequence or record writes.
  create "$SOURCE" ''; REFUSED_ID="$CREATED_ID"
  pnpm exec tsx scripts/integration-issue-transfer-records.ts "$(jq -nc --arg issue "$REFUSED_ID" --arg document "$DOCUMENT" '{issue:$issue,document:$document,mode:"unsupported"}')" >/dev/null
  REFUSED_ARGS=$(jq -nc --arg issue "$REFUSED_ID" --arg source "$SOURCE" --arg target "$DESTINATION" '{issues:[$issue],projects:[$source,$target]}')
  REFUSED_BEFORE=$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$REFUSED_ARGS")
  BLOCKED=$(mcp move_issue "$(jq -nc --arg issue "$REFUSED_ID" --arg project "$DESTINATION" '{issue:$issue,destination:{project:$project}}')")
  jq -e '.outcome == "blocked" and .changed == false and (.reason | contains("Unsupported owned record"))' >/dev/null <<<"$BLOCKED"
  [[ "$(jq -Sc . <<<"$REFUSED_BEFORE")" == "$(pnpm exec tsx scripts/integration-issue-transfer-state.ts "$REFUSED_ARGS" | jq -Sc .)" ]]
  echo "PASS: $transport rich leaf, nested files, labels/time, immutable history, independent/dangling references, aggregates, no-op and unknown-class refusal"
done
[[ "$(jq -Sc . <<<"$DOC_BEFORE")" == "$(mcp get_document "$(jq -nc --arg teamspace "$TEAMSPACE" --arg document "$DOCUMENT" '{teamspace:$teamspace,document:$document}')" | jq -Sc .)" ]]
