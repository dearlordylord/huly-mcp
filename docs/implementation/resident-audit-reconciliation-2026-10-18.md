# Resident completion evidence reconciliation

Reconciled source: `d46d3b5b30f50296e8edbf1a70181f43fc801ab9` (previous checkpoint `e0c5f01d`). This is a scoped reconciliation, not a replacement 170-row completion audit. All issues #323–328 remain incomplete. The prior JSON audit describes `b3e28661c6d9b8abb59fee55200e40bf05cd0822`; its 79 proven rows are historical classifications, not current-candidate certification.

Running its content verifier against this checkout fails at `322.7`: `src/resident/manual-backend.ts:39` changed. The current repeated diagnostic is retained in `/tmp/resident-audit-current-d46d3b5b-corrected.log` (exit1); the earlier diagnostic remains in `/tmp/resident-audit-current-validation.log`. An initial invocation without required `--audit` is separately retained in `/tmp/resident-audit-current-d46d3b5b.log`; it is a command-usage error, not audit evidence. Do not refresh all hashes merely to restore a passing verifier: changed source needs semantic reassessment. The old audit and hashes remain intact.

| Requirement | Evidence added since frozen audit | Remaining qualification |
| --- | --- | --- |
| 323.4 | [Capability transport](resident-capability-boundary-2026-10-18.md), [negotiated proxy protocols](resident-proxy-protocols-2026-10-18.md): exact metadata/capabilities, session isolation and actual SDK-negotiated versions | Native interpretation of all supported capabilities and actual application host matrix; synthetic capability replies prove transport only |
| 323.5 | [Operation error routing](resident-error-routing-2026-10-18.md): independent parents, colliding IDs, caller-only actual domain error, peer held and continued | Progress and supported client-directed routing; current application has no progress/interactive producer, so unsupported producers must not be invented for tests |
| 323.7 / 326.2 | [Active-query loss](resident-active-query-linux-2026-10-18.md): both protocol × EOF/SIGKILL schedules, separate parents, held actual SDK reads, exact survivor/continued results and owned retirement | Scoped Linux evidence exists; reconcile source/artifact bindings for final candidate and avoid interpreting it as native macOS or all healthy-backend cancellation schedules |
| 323.8 | [Output isolation](resident-output-isolation-linux-2026-10-18.md), [request budget](resident-request-limit-linux-2026-10-18.md): packaged shared native backend, closed/unread output and adapter-only request overflow | General queue/fairness/interactive qualification and final candidate/platform certification |
| 324 concurrency / 327.7 | [Ten readers](resident-ten-readers-2026-10-18.md) and [ten fresh parents](resident-ten-parent-restart-2026-10-18.md): initial ten-reader convergence and ten concurrent fresh parents after kernel-confirmed normal retirement, one new generation, owned cleanup | The restart case uses context/catalog rather than Huly reads. Exact launch kill boundaries and earlier unexplained readiness failures remain; passing matrices do not erase failures |
| 323.4 / 325.6 | [Policy modes](resident-policy-modes-2026-10-18.md), [proxy reads](resident-proxy-project-reads-2026-10-18.md), [protocol matrix](resident-proxy-protocols-2026-10-18.md), [packaged output validation](resident-packaged-output-validation-2026-10-18.md): both protocols × three exposure modes preserve invalid-output tool errors and exact valid follow-ups through actual packaged adapters | Output-validation backend is an in-process native fixture. Broader result/resource types, real Huly payloads, independent proxy parents sharing one backend and final platform/artifact certification remain |
| 326.3 / 326.6 | [Model-wait cancellation](resident-model-wait-linux-2026-10-18.md), [held cleanup beyond expiry](resident-process-idle-work-2026-10-18.md): actual packaged adapter SIGKILL, cleanup retained across default lease plus two idle intervals, one dispatch, full new idle interval after cleanup, owned exit0 | Cleanup protection is now process-boundary evidence under injected time and a synthetic tool. Queued/new-call/completion orders and actual Huly work at the idle boundary remain distinct obligations |
| 326.4 | [Idle/admission ordering](resident-idle-admission-race-2026-10-18.md), [HTTPS fence/work](resident-http-fence-work-2026-10-18.md), [attachment-first processes](resident-process-idle-clock-2026-10-18.md), [fence-first processes](resident-process-idle-fence-2026-10-18.md): real packaged adapters, continued operation across virtual deadline, bounded refusal during held cleanup, preserved ownership and safe later fresh generation | Original clock-controlled backend is a separate production-lifecycle fixture. Physical packaged retirement is covered by the ten-parent restart case; queued/new-call/completion interleavings at the fence and native macOS are still incomplete |
| 326.9 / 327.10 | Pure admission/publication state increments | Full lifecycle Quint actions/invariants/oracle still absent; launch file remains a type sketch |
| 327.9 | [Configuration fault](resident-config-fault-2026-10-18.md), [concurrent launch](resident-concurrent-config-launch-2026-10-18.md), [same-configuration fresh refusal](resident-unresolved-start-refusal-2026-10-18.md): backend-only and adapter/backend faults in both protocols, B held real SDK read survives with exact continued results/unchanged registry, A fresh startup refuses with zero Huly dispatch | Corrected native-mode six-case evidence supersedes intermediate auto/native mismatch. This covers owned backend-loss isolation, not failed-cleanup overlap, fresh B attachment while A remains unresolved, every fault schedule or native macOS |

Additional evidence now available:

| Requirement | Evidence | Remaining qualification |
| --- | --- | --- |
| 324.8 / 324.9 | [Claim cancellation](resident-claim-process-cancellation-2026-10-18.md), [corrupt crash ownership](resident-corrupt-owner-process-2026-10-18.md): actual SIGTERM claim release/reacquisition, SIGKILL claim identity retention, packaged refusal preserving malformed registry after confirmed backend death | Primitive claim proof is not every packaged launch/publication kill point. Deliberate damage proves refusal, not repair or recovery after arbitrary live-state erasure |
| 327.2 / 327.4 | [Terminal output loss](resident-terminal-output-loss-2026-10-18.md), [late colliding reply](resident-late-colliding-reply-2026-10-18.md), [renewal loss](resident-write-renewal-loss-2026-10-18.md): one committed synthetic mutation, no replay, no host terminal, separate adapter incarnations/colliding IDs, operation-discriminated fresh results | These use real packaged adapters and synthetic private TLS/remote state. Distinct backend-generation callbacks, native Huly mutation/reconciliation and full uncertainty/model alignment remain; a server finish is not host observation |

The latest scoped log summaries were inspected directly: output validation9tests,
corrected configuration-fault/refusal6cases, ten-parent restart1case,
attachment-first1case, fence-first1case, cleanup-protected work3tests and
renewal-loss cohort28tests. Their linked reports retain exact log/receipt paths
and limits. These are different scoped runs, not one coherent final campaign.
`git diff e836bd0d..d46d3b5b -- src packages` is empty: these later increments
changed tests/reports rather than production bytes. That does not recertify
historical receipts or the frozen audit.

Remaining work must be driven by the original requirements rather than the old
next-scenario paragraph. In particular:

- Finish queued/new-call/completion ordering at idle boundaries and exact
  packaged launch/publication kill schedules; retain failed attempts.
- Reconcile uncertainty/late-generation/failed-cleanup evidence with the full
  contract and complete the required native Huly mutation/reconciliation work.
- Complete lifecycle Quint actions/invariants/oracle after the outstanding type
  sketch approval. The existing sketch is not executable lifecycle evidence.
- Obtain required native macOS evidence; Linux passes do not substitute for it.
- Bind actual host, performance/resource and platform evidence to the coherent
  final candidate, then run its required gate and five movement fixtures under
  the established bounded final-certification policy.
- After qualified production integration and its required authorization, perform
  the specifically requested prototype/branch cleanup; it is not authorized now.

This is a scoped reconciliation, not an exhaustive new170-row audit or an
acceptance decision. The full audit must still be rebuilt semantically before
completion; no row is promoted here by refreshing hashes. General queue/fairness
limits, supported capability behavior and remaining version/identity/platform
matrix also retain their original scope. The pending Quint approval and native
macOS access are not inferred from automatic goal continuations.

Windows is excluded under the explicit amendment, not deferred as unfinished
supported-platform work. There is no new operation journal, legacy behavior or
production-default change. All six issues and final qualification remain open.

Subsequent scoped evidence: [shared model waiting across idle](resident-model-wait-idle-2026-10-18.md)
adds controlled-clock process coverage for real SDK waiters before/after one
caller's cancellation, with one model acquisition and exact continued reads.
It advances the queued-work portion above without completing all new-call and
completion orders at the fence or changing the frozen audit's classifications.
