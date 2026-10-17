# Issue 326 implementation evidence

Status: managed ownership and normal retirement are implemented candidates;
issue 326 remains incomplete. The Linux packaged operator-stop fixture now joins
actual kernel-owned backend exits, preserves an unrelated configuration and
converges two concurrent replacement callers after confirmed normal retirement.
See [the current receipt](issue-327.md#linux-packaged-stop-and-concurrent-normal-replacement-2026-10-17).
Active-mutation, failed-cleanup, model alignment and complete native/live
qualification remain pending.

## Early manual checkpoint (historical)

At this checkpoint only manual-resident foundations existed; managed ownership
was not implemented. Later managed increments below supersede that limitation.

The resource owner and private admission work in issue 323 now distinguish
eligibility from retained work. Monotonic leases expire without a client receipt,
and reservation checks the current deadline before dispatch. Renewals cannot
revive retired or expired identities. A generation-owned drain fences and cancels
only owned tickets, retains native session capabilities through actual target and
client cleanup, and reclaims capacity only after successful cleanup. A bounded
close waiter does not cancel that drain. Cleanup failure retains blocked ownership.

[The lease policy](resident-lease-policy.md) records concrete defaults and Linux
calibration collected before lease wiring. It also states the measured workload
and qualification limits. Managed idle retirement remains a proposed policy,
not implemented behavior. [Issue 323's report](issue-323.md) records the exact
candidate checks, failed coverage attempts, reviews and current full gate receipt.

Real packaged process tests cover adapter death, pause/resume after expiry,
reclaimed capacity, and an independent adapter continuing against the same backend.
TestClock tests cover renewal, exact expiry, a lost admission reply over real TLS,
cleanup held past waiter timeout, and failed cleanup retaining capacity after
expiry. The attachment Quint model adds bounded monotonic rounds, renewal, expiry
and eligible-reservation history. Four scenarios and 1,000 sampled traces pass.
That sampled model does not yet replay implementation observations.

Managed acquisition and idle shutdown, last-adapter scenarios under managed
ownership, complete lifecycle observation alignment, live Huly qualification and
native platform certification remain required. None is established by metadata
fixtures or the calibration receipt. The prototype branch remains preserved.

The admission service now has an irreversible generation fence. It rejects new
attachments immediately, including when another admission is paused, and fences
lookup, renewal, and new work through captured owners. Existing work and native
capabilities remain owned until explicit cleanup succeeds. Five Effect tests
exercise these boundaries, and a real TLS control test observes closing refusal.
The manual backend bundles its HTTP middleware with a shutdown fence that runs
before native registry and client cleanup. An additional real TLS test holds
native client cleanup, observes admission refusal while the descriptor remains
readable, then releases cleanup and verifies owned shutdown. An outer fence also
covers run failure and interruption before closing its inner scope. This
does not yet provide managed idle policy, whole-generation draining, or confirmed
outer process-client retirement.

The corrected admission increment passes the complete project gate with 5,541
tests and the original coverage thresholds. Standards and Spec have no remaining
scoped finding. The receipt and failed earlier run are recorded in
[the issue 325 report](issue-325.md#authenticated-http-increment).

## Managed retirement candidate, 2026-10-17

The current candidate tracks pending admissions as well as admitted members and
retained cleanup. Managed owners fence after five seconds with no such work;
foreground explicit owners retain their independent lifetime. Shutdown fences,
waits for pending acquisition, drains admitted owners and confirms process-client
closure before successful registry retirement. A typed closure failure retains
the generation record. Native HTTP shutdown uses that same guarded closure.

The ten-parent Linux fixture observes automatic idle exit and private-state
removal after independent callers close, including a killed caller and a
surviving adapter. Focused owner tests observe retained registry evidence when
shutdown reports failure. Evidence paths and the current gate status are recorded
in [issue 324](issue-324.md#automatic-startup-candidate-2026-10-17).
Complete pending/held-cleanup idle schedules, observation/model alignment, live
Huly and native-platform certification remain pending.

## Contention and unpublished-owner corrections

A real filesystem test exposes an unbounded retirement wait behind another
selector's claim (`/tmp/resident-managed-owner-bounded-lock-tests.log`): the
unchanged thirty-second test bound expires despite the five-second retirement
allowance. The pinned Effect implementation masks acquisition in
`acquireUseRelease`. The retry loop was inside that acquisition. Selection now
brackets each single atomic claim attempt and retries a busy result between
brackets. A successful attempt always has its release registered; operation
failures are not retried. The corrected twelve-test owner run passes with the
original startup, retirement and test bounds
(`/tmp/resident-managed-owner-bounded-lock-fixed.log`).

A second real owner/work/session schedule shows that an owner completing
acquisition after fencing could fail cleanup without ever entering the member
inventory. A later drain then falsely succeeds
(`/tmp/resident-unpublished-owner-retention-red.log`). Inventory insertion now
precedes the post-acquisition fence check. The existing member close operation
removes only confirmed cleanup. Thirteen related admission/idle tests pass after
the fix (`/tmp/resident-unpublished-owner-retention-green.log`).

A separate TestClock schedule holds unpublished-owner cleanup, verifies the
admission caller receives `pending` before opening the cleanup Deferred, then
confirms a later drain after closure. It passes without another timeout change.
Spec review reruns this schedule and retracts its initial inherited-mask concern:
the pinned Effect4 `timeoutOption`/`raceFirst` starts its competing fibers with
interruption enabled. This differs from an acquisition that establishes its own
uninterruptible mask. Standards review reports no scoped finding in either fix.
Complete model alignment and native/live qualification remain pending.

## Operation-stop fault qualification checkpoint (2026-10-17)

The [issue 327 report](issue-327.md#stop-during-an-operation-and-failed-cleanup-2026-10-17)
records two new Linux process schedules: explicit host cancellation after one
filesystem commit during operator stop, followed by successful or failed cleanup.
The focused run passed 17 tests; successful cleanup permits a fresh generation,
while failed cleanup preserves ownership and refuses replacement. These are
embedded-backend DI fixtures, not real Huly mutation/cleanup certification.
All six tickets and their remaining qualification stay open.
