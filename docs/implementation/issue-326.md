# Issue 326 implementation evidence

Status: partial foundations in the explicit manual resident. Issue 324's managed
ownership path is not implemented, and issue 326 is not complete.

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
