#!/usr/bin/env bash
# Pure jq predicate smoke. No process connects to Huly or substitutes SDK behavior.
set -euo pipefail
PREDICATE="$(dirname "${BASH_SOURCE[0]}")/assert-outcome.jq"
IDS='["root","child","grandchild"]'
AFTER='{"issues":[{"issue":{"_id":"root","space":"source","number":1}},{"issue":{"_id":"child","space":"source","number":2}},{"issue":{"_id":"grandchild","space":"source","number":3}}]}'
BASE=$(jq -nc --argjson ids "$IDS" '{
  observation:{status:"result",result:{outcome:"incomplete",reason:"Scoped conditions refused; reserved numbers may leave gaps.",issueIds:$ids,inspection:"Inspect every stable ID before retry.",destination:{projectId:"destination",parentId:null},discovery:{status:"complete"},execution:{phase:"commit",commit:"refused",reservations:[$ids | to_entries[] | {status:"confirmed",issueId:.value,number:(21 + .key)}]},verification:{status:"observed",completeness:"complete",consistency:"inconsistent",reason:"Observed task differs from planned ancestry.",tasks:[$ids | to_entries[] | {issueId:.value,projectId:"source",parentId:null,identifier:("SOURCE-" + ((.key + 1)|tostring)),number:(.key + 1)}],records:[]}}},
  gatewayEvents:[{event:"barrier",point:"commit-before",action:"pause"}],
  mutation:{before:{issueId:"root",identifier:"SOURCE-1",title:"Fixture",status:"Backlog",labels:[],project:"SOURCE"},after:{issueId:"root",identifier:"SOURCE-1",title:"Fixture",status:"Backlog",labels:[],project:"SOURCE"},action:{kind:"none"}}
}')
COMPLETED=$(jq -nc --argjson ids "$IDS" '{outcome:"completed",changed:true,issueId:"root",projectId:"destination",parentId:null,tasks:[$ids | to_entries[] | {issueId:.value,previousIdentifier:("SOURCE-"+((.key+1)|tostring)),identifier:("DEST-"+((.key+21)|tostring)),parentId:null,url:("http://localhost/"+.value)}]}')
check() {
  jq -e --arg name "$1" --arg destinationId destination --argjson ids "$IDS" --argjson previousSequence 20 --argjson after "${3:-$AFTER}" -f "$PREDICATE" >/dev/null <<<"$2"
}
reject() {
  if check "$1" "$2" "${3:-$AFTER}"; then echo "Predicate falsely accepted $1" >&2; exit 1; fi
}
for kind in child comment time attribute ancestry; do
  check "refuse-stale-$kind" "$BASE"
  POST=$(jq -c '.observation.result.execution={phase:"verification",commit:"acknowledged",reservations:.observation.result.execution.reservations}' <<<"$BASE")
  check "preserve-later-$kind" "$POST"
  for name in "refuse-stale-$kind" "preserve-later-$kind"; do
    reject "$name" "$(jq -c --argjson completed "$COMPLETED" '.observation.result=$completed' <<<"$BASE")"
    reject "$name" "$(jq -c --argjson completed "$COMPLETED" '.observation.result=($completed + {outcome:"no-op",changed:false})' <<<"$BASE")"
  done
done
OUTAGE=$(jq -c '.observation.result.outcome="indeterminate" | .observation.result.execution.commit="acknowledged" | .observation.result.execution.phase="verification" | .observation.result.verification={status:"unavailable",reason:"Post-write inventory unavailable."}' <<<"$BASE")
check verification-outage "$OUTAGE"
reject verification-outage "$(jq -c --argjson completed "$COMPLETED" '.observation.result=$completed' <<<"$OUTAGE")"
reject verification-outage "$(jq -c '.observation.result.verification={status:"observed",completeness:"complete",consistency:"consistent",tasks:[],records:[]}' <<<"$OUTAGE")"
LOST=$(jq -c '.observation.result.outcome="indeterminate" | .observation.result.execution.commit="reply-lost" | .observation.result.verification.consistency="consistent" | del(.observation.result.verification.reason)' <<<"$BASE")
check successful-batch-reply-lost "$LOST"
reject successful-batch-reply-lost "$(jq -c --argjson completed "$COMPLETED" '.observation.result=$completed' <<<"$LOST")"
ALLOCATION=$(jq -c '.observation.result.outcome="indeterminate" | .observation.result.execution={phase:"allocation",commit:"not-sent",reservations:[{status:"uncertain",issueId:"root"}]} | .observation.result.verification={status:"not-attempted"}' <<<"$BASE")
for name in before-allocation-send allocated-reply-lost; do
  check "$name" "$ALLOCATION"
  reject "$name" "$(jq -c '.observation.result.execution.reservations[0]={status:"confirmed",issueId:"root",number:21}' <<<"$ALLOCATION")"
done
reject refuse-stale-child "$(jq -c '.observation.result.execution.reservations[0].number=999' <<<"$BASE")"
echo 'PASS: fourteen case predicates; completed/no-op, unavailable-proof and reservation counterexamples rejected'

# Partial is accepted only for independently preserved later ancestry with a
# known contradiction, one acknowledged send, and an explicit deadline limitation.
PARTIAL_AFTER='{"issues":[{"issue":{"_id":"root","space":"destination","attachedTo":"later-parent","identifier":"DEST-21","title":"Fixture","modifiedOn":2}}]}'
PARTIAL=$(jq -c --argjson ids "$IDS" '
  .observation.result.execution.phase="verification" |
  .observation.result.execution.commit="acknowledged" |
  .observation.result.verification.completeness="incomplete" |
  .observation.result.verification.reason="Task root differs from its planned destination or ancestry. Movement deadline interrupted remaining verification reads." |
  .observation.result.verification.tasks=[$ids | to_entries[] | {issueId:.value,projectId:"destination",parentId:(if .key==0 then "later-parent" elif .key==1 then "root" else "child" end),identifier:("DEST-"+((21+.key)|tostring)),number:(21+.key)}] |
  .mutation={before:{issueId:"root",parentIssue:null},after:{issueId:"root",parentIssue:"DEST-1",identifier:"DEST-21",title:"Fixture",modifiedOn:2},action:{kind:"ancestry",result:{outcome:"completed",changed:true,issueId:"root",projectId:"destination",parentId:"later-parent"}}} |
  .gatewayEvents=[{event:"forwarded",point:"commit-after",attempt:1,status:200},{event:"barrier",point:"commit-after",action:"pause"}]
' <<<"$BASE")
check preserve-later-ancestry "$PARTIAL" "$PARTIAL_AFTER"
for filter in \
  '.observation.result.verification.consistency="undetermined"' \
  '.observation.result.verification.reason="Remaining reads unavailable."' \
  '.observation.result.verification.reason="Unsupported contradiction. Movement deadline interrupted remaining verification reads."' \
  '.observation.result.verification.tasks[0].parentId=null' \
  '.observation.result.verification.tasks|=map(select(.issueId!="child"))' \
  '.observation.result.execution.commit="reply-lost"' \
  '.observation.result.execution.reservations[0].status="uncertain"' \
  '.mutation.action.result.outcome="indeterminate"' \
  '.mutation.action.result.parentId=null' \
  '.mutation.after.parentIssue=null' \
  '.gatewayEvents += [{event:"retry-suppressed",point:"commit-after",attempt:2}]' \
  '.gatewayEvents += [{event:"forwarded",point:"commit-after",attempt:2,status:200}]'; do
  reject preserve-later-ancestry "$(jq -c "$filter" <<<"$PARTIAL")" "$PARTIAL_AFTER"
done
for filter in '.issues[0].issue.attachedTo="different-parent"' '.issues[0].issue.modifiedOn=3' '.issues[0].issue.title="later edit"'; do
  reject preserve-later-ancestry "$PARTIAL" "$(jq -c "$filter" <<<"$PARTIAL_AFTER")"
done
reject preserve-later-comment "$PARTIAL" "$PARTIAL_AFTER"
echo 'PASS: partial later-ancestry proof and single-send/actor-state/deadline counterexamples'
