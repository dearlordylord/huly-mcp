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


## Retained cleanup versus idle retirement — 2026-10-18

`managed-idle-protected-work.test.ts` joins the actual admission registry,
attachment work owner, native session-release port and idle waiter under
TestClock. A running operation enters cancellation cleanup after its lease
expires. Cleanup remains held across two complete idle intervals: the idle
waiter stays pending, the session stays owned and admission capacity stays
occupied. After cleanup succeeds, the session releases once; the waiter remains
pending until a full new idle interval expires and then fences new admission.
A separate failed-cleanup case retains the native session and capacity after
lease expiry, two idle intervals and repeated explicit release attempts.

Four focused files / sixteen tests pass with the restored production source:
`/tmp/resident-idle-protected-work-restored.log`, SHA-256
`e890ab040ac9398c504bab82891229d7436dfda5d9a12e50b4f58b178554a41a`.
Two temporary source mutations establish sensitivity: dropping retained members
from the idle guard fails both new tests; forgetting a member after failed
cleanup fails the failed-cleanup test. The original `admissions.ts` was restored
in each mutation's `finally` block and has no diff from the preceding commit.
Mutation logs are `/tmp/resident-idle-ignore-retained-members-mutant.log` and
`/tmp/resident-idle-forget-failed-cleanup-mutant.log`. These failures are expected
verification evidence, not failures in the retained candidate.

Fresh read-only Standards and Spec reviews found no actionable issue. This
increment changes tests only: it adds no production persistence, journal, timer
or shutdown policy. It supplies deterministic component evidence for retained
cleanup and idle ordering, not OS-process timing, live Huly cleanup, remote
mutation outcomes, Quint/oracle alignment or complete #326 acceptance. Those
remaining qualification obligations and all six delivery issues remain open.


The fresh `GOMAXPROCS=2 pnpm check-all` passes all 480 files / 5734 tests.
Coverage: statements 99.45% (29550/29713), branches 99% (12463/12588), functions
99% (7996/8076), lines 99.55% (27159/27280). Log:
`/tmp/resident-idle-protected-work-check-all.log`, SHA-256 `ad03966d2bd81b28cbda64981647da9fd9fb59cc9e533ba12bc9e695a7c0ea7c`.
All build, diagnostics, circular, complexity, metadata/schema, packaging, lint,
formatting, duplication and test stages pass without changed thresholds or bounds.
Frozen artifacts and all three focused/mutation logs are copied at `/tmp/resident-idle-retention-gate-1jsdkdwy`.
MCP SHA-256: `7cc7b8c300354694118b08e2b39248e5ea08e1de1df7bae2ce56ecf7a43c8a12`.
CLI SHA-256: `c957044a36f2559fbdf5230a0f37860911af276f800b1a37933539d7298f5697`.
The runtime artifacts match the preceding candidate; this increment adds one
fast test file with two behavioral cases. No live certification is claimed.

## Operational status follow-up — 2026-10-18

The parent D36 filesystem-only status gap is addressed by the protected live
generation endpoint and CLI observation described in
[the status implementation record](resident-status-linux-2026-10-18.md).
Packaged CLI counts and one read-only local-Huly scenario pass. The combined
`pnpm check-all` passes (492 files / 5767 tests; 1389 diagnostic files, no errors
or warnings), and both scoped reviews are clean. This does not close #326 or
substitute for remaining lifecycle, model and native platform requirements.


### Idle and accepted-work evidence reconciliation — 2026-10-18

The [idle/admission tests](resident-idle-admission-race-2026-10-18.md) and [HTTPS accepted-work fence test](resident-http-fence-work-2026-10-18.md) apply primarily to this retirement slice, although their first implementation notes were also recorded under #324. They establish deterministic component orderings and explicit HTTP fencing, not the full packaged automatic-idle race. See [current evidence reconciliation](resident-audit-reconciliation-2026-10-18.md); #326 remains incomplete.


### Lifecycle model type reconciliation — 2026-10-18

Proposed resident-launch.qnt types now key requests by InvocationId (sameasverificationwritehistory), separatecollidingwireId, representcleanupafterterminal/cancellation, ownercallerforresources and remoteeffectoracletruth distinctfromcallerknowledge. Scope/sketch notes updated. QuinttypecheckPASS /tmp/resident-launch-types-reconciled.log; both scoped typeproposalreviews accepted. Existing explicittypesketchapproval checkpoint retained perquint-modelingSKILLstep2; noinit/actions/invariants/run/proof added or claimed. This doesnotcomplete326.9/327.10/othergoals; independent implementation/qualification cancontinue. No fullgate.
### Process-boundary controlled idle ordering — 2026-10-18

[Report](resident-process-idle-clock-2026-10-18.md): separately owned backend
runs the production configured lifecycle under injected TestClock; an actual
packaged adapter attaches at virtual4900ms, survives another5000ms and completes
continued context with the same adapter/port and registry bytes. After parent
release it survives4900ms then closes0 after100ms, leaving empty state. External
5s/7s/25s bounds retained. Initial focused process test passes12.78s; both scoped
reviews accepted. No physical-time, queued Huly work, fence-first process order
or native macOS claim. All six issues remain incomplete.
### Idle fence before packaged attachment — 2026-10-18

[Report](resident-process-idle-fence-2026-10-18.md): automatic idle fence precedes
held cleanup in a separately owned fixture backend. A new packaged adapter
refuses within5s, exits1 with no output and preserves the original ownership
bytes/inventories. Release permits original owned exit0/empty state before a
fresh independent packaged host succeeds on a different generation, then exits
with kernel-confirmed replacement cleanup. One focused process test passes
11.16s; typecheck/lint and both scoped reviews accepted. Controlled-clock original
backend fixture, not physical timeout or real Huly work qualification. All six
issues remain incomplete.
### Cleanup retained beyond adapter death and expiry — 2026-10-18

[Report](resident-process-idle-work-2026-10-18.md): actual packaged adapter begins
one held synthetic tool call then is killed/joined by owned handle. Separate
managed backend retains held cancellation cleanup and unchanged ownership
through default lease plus two idle intervals. Cleanup completion starts a full
new idle interval before backend close0/empty state; dispatches exactly1.
Controlled-clock fixture, not Huly mutation/physical timing or queued fairness
proof. Initial process test passes3.36s; scoped reviews accepted after removal
of an unreachable controller branch. All six issues remain incomplete.
### Queued shared-model work across idle intervals — 2026-10-18

[Report](resident-model-wait-idle-2026-10-18.md): four added clock-controlled
protocol/creator-joiner cases retain actual SDK model waiters across idle
intervals. Cancellation removes only one request; survivor remains on one model
acquisition with no early project dispatch, then exact survivor/fresh/continued
results. Parents close0; full new idle interval precedes owned backend exit0 and
empty state. Original four physical packaged cases retained. Nine focused cases
pass; five affected clock cases pass again after Redacted environment correction.
No native Huly/physical timeout/all fence interleavings claim. All six issues
remain incomplete.
