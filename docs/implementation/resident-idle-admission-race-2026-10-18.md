# Idle retirement and incoming admission ordering

Test-only increment after `be4a48e5`. All six issues remain incomplete; no production code changed.

`managed-idle-admission-race.test.ts` exercises the real admissions Effect shell with deterministic TestClock scheduling. In the admission-first ordering, token acquisition starts one millisecond before the idle deadline and remains pending across an entire idle interval. Idle fencing must remain incomplete. Releasing acquisition publishes the attachment, its work returns the exact accepted result, and another idle interval with that live owner still cannot fence the registry. Confirmed attachment release starts a full new idle interval: retirement remains incomplete one millisecond before expiry, completes at expiry, and later admission refuses as closing.

In the fence-first ordering, the idle deadline completes before the next admission. Repeated admissions refuse as closing and the token acquisition dependency is never called, including after a repeated idle wait. No speculative resource acquisition occurs after the generation's admission authority ends.

Three focused files pass eight tests in `/tmp/resident-idle-admission-race.log`; changed-file Oxlint/format and both scoped reviews pass. The accepted work completes immediately; it does not add a held-work cleanup schedule. This is deterministic component ordering evidence, not a packaged HTTP/process race, physical timing measurement or full lifecycle/oracle proof. Wider idle/new-client and active-call boundary qualification remains open. No full gate was run, per the user's local-check policy.
