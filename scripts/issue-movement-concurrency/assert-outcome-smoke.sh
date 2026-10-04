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
  jq -e --arg name "$1" --arg destinationId destination --argjson ids "$IDS" --argjson previousSequence 20 --argjson after "$AFTER" -f "$PREDICATE" >/dev/null <<<"$2"
}
reject() {
  if check "$1" "$2"; then echo "Predicate falsely accepted $1" >&2; exit 1; fi
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
