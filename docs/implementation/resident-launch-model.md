# Resident launch model qualification — 2026-10-18

The approved model is implemented in `quint-specs/resident-launch*.qnt`.
[Model scope, assumptions and commands](../../quint-specs/resident-launch.md)
distinguish runtime behavior from verification-only history. No operation
journal or automatic replay was introduced.

## Results

Evidence root: `/tmp/resident-launch-model-a2935a11`.

| Check | Recorded result |
| --- | --- |
| `final-model-corrected/report.json` | All eight 100-trace schedules passed; 51 witnesses reached; model/bridge input hashes unchanged |
| Explicit lifecycle tests | 12 passed, including the cleanup-consistency counterexample scenario |
| Explicit observation tests | 2 passed |
| `alignment-direct-node.json` | Three passes: actual admission-core replay and specific contradictory-count rejection |
| `pnpm typecheck:tsc` | Passed |
| Focused Oxlint | Passed for the two new TypeScript test/helper files |
| Python command-owner checks | 3 passed: ordinary exit, real SIGINT interruption, timeout with independently joined descendant |

The eight schedules cover initial faults, healthy service, publication faults,
attached callers, model wait, running writes, uncertain writes and replacement.
They use three caller incarnations, three one-use backend slots/generations,
four selection keys and six invocations, with at most 64 sampled steps after
each executable prefix. No exhaustive or liveness proof is claimed.

The coordinator now owns a fresh process session for every verification command.
It limits that command to 60 seconds, and on timeout/interruption kills its owned
process group and joins within five seconds. It records failed/incomplete cleanup
and stops. This tightens the harness; it does not change model sample counts,
project/native request deadlines or acceptance assertions. A real Quint command
through the corrected wrapper is retained in `bounded-harness-real-command.json`.
The earlier completed semantic run remains identified by its exact model hashes;
it is not mislabeled as a run of the later wrapper correction.

## Preserved failures and review corrections

`final-model-first/attached-faults.log` records a violation after 49 explored
traces. `attached-counterexample.itf.json` retains the detailed trace. Attachment
closure canceled a request but then overwrote its cleanup-resource change with
the earlier snapshot. The pure transition now updates `interrupted.resources`.
The exact seed `0x2d8367` passes after correction, and
`attachmentClosePreservesRequestCleanupTest` exercises that transition directly.
This was a defect in the model, not a claimed runtime repair.

Earlier fault-heavy runs reached some late witnesses zero times. Guided prefixes
made those windows executable; all final witnesses have positive reachability.
The prefixes execute the actual guarded model actions. Counts are not production
failure-frequency estimates.

Spec review rejected an initial stale-cleanup action that simply recorded
refusal. The model now compares generation/backend/capability with the target
locator. A private mutant that authorizes stale cleanup removes the replacement
locator and fails `safety`; evidence is under `mutant-stale-cleanup/`.

Standards review required the negative alignment control to distinguish a model
rejection from an infrastructure failure. It now parses process failure fields
with Effect Schema and requires the specific `observedTest` disabled-step error.
A killed/timed-out command cannot satisfy it. Replay cleanup also preserves the
primary failure. Both corrections received fresh review without remaining
findings in that scope.

`alignment-final.json` retains a later failed attempt: all three tests reached
the unchanged five-second outer limit. Its exact slowdown was not established.
Bounded diagnostic runs of both evaluator backends returned the expected model
rejection, and no surviving Quint process was observed in the scoped process
inspection. This observation is not retrospective kernel-exit proof for every
failed attempt. The helper now invokes the installed Node CLI directly with the
TypeScript evaluator, avoiding both a package-manager wrapper and a separate
Rust child. Its inner allowance is four seconds with SIGKILL, preserving the
five-second outer test allowance and reserving cleanup time. The resulting three
passes are in `alignment-direct-node.json`. The helper change was qualified
separately; it does not relabel the older model-run bridge hash as current.

## Structural and runtime self-review

| Check | Result |
| --- | --- |
| Guarded transitions | Business decisions are pure; actions combine guards with complete state assignment |
| Typed phases | Sum types represent caller/backend/lease/request/cleanup/write phases |
| State grouping | Cohesive caller/backend records; 13 independent state maps/values remain separate |
| Per-action reachability | 51 witnesses have positive final coverage, including seeded-prefix execution |
| Abstraction | Shared claim/registry and Start message set; no serialized payloads or credential values |
| Protocol invariants | Ownership, generation cleanup, publication, resource accounting and no-replay evidence |
| Initialization | Executable init assigns all 13 variables through `commit` |
| Assignment completeness | Every business action uses the same complete `commit` |
| Schedule completeness | Default `step` includes all modeled business/fault actions |
| Initial invariants | No initial counterexample observed |
| Transition invariants | No counterexample observed in the corrected eight sampled schedules |

Fresh Spec review found no further actionable defect in the pending model,
projection and scoped issue-326 report. Reviews and checks do not complete
#323–328. Native macOS, OS ownership/authentication, live Huly write/reconciliation,
performance controls and the final coherent project gate remain independent.
