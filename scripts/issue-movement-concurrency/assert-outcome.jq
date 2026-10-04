# Controller has already decoded the published result with MoveIssueResultSchema.
def uncertainty:
  (has("changed") | not) and
  .destination.projectId == $destinationId and .destination.parentId == null and
  .discovery.status == "complete" and
  all($ids[]; . as $id | any($result.issueIds[]; . == $id));
def confirmed_reservations:
  (.execution.reservations | length) == ($ids | length) and
  all(.execution.reservations[]; .status == "confirmed") and
  (.execution.reservations | map(.issueId) | sort) == ($ids | sort) and
  (.execution.reservations | map(.number) | sort) ==
    [range($previousSequence + 1; $previousSequence + 1 + ($ids | length))];
def observed_inconsistent:
  .verification.status == "observed" and
  .verification.completeness == "complete" and
  .verification.consistency == "inconsistent" and
  (.verification.reason | length) > 0 and
  all($ids[]; . as $id | any($result.verification.tasks[]; .issueId == $id));
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
  observed_inconsistent
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
