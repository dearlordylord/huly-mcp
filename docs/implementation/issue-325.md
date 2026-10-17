# Issue 325: resident configuration isolation

Status: incomplete. Production profile selection is not wired yet. The transport
modules support private comparison before admission, but the standalone and
manual entrypoints retain their current configuration behavior.

## Implemented foundation

`ResidentSelection` reuses the complete existing Huly configuration schema and
the shared `McpProcessPolicy`, with captured lazy startup behavior. Connection
identity includes URL, workspace, tagged token or password authentication, and
connection timeout. Policy includes ordered tool selections, configured exposure
mode, and output strictness. Incoming host identity remains outside this
process-wide comparison.

`compatibility-crypto.ts` encodes a fixed-order tuple and computes a
domain-separated HMAC proof bound to package, generation, operation, and nonce.
The backend captures its canonical selection as a redacted immutable string.
Credentials are encoded only in memory inside the crypto adapter. Neither
credentials nor a comparison value are written to disk. Daemon authorization
is separate from Huly credentials. The exact format and challenge bounds are in
[Managed resident ownership](resident-managed-design.md).

`compatibility-authority.ts` owns one-use challenges in an Effect scope. It
checks monotonic expiry, limits pending state, refuses entropy collisions, and
consumes a nonce before deciding success or failure. Scope closure clears the
challenge inventory and overwrites its derived key. A successful comparison
does not itself admit an attachment.

## Evidence and limits

Ten Effect tests cover exact reuse, replay, nonce substitution, concurrent
verification, expiry, capacity, collisions, closed scope, package and generation
mismatch, and daemon-key mismatch. They also exercise every current connection
and policy field, password email and replacement, whitespace and Unicode
credential differences, policy order, object insertion order, and mutation of
the source selection after capture. These use fixture credentials only.

Fresh Spec review found no scoped defect. Standards found an unrelated
authorization-decision product type that permitted impossible combinations;
the discriminated union correction was read back and accepted. TypeScript and
Effect diagnostics pass with zero errors or warnings.

The first complete gate passed 434 files and 5,528 tests but failed branch
coverage at 98.99%, below the unchanged 99% threshold. Its receipt is
`/tmp/resident-managed-foundation-check-all.log`. A real Linux long-path test now
exercises the previously uncovered non-conflict mkdir failure, verifies a typed
refusal, and checks that no claim remains. The corrected complete gate passes:
434 files and 5,529 tests, statements 99.45%, branches 99.00%, functions 99.01%,
and lines 99.55%. Duplication remains 0.92%. Build, TypeScript and Effect
diagnostics, schema boundaries, cycles, complexity, lint, format, synchronization,
and package checks pass. The receipt is
`/tmp/resident-managed-foundation-check-all-corrected.log`. No production source
changed after that run. Standards read back the type correction and long-path
test and has no remaining finding. Spec has no scoped defect.

## Remaining work

Wire existing profile and environment resolution into immutable selection and
private child handoff. Connect the selected configuration to the entrypoints.
Add packaged cross-identity metadata and invocation
tests, profile rotation and logout scenarios, observation-aligned Quint checks,
and final local Huly qualification. No complete issue criterion is accepted by
the crypto and policy tests alone.

## Authenticated HTTP increment

The admission middleware can require a private compatibility proof, and the
adapter attachment operation can supply its captured selection. Verification and
admission share the control request. Successful comparison followed by a
generation fence returns refusal rather than an attachment. The selected client
uses one five-second allowance for challenge plus admission and never retries
through the legacy path.

Six real TLS tests cover exact admission followed by a native MCP ping,
incompatible selection, missing and malformed proofs, oversized-body transport
refusal, package and generation mismatch before proof submission, bounded
challenge capacity, and shutdown between comparison and admission. They use the
production HTTP middleware and adapter attachment operation. They do not load
profiles, spawn managed processes, or connect to Huly. TypeScript and Effect
diagnostics pass with zero errors or warnings.

The first complete gate for this increment passed 5,539 tests but missed branch
coverage at 98.99%. Standards also found normal stop fenced admission after
native cleanup had begun. The HTTP lifecycle now runs the bundled admission
fence before native registry and client cleanup. A held-cleanup TLS test proves
refusal during that interval. A real owner-construction port allows the
admission test to pause after acquiring its owner; fencing closes that owner
without publishing a capability. Standards read back both corrections and has
no remaining finding. The earlier gate receipt is
`/tmp/resident-compatible-admission-check-all.log`.

The corrected full gate passes 436 files and 5,541 tests. Coverage is 99.45%
statements, 99.00% branches, 99.00% functions, and 99.55% lines. Duplication is
0.92%. All remaining project gate stages pass. Its receipt is
`/tmp/resident-compatible-admission-check-all-corrected.log`. No production source
changed after that run. Standards and Spec reread the shutdown and acquisition
corrections and have no remaining scoped findings. No thresholds or timeouts
changed. This verifies transport comparison and admission fencing, not complete
profile isolation, managed startup, or generation retirement.
