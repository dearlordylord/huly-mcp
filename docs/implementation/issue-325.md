# Issue 325: resident configuration isolation

Status: incomplete. Production profile selection and attachment comparison are
not wired yet. The standalone and manual adapter modes retain their current
configuration behavior.

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
private child handoff. Expose comparison over the authenticated generation
channel, couple successful selection to attachment admission, and enforce the
generation shutdown fence. Add packaged cross-identity metadata and invocation
tests, profile rotation and logout scenarios, observation-aligned Quint checks,
and final local Huly qualification. No complete issue criterion is accepted by
the crypto and policy tests alone.
