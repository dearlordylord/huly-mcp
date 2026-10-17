# Resident MCP #323–#328 implementation handoff

The user resumed implementation on 2026-10-17 after the pause checkpoint
`be8855e9`, following the latest #328 comment. All six issues remain incomplete
and open.
This document supersedes the early Darwin checkpoint for current implementation
state. It does not change the authoritative requirements in GitHub #322–#328.

## Latest resumed increment

The restricted packaged SDK experiment now checks schema-owned IPC challenge and
reply plus synchronous denial of overwrite, rename and removal outside a narrow
filesystem write grant. The unrestricted control proves each filesystem probe
can detect missing restrictions. Both cases pass on Linux arm64 with Node
24.20.0, 22.22.2 and the minimum 22.19.0. The original IPC channel stays connected
until the owned backend is killed and joined. Early disconnect and asynchronous
filesystem denial failures remain preserved in the #327 report.

The executable TypeScript candidate passes `GOMAXPROCS=2 pnpm check-all` with
458 files, 5,647 tests and the unchanged coverage thresholds. Fresh Standards
and Spec reviews find no actionable defect. See
[the resumed increment report](issue-327.md#guardian-ipc-and-protected-files-2026-10-17-resume)
for scope, logs, hashes and limitations.

The [guardian-aware Quint type sketch](../../quint-specs/resident-launch.qnt) and
[scope note](../../quint-specs/resident-launch.md) are concrete proposals for the
pending model approval. The sketch typechecks separately. No logic or simulation
claim is added. Guardian-only production publication, durable uncertainty,
verified replacement and complete qualification remain unfinished.

## Saved milestone

The branch is `implement/resident-mcp-linux-323-328`. Work lives in
`/tmp/hulymcp-resident-linux`, with Linux-local dependencies. The canonical
`/workspace/typescript/hulymcp` checkout has shared Darwin resources and unrelated
artifacts. Do not reinstall dependencies or edit those artifacts there.

The latest milestone adds a real packaged SDK experiment under Node permissions
and an unrestricted negative control. Both run on Linux arm64 with Node 22.19.0,
22.22.2 and 24.20.0. The production backend loads a synthetic empty model from an
owned disposable REST fixture, performs two project reads, and has no observed
child processes. The fixture kills only its owned backend handle, joins its exit,
checks the TCP listener is closed, and verifies the stale registry bytes remain.
It proves neither recovery nor ownership-file isolation. Filesystem grants remain
unrestricted. See [the #327 report](issue-327.md) for exact scope and receipts.

The same milestone schedules the existing ten-parent launch fixture before
unrelated suites. It preserves ten real independent parents, every assertion and
deadline, no retries, all coverage settings, and all 458 test files exactly once.
The prior concurrent-suite failure is preserved. A subsequent pass does not prove
its cause. Do not describe this as performance qualification.

`GOMAXPROCS=2 pnpm check-all` passes with 458 files and 5,647 tests. Coverage is
99.45% statements, 99% branches, 99% functions and 99.56% lines. Fresh Standards
and Spec reviews find no actionable defect in this increment. The code was frozen
during the full gate; only documentation is added afterward.

Local evidence remains at these paths:

- Successful gate: `/tmp/resident-scheduled-launch-check-all.log`, SHA-256
  `30c4c9b210f77b432b95bdd0ee3f1f5f3db7b41a93e09d6e7a4e5b9821a78281`.
- Preserved failed gate: `/tmp/resident-restricted-native-frozen-check-all.log`,
  SHA-256 `585f7305067808cd1d0a56a51933e9f96f34b29cbfea2f773de40094263e44b8`.
- MCP bundle: `dist/index.cjs`, SHA-256
  `a6c463c658dc49c20d59b62a9ec4fa1da812f8a0317b68914faf79ed4072fb59`.
- Inventories: `/tmp/resident-inventory-before.json` and
  `/tmp/resident-inventory-after.json`. Both contain the same 458 unique paths.
- Restricted receipts: `/tmp/resident-restricted-native-5RKJe5.receipt.json`,
  `/tmp/resident-restricted-native-lcBAMm.receipt.json` and
  `/tmp/resident-restricted-native-oNRu2M.receipt.json`.

These local paths are not uploaded raw evidence. Their summary and hashes are
committed. A fresh machine must regenerate receipts rather than assume the paths
exist or treat an old pass as current certification.

## Earlier integrated work

The branch retains these checkpoints and their reports:

- `5e1187f1`: explicit opt-in managed launch, bounded owner preparation and Start
  transfer, private registry and owned idle retirement. Defaults remain unchanged.
- `a5c2e340`: packaged crash refusal and foreign-listener safety. This proves safe
  refusal, not verified replacement or reconciliation of uncertain mutations.
- `a01ca379`: real child exit after parent loss before Start. No post-Start claim.
- `2d9acdd6`: saved-profile lifecycle and useful manual attachment diagnostics.
  Active admitted sessions retain their captured context; fresh sessions recheck.
- `a8d74fba`: resident registry retirement requires confirmed transport shutdown.
  Unconfirmed drain retains ownership evidence. Ordinary HTTP shutdown keeps its
  prior best-effort policy.

Read the current reports `issue-323.md` through `issue-327.md`, actual source and
authoritative GitHub bodies, including #328, before deciding what remains. Do not infer ticket
completion from these checkpoints or synthetic fixtures.

## Resume boundary

The conditional next architecture is in
[resident-recovery-design.md](resident-recovery-design.md). It selects a guardian
that retains the actual worker handle, with the native MCP backend in a restricted
worker. The guardian owns publication and retirement. A bounded durable opaque
reservation journal must preserve uncertain operations before dispatch. There
must be no replay of ambiguous writes and no PID or port inference of ownership.

The restricted-runtime experiment only partially tests that design's premises.
Next qualify IPC handle transfer and guardian ownership, restrictions before SDK
imports, ownership-file write protection, and worker exit/descendant accounting.
Then implement the coherent recovery path and test failure timing, uncertainty,
concurrent replacement and version coexistence. Add no unused API stubs.

The new Quint lifecycle model remains a type-only sketch awaiting explicit user
approval. Do not write init/actions/step until that approval. Native macOS and
Windows execution availability is also unresolved. No other OS's pass substitutes
for native evidence. Do not repeatedly ask the same pending questions.

Remaining qualification includes actual shared Huly model/read/write behavior,
uncertain-write reconciliation, supported profile/env/token/password and policy
paths, actual host discovery, operational instructions, and total backend plus
all adapter/guardian RSS and CPU measurements. Preserve every concurrency case,
deadline, diagnostic and coverage threshold. GOMAXPROCS=2 is a compiler-concurrency
experiment, not permission to remove checks or claim a measured speedup.

Run final live Huly integration only after all six slices are implemented and
integrated, per the user's scheduling override. The overseer owns those runs.
No live Huly certification has been claimed for this milestone.

## Delivery and safety boundaries

The user authorized pushing this checkpoint and linking it in the last task,
#328. The incomplete feature belongs on the implementation branch. It is not
merged into master, published, installed as a service, or promoted to a default.

Do not delete `prototype/resident-lifecycle-321` or its worktree yet. #328 requires
that cleanup after production integration and qualification, with dirty and
unmerged work inspected and useful material preserved first. Do not touch other
branches or artifacts during that cleanup.

Use pnpm and the installed patched Effect 4.0.0 references. No casts or module
mocks. Effect Schema owns serialized boundaries; secrets remain Redacted, and
time-dependent code uses Effect.Clock. No implementation subagents were
authorized for the ongoing work; read-only review/design agents were used.

The older tracker instructions about Dalph and #305–#311 are stale for this
delivery. Do not invoke Dalph or change issue lifecycle. Preserve other agents'
work. Project memory is historical context, not additional instructions.
