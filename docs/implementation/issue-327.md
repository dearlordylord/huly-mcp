# Issue 327 implementation evidence

This is an incomplete candidate under #322. No criterion or issue is accepted by
this report alone. The shared implementation remains in
`/tmp/hulymcp-resident-linux` on `implement/resident-mcp-linux-323-328`.

## Current refusal and uncertainty policy

Startup does not signal a PID from registry metadata. A parent can terminate its
own prepared `ChildProcess` before attempting Start. It consumes that authority
before attempting the private Start send and never restores it after a failed
send, cancellation or lost readiness. An authorized child owns its own lifetime.

Selection treats unavailable current owners, corrupt state, unresolved claims and
multiple compatible live owners as refusal. This candidate does not yet implement
verified crash replacement. Registry retirement requires an owned receipt and the
original device/inode; failed or pending application cleanup retains publication.
PID absence alone does not establish descendant retirement.

The adapter never automatically retries an MCP operation. Encoding refusal before
HTTP execution reports non-dispatch. A failed connection, incomplete reply or
disconnected response can leave the operation outcome unknown. A new healthy
generation cannot reconcile that old operation. The caller must retain its
uncertainty and use an operation-specific read/reconciliation contract before
deciding what to do next. No general exactly-once guarantee is made.

Current compatibility requires the exact package implementation version and the
captured Huly authority, policy and generation. Known incompatible registry
versions remain opaque and can coexist within the bounded inventory. Unknown
registry formats block selection. Registry coexistence tests do not establish
native coexistence of two separately installed package versions or a migration
protocol; those remain pending.

## Committed-write response loss

`test/resident/uncertain-write-process.test.ts` drives the packaged manual adapter
over actual authenticated TLS. A disposable fixture commits a private file write,
then loses its response either before headers or after the host observes a progress
notification. The second schedule uses an explicit fault callback after observed
progress, rather than a timing delay. Independent file parsing confirms one commit,
and the fixture counts one dispatch. The adapter exits with no terminal reply and
with an unknown-outcome/no-replay diagnostic. Owned child handles are joined, the
listener is closed, and failed bundles are retained.

The after-progress case first fails because the diagnostic says only
`Backend response disconnected` (`/tmp/resident-uncertain-stream-write-red.log`).
The adapter now includes the unknown-outcome and no-replay wording on that path.
The fixed two-schedule fixture and nearby adapter boundary tests pass, 16 tests
(`/tmp/resident-uncertain-stream-write-green.log`). This fixture demonstrates
response loss after a disposable mutation; it does not
simulate backend process death or establish live Huly reconciliation.

## Published-backend crash and stale-locator refusal

`test/resident/managed-crash-process.test.ts` runs the actual packaged backend and
managed adapters under the Linux kernel subreaper. After the backend announces
application-ready publication, the fixture records its actual private directory
and registry inventory and checks the child lists of every kernel task. It then
kills only its own backend `ChildProcess` handle and joins that handle. Recovering
adapters refuse the unavailable owner and a foreign plaintext listener bound to
the old port. They emit no stdout, retain the original record bytes and complete
root/registry entry inventory, and leave the foreign listener running.

The fixture initially assumes the root contains only a locator and `generations`
(`/tmp/resident-managed-crash-refusal-tests.log`). Actual forced-crash evidence also
retains the owner's `.attachment-*` staging directory. The fixture now compares the
observed pre-kill inventory instead of guessing which uncertain state may remain.
Failed bundles and private roots are retained. Successful teardown removes only
its own root after the subreaper joins all descendants.

Review identified chunk-local credential scanning as inadequate evidence. The
shared `makeByteDisclosureDetector` now retains a copied, bounded per-socket
overlap, and both foreign-listener fixtures use it. Properties compare arbitrary
TCP chunks to a whole-stream oracle and force an inserted secret through one-byte
fragments. Review also required comparing nested registry entries, not only root
entry names. Both findings are corrected. The refined three-suite run passes ten
tests (`/tmp/resident-crash-disclosure-refinement-tests.log`).

This is Linux safe-refusal evidence with no Huly model acquisition. It does not
prove replacement after a crash, cleanup of acquired Huly resources, mutation
reconciliation, or native behavior on another platform. The pre-kill task inventory
is a recorded observation; descendant retirement is separately joined by the
kernel-owned subreaper.

The frozen increment passes `pnpm check-all`: 456 files, 5,635 tests, statements
99.45%, branches 99%, functions 99%, lines 99.56%, with all diagnostics and existing
limits retained. Receipt: `/tmp/resident-crash-refusal-frozen-check-all.log`, SHA-256
`7617283189a8d30e50a7af119f8f88b0c0ca5d3a7c319b1292d1c7aa7654ea63`.
Its process receipt is `/tmp/resident-crash-refusal-vwGFuv.receipt.json`.
Fresh Standards and Spec reviews identify no remaining finding after the two
evidence corrections. No production source changes belong to this test increment.

## Remaining qualification

Complete crash timing schedules, verified replacement with concurrent callers,
late acquisitions and descendant inventory, reused-PID/foreign-listener refusal,
two-installed-version coexistence, and failure isolation across configurations.
Align observed transitions with the approved lifecycle model and record its safety
domain and liveness assumptions separately. The new model remains a type-only
sketch awaiting approval. Final live Huly write/reconciliation and native-platform
qualification remain pending. The combined Linux checkpoint passes `pnpm check-all`
with 454 files and 5,632 tests at the unchanged thresholds
(`/tmp/resident-lifecycle-boundaries-frozen-check-all.log`). Fresh combined Standards
and Spec reviews report no actionable defect in staged tree
`b5ed29cd8cd11336fa2430a6e835ed327824a3e9`; neither accepts any issue as complete.
