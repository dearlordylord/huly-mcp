# Explicit admission transitions

`makeResidentAdmissions` mixes deterministic policy and Effect resource lifetime. Preserve its service API, timing, generation scope and admission semaphore, while making admission, membership and idle decisions ordinary functions over explicit state/events. This implements one part of parent322.D8/D9; managed-selection and the lifecycle Quint model remain separate outstanding work.

The shell keeps one state value and synchronously applies a pure transition before interpreting its decision:

```ts
const decision = update(current => advanceAdmission(current, { _tag: "PublishOwner", id, owner }, policy))
if (decision._tag === "Close") yield* closeOwned(decision.id, decision.owner)
const idle = clockSync(now => update(current => advanceLifetime(current, { _tag: "Idle", now })))
if (idle._tag === "Wait") yield* Effect.sleep(Duration.nanos(idle.nanos))
```

One immutable identity-keyed inventory contains Queued, Acquiring, Owned and Settling entries. Owned entries contain opaque resource capabilities which pure functions never invoke. Pending counts, attachment views and digest lookup derive from that inventory. Settling retains only pending finalization after actual owner cleanup; it is not an attachment. No shadow owner map or pending counter remains. A captured eligibility effect follows its original attempt identity, including during acquisition, and cannot bind to a later equal digest.

`admissions-state.ts` owns internal types and projections. `admission-attempt-state.ts`, `admission-member-state.ts` and `admission-lifetime-state.ts` own cohesive event families over that same state. This refines the candidate's single large dispatcher into three ordinary functions to keep policy readable and within the repository's complexity limit; it does not split state ownership. Event-specific overloads expose only applicable decisions, while a private generic shell assignment preserves result types. Each runtime flow crosses the shell, its transition module and the shared state module. `attachment-lease.ts` remains the lease arithmetic source and `work-status.ts` remains the status projection.

The Effect shell owns entropy/digests, clock sampling, semaphore acquisition, owner creation, fibers, resource cleanup, telemetry and conversion to existing typed errors. Every state assignment is synchronous. Idle deadline comparison and fenced-state publication occur inside the same clock callback. A newly acquired owner enters the inventory even if fencing won; cleanup failure retains that exact capability. Only confirmed owner closure can remove ownership. No reducer acquires an inter-process lock or certifies process retirement.

Two structurally distinct candidates were compared under `/tmp/resident-admission-architecture-20261018`. CandidateA uses the unified inventory; candidateB keeps the shell map and separates control/member kernels with observation snapshots. Both preserve resource ownership, but B leaves membership/count/collision coordination in shell mutation sites. Root and independent cross-judge select A (18/20 versus17/20) because it concentrates those invariants rather than merely moving their predicates. Grafts from B: retain the current distinction between watcher failure and bounded explicit-close failure; test captured authority across renewal, expiry, removal and digest reuse.

Accepted tradeoffs: bounded inventory scans replace separately synchronized indices/counters; four explicit phases represent resource creation and finalization; opaque live capabilities appear in immutable internal state but remain Effect-owned resources. Internal shapes are not serialized I/O contracts. Broad untyped decisions are avoided through event-specific return signatures. No library, journal, wire change, timeout change or compatibility path is introduced.

Verification must prove idempotent completion/settlement, irreversible fencing, expiry equality, no idle retirement while pending/owned, full idle after actual removal, late owner cleanup retention, stale-identity safety and state immutability. Use pure outcome/property tests plus existing Effect tests and all packaged process schedules unchanged. Native macOS, actual Huly and final combined qualification remain evidence obligations; this design is not completion evidence.
