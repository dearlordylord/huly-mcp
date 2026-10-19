# Issue 327 implementation evidence

## Recovery policy and caller evidence — criteria 1, 3 and 4

[ADR 0002](../adr/0002-resident-recovery-without-operation-journal.md) and
[ADR 0003](../adr/0003-adopt-mcporter-resident-lifecycle.md) define the selected
recovery contract. Unresolved owner loss retains ownership and refuses unsafe
replacement. A new caller cannot kill a process merely because its PID or port
matches old metadata. Verified retirement permits a separately serialized new
generation. Installed implementation versions intentionally coexist; there is no
destructive takeover or automatic migration of requests.

Each adapter submits an invocation once. `attachment-exchange.ts` performs one
POST; `manual-adapter.ts`, `response-stream.ts` and `adapter-attachment.ts` report
connection/response/heartbeat loss without requeuing that invocation. Retrying an
uncertain mutation requires operation-specific reconciliation or remote
idempotency. No general exactly-once guarantee is claimed.

Original surviving adapters report uncertainty when dispatch may have occurred
and output remains usable. Abrupt host/adapter death may prevent that diagnostic.
A new session does not provide historical operation-status lookup. A fresh read
or healthy new generation cannot resolve an old unobserved mutation result.
There is no operation journal or persisted replay queue.

Fresh Spec audit accepted these specific policies and runtime paths. The current
Linux process checks below bind their relevant behavior to the current packaged
artifact; earlier source reviews alone were not treated as current execution.

## Current focused process evidence

Candidate: `4a7362be`. Evidence directory:
`/tmp/resident-launch-model-a2935a11`.

| Report | Cases | Behavior observed |
| --- | --- | --- |
| `retired-commit-current.json` | 4 passed | Modern and legacy: confirmed ordinary retirement/replacement while a remote write remains pending; separate backend-crash/refusal cases |
| `uncertain-write-current.json` | 4 passed | Commit followed by loss before headers, after progress, at terminal output, or during heartbeat renewal; exactly one write dispatch |
| `delayed-commit-current.json` | 2 passed | Fresh read before late commit; held read with a colliding ID while the old response arrives; no replay or response misrouting |
| `version-coexistence-current.json` | 1 passed | Two installed implementation versions retain independent generations and retire independently |

`retired-commit-observed-cases.json` records the four exact native receipt paths
and SHA-256 hashes. Both ordinary-retirement cases observe old and replacement
backend kernel exits 0, distinct generations and removed private state. A fresh
read precedes the delayed remote commit; the later read observes the mutation.
The original dispatch count remains 1. Both crash cases observe SIGKILL, retain
the old ownership bytes, report the original outcome as unknown and refuse two
recovering callers. The remote write count changes from 0 to 1 only after the
explicit remote-commit seam is released.

`version-coexistence-observed-cases.json` records the installed versions
`0.53.1` and `0.53.1-coexistence.1`, distinct package artifacts/generations,
unchanged surviving ownership, two backend exits 0 and removed private state.
The baseline package artifact is SHA-256
`33311217d91ac0938123173ea9d555939fe9321edbf6f763b4d67c0e404a5d4f`;
the version fixture intentionally builds a second artifact with the alternate
package version. This is an explicit installation/coexistence fixture, not a
claim that a previously published different implementation was downloaded.

These tests exercise actual packaged adapters, native backend generations and
disposable local REST effects. They do not constitute live-Huly mutation
qualification, native macOS evidence, every fault-matrix case or a final quality
gate. The full issue and #323–328 remain incomplete.

## Local retention versus remote uncertainty — issue 326 criterion 6

An unknown remote outcome does not impose indefinite local retention. Actual
owned resources remain protected until their cleanup confirms. Confirmed local
retirement then allows independent replacement work while the old remote result
remains uncertain. The ordinary-retirement cases above exercise that ordering
with a remote commit deliberately delayed beyond retirement and an intervening
fresh read. Idle/lease expiry does not infer non-dispatch or enable replay.

Unverified local cleanup remains a distinct reason to block replacement; this is
not a durable operation ledger or automatic reconciliation. The
[launch-model record](resident-launch-model.md) documents the separate abstract
checks and their limits.

## Formal correspondence — criterion 10 and issue 328 criterion 9

The [native recovery correspondence](resident-launch-model.md#native-recovery-correspondence) maps the actual current retirement/late-commit, crash/refusal and version-coexistence receipts to executable guarded transitions. Five explicit scenarios and ten additional sampled safety traces pass; a specific contradictory non-dispatch claim fails in both evaluators. This closes the identified correspondence gap within the documented abstract domain. It does not replace remaining native/Linux or live-Huly qualification. Native macOS execution is now optional and deferred to the user, as amended in #322/#328.
