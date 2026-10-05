# Controller has already decoded the published result with MoveIssueResultSchema.
def uncertainty:
  . as $current |
  (has("changed") | not) and
  .destination.projectId == $destinationId and .destination.parentId == null and
  .discovery.status == "complete" and
  all($ids[]; . as $id | any($current.issueIds[]; . == $id));
def confirmed_reservations:
  (.execution.reservations | length) == ($ids | length) and
  all(.execution.reservations[]; .status == "confirmed") and
  (.execution.reservations | map(.issueId) | sort) == ($ids | sort) and
  (.execution.reservations | map(.number) | sort) ==
    [range($previousSequence + 1; $previousSequence + 1 + ($ids | length))];
def observed_inconsistent:
  . as $current |
  .verification.status == "observed" and
  .verification.completeness == "complete" and
  .verification.consistency == "inconsistent" and
  (.verification.reason | length) > 0 and
  all($ids[]; . as $id | any($current.verification.tasks[]; .issueId == $id));
# A later independent ancestry edit is already a concrete contradiction, even if
# subsequent read-only verification is interrupted. Do not call that final proof complete.
def partial_later_ancestry($evidence):
  . as $current |
  $ids[0] as $root |
  $evidence.mutation.action.result as $actor |
  $evidence.mutation.after as $actorAfter |
  [$after.issues[].issue | select(._id == $root)] as $fresh |
  .verification.status == "observed" and
  .verification.completeness == "incomplete" and
  .verification.consistency == "inconsistent" and
  (.verification.reason | contains("Movement deadline interrupted remaining verification reads.")) and
  (.verification.reason | contains("Task " + $root + " differs from its planned destination or ancestry.")) and
  all($ids[]; . as $id | any($current.verification.tasks[]; .issueId == $id and .projectId == $destinationId)) and
  $evidence.mutation.action.kind == "ancestry" and
  $actor.outcome == "completed" and $actor.changed == true and
  $actor.issueId == $root and $actor.projectId == $destinationId and $actor.parentId != null and
  $actorAfter.issueId == $root and $actorAfter.parentIssue != null and $actorAfter.modifiedOn != null and
  $actorAfter.parentIssue != $evidence.mutation.before.parentIssue and
  ($fresh | length) == 1 and
  $fresh[0].space == $destinationId and $fresh[0].attachedTo == $actor.parentId and
  $fresh[0].identifier == $actorAfter.identifier and $fresh[0].title == $actorAfter.title and
  $fresh[0].modifiedOn == $actorAfter.modifiedOn and
  any(.verification.tasks[]; .issueId == $root and .parentId == $actor.parentId) and
  ([$evidence.gatewayEvents[] | select(.event == "forwarded" and .point == "commit-after")] | length) == 1 and
  all($evidence.gatewayEvents[]; .event != "retry-suppressed" and
    (if .event == "forwarded" and .point == "commit-after" then .attempt == 1 else true end));
. as $evidence |
.observation.result as $result |
$result |
if ($name | startswith("refuse-stale-")) then
  .outcome == "incomplete" and uncertainty and confirmed_reservations and
  .execution.phase == "commit" and .execution.commit == "refused" and
  observed_inconsistent and (.reason | test("gap"; "i")) and
  all(.execution.reservations[]; . as $reservation |
    all($after.issues[]; .issue.space != $destinationId or .issue.number != $reservation.number))
elif ($name | startswith("preserve-later-")) then
  # All five current cases contradict the approved tree/payload/ownership/ancestry plan.
  # This does not impose failure on an unrelated incoming reference or independent edit.
  .outcome == "incomplete" and uncertainty and confirmed_reservations and
  .execution.phase == "verification" and .execution.commit == "acknowledged" and
  (observed_inconsistent or ($name == "preserve-later-ancestry" and partial_later_ancestry($evidence)))
elif $name == "verification-outage" then
  .outcome == "indeterminate" and uncertainty and confirmed_reservations and
  .execution.phase == "verification" and .execution.commit == "acknowledged" and
  .verification.status == "unavailable" and (.verification.reason | length) > 0
elif $name == "successful-batch-reply-lost" then
  .outcome == "indeterminate" and uncertainty and confirmed_reservations and
  .execution.phase == "commit" and .execution.commit == "reply-lost" and
  .verification.status == "observed" and .verification.completeness == "complete" and
  .verification.consistency == "consistent"
elif $name == "before-allocation-send" or $name == "allocated-reply-lost" then
  # Gateway refusal is before upstream forwarding, after the application's HTTP send.
  .outcome == "indeterminate" and uncertainty and
  .execution.phase == "allocation" and .execution.commit == "not-sent" and
  (.execution.reservations | length) == 1 and
  .execution.reservations[0].status == "uncertain" and
  (.execution.reservations[0] | has("number") | not) and
  .verification.status == "not-attempted"
else false end
