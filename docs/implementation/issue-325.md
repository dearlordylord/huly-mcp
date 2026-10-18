# Issue 325: resident configuration isolation

Status: incomplete. Managed and manual adapters resolve selected profile or
environment authority before private compatibility comparison and admission.
The [current qualification report](issue-328.md) records scoped profile, rotation,
removal and policy process evidence; complete live/native qualification remains
pending. Earlier foundation sections below describe their historical checkpoints.

## Refuse unavailable proxy targets before client acquisition

The strict-proxy managed policy scenario exposed a shared-dispatch ordering bug:
`invoke_tool` acquired Huly clients before looking up its target. A forbidden
target with unavailable Huly therefore returned a connection error instead of
the specific unknown-tool refusal. A focused regression reproduced this with an
injected resolver and requires zero resolver calls for an unavailable target.

Proxy invocation now receives a lazy typed client-resolution effect and runs it
only after proxy parameter parsing, target lookup and local argument guards.
Client-acquisition failures still map to the existing MCP error response for
eligible targets. All callers of the concrete-client API were migrated in the
same increment; no compatibility API or new replay behavior remains. The shared
path also serves standalone stdio and direct HTTP, so affected MCP regressions
are included in verification. Full qualification is tracked separately in #328.

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

## Configuration capture in progress

`captureResidentSelection` now resolves an explicitly requested stdio profile
through the existing resolver and credential-store port, or parses environment
configuration through the existing Huly config layer. It captures policy and
lazy startup from the same environment snapshot. No Huly client is acquired.
The internal runtime-context projection reports the parsed authentication method,
including the existing token-to-password fallback.

Lazy startup parsing now lives in `config/startup.ts`. The entrypoint passes its
captured environment for the Glama presence default. Capture preserves an empty
Glama marker as present, while the existing Config parser retains ownership of
the explicit `LAZY_ENVS` flag. No later ambient Glama read can change that snapshot.

Three capture tests cover token and password configuration, timeout and policy,
environment mutation after capture, explicit profile selection over CLI active
profile, token replacement, logout, missing profile, and independent environment
selection. They use the real profile file store with fixture credentials and
owned cleanup. Together with entrypoint tests, 22 focused tests pass. TypeScript
and Effect diagnostics pass for 1,256 files with zero errors or warnings.
The diagnostic receipt is `/tmp/resident-selection-capture-typecheck-complete.log`.

Those initial checks preceded startup composition. The following increment wires
the capture into the explicit backend and adapter entrypoints.

## Explicit configured startup

Explicit resident startup now captures the selected Huly configuration before
creating its backend. The compatibility authority, process-owned Huly config
layer, process policy and sanitized context use that capture. The stdio adapter
captures its selection before attempting admission and supplies the comparison
proof. Missing or incompatible configuration never retries descriptor-only
admission. With no selected authority or nondefault policy, explicit manual
attachment retains its descriptor-only behavior. Partial authority or restricted
policy requires a valid configuration and fails rather than inheriting another
process's authority.

Configured residents reject Huly override headers before control handling or
native request middleware; the attachment capability header remains accepted.
This prevents headers from triggering a separate client acquisition against an
immutable captured config. Ordinary direct HTTP retains its override behavior.
A TLS regression observes zero native middleware entries for conflicting and
unsupported override headers, checks static secret-free rejection, and proves a
subsequent matching call succeeds.

The first focused composition run passes 54 tests, including the retained real
adapter death/pause cases. Its receipt is
`/tmp/resident-selection-wiring-focused.log`. A separate packaged test rejects
changed credentials, workspace, timeout, tool scope, exposure, strictness and
missing selection before MCP admission; its receipt is
`/tmp/resident-selection-wiring-refusals.log`. The corrected focused boundary run
passes 30 tests in `/tmp/resident-selection-wiring-corrected-focused-2.log`.
The source entrypoint TLS test also passes in
`/tmp/resident-configured-startup-focused.log`.

The first full gate stopped at the complexity cap. Startup configuration
resolution was split along its configuration ownership boundary, and complexity
now passes without suppressions. Both fresh Standards and Spec reviews found the
request-override acquisition path; both reread its correction and report no
remaining scoped findings. The next gate caught one fixture formatting change;
that file was formatted without changing behavior. The final full gate passes
438 files and 5,548 tests, with 99.45% statements, 99.01% branches, 99.00%
functions and 99.55% lines. Duplication is 0.92%. TypeScript and Effect diagnostics
check 1,258 files with zero errors or warnings. All other gate stages pass.
The final receipt is `/tmp/resident-selection-wiring-check-all-final.log`;
the earlier formatting failure is preserved in
`/tmp/resident-selection-wiring-check-all-corrected.log`. No production source
changed after the final gate. No threshold, diagnostic or timeout was weakened.

## Saved-profile lifecycle through packaged adapters

The Linux packaged fixture now uses an isolated default XDG profile store and an
actual explicit resident backend. An admitted SDK adapter retains its catalog and
context response while saved credentials rotate, logout removes credentials,
URL/workspace changes replace the destination, and the profile is deleted.
Fresh adapters exit with failure after each change. Selecting another valid
profile or a missing profile also fails. Restoring the original profile permits
another attachment alongside the existing adapter.

This defines the current capture policy: changes affect future attachments;
already-admitted adapters retain their captured authority until their own
retirement. They do not acquire replacement credentials from later file changes.
The fixture exercises metadata/context calls without acquiring a Huly model. Live
Huly operations and reconciliation remain pending.

Review found that SDK connection errors could let a timeout count as refusal and
that SDK `close()` alone did not confirm child closure. Refused adapters now use
owned subprocess callbacks and schema-parsed failure exits, empty protocol stdout,
specific diagnostics and credential-disclosure checks. SDK clients join an
installed close barrier before fixture cleanup.

The stronger diagnostic check exposes a production defect: manual adapter startup
erases the profile's no-credentials error. The corrected failing run is
`/tmp/resident-profile-diagnostics-corrected-red.log`. The entrypoint now preserves
typed `CliProfileStoreError` diagnostics, matching the managed entrypoint, while
unexpected failures retain the static fallback. The focused packaged case passes
in `/tmp/resident-profile-diagnostics-green.log`. The earlier initial diagnostic
run expected the wrong incompatibility wording and is retained separately in
`/tmp/resident-profile-diagnostics-red.log`.

The first frozen full gate passes 457 files and 5,637 tests at all unchanged
coverage thresholds (`/tmp/resident-profile-lifecycle-frozen-check-all.log`).
Review then strengthens refusal evidence to require `killed: false` and
`signal: null`, excluding timeout-driven termination that exits with code 1.
The fresh full gate fails the existing ten-parent race's five-second coordinator
wait (`/tmp/resident-profile-lifecycle-final-check-all.log`); the profile lifecycle
case passes. This failure is retained and is not replaced by the earlier pass.

Parent phase logs now include process IDs and Effect monotonic timestamps, with
a matching coordinator wait timestamp. No deadline or case changes. The focused
correlated race passes (`/tmp/resident-managed-race-correlated-focused.log`), but
this does not resolve the intermittent full-gate failure. Both reviews find no
remaining scoped defect in the final diagnostics and fixture changes.

The final frozen full gate passes 457 files and 5,637 tests: statements 99.45%,
branches 99%, functions 99%, lines 99.56%, duplication 0.91%. All existing
diagnostics and limits remain enabled. Its receipt is
`/tmp/resident-profile-correlated-check-all.log`, SHA-256
`fa6e15c82d61cfc8d2c10160f799f5b98a2243bd7171260877427d6e42fe2886`.
The packaged `dist/index.cjs` SHA-256 is
`850fc38557c6b433344b764a0701230395a3f1b31d9c2a0c0f7c6e06eea0bc63`.
The ten-parent process receipt is
`/tmp/resident-managed-parents-oeICRP.receipt.json`.
This pass does not establish that the intermittent launch-race failure is fixed.

These are explicit startup and comparison checks. Automatic ownership/startup,
complete profile lifecycle qualification, live Huly sharing and final native OS
and resource certification remain pending. No issue is complete.


## Preserve explicit null proxy results

The proxy result wrapper used nullish fallback to text content, replacing an explicit structured `null` result with a text-block array. It now falls back only when structured content is absent. The scripted operation regression failed before the fix and passes afterward; warnings, images and argument observations remain covered. This is payload fidelity shared by resident, standalone and HTTP dispatch, not a new transport guarantee. See the qualification report for exact receipts and the subsequent failed full-gate run.

The [name-driven auto-exposure increment](issue-328.md#name-driven-auto-exposure-on-one-backend--2026-10-18)
checks Claude Code/native and Codex/proxy reader names through one auto-configured
backend for both protocols and both input orderings. Actual context kinds,
complete606/6catalogs, exact native/proxy project results and separate reader
ownership are checked. It changes no profile authority, policy compatibility or
production defaults. Full capability/auth/invalidation matrices remain pending.

[Actual Codex and Claude auto-exposure evidence](issue-328.md#actual-host-auto-exposure--2026-10-18)
checks the real host-reported client kind and selected native/proxy mode with
TOOLS=get_project and strict proxy output. Both pass actual project reads and
owned retirement. It adds no complete credential-invalidation, concurrent
actual-host sharing, capability or platform claim.


### Native server output validation — 2026-10-18

[Report](resident-native-output-validation-2026-10-18.md): productionregistry/defineTool/nativeHTTPS injectedoperation returnsinvalidnegativecount, rawHTTP(native/proxystrict/nonstrict) receivesexactinvalidoutputerror/no structuredsuccess; nextvalidcall exactcount1/operationcalls2. NoSDKclientvalidationconfound. Final2focusedfiles19testsPASS, local lint/format and bothreviewsaccepted. No productionchange/fullgate; packagedadapter/nativeHuly/allresulttypes/platform/lifecycle stillseparate, all six tickets incomplete.
