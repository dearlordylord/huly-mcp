# Local authentication implementation and qualification

Latest host qualification: **FAIL** on the merged PR #318 runtime. The
[final macOS report](macos-pr318-qualification-final-2026-10-15.md) confirms
locked-import rejection/recovery and executable replacement checks, but exposes
unavailable-Keychain logout reference loss and missing actionable MCP startup
diagnostics. Follow-up [PR #319](https://github.com/dearlordylord/huly-mcp/pull/319)
is tracked in [its correction receipt](293-unavailable-keychain-mcp-startup.md).
#293 remains open; earlier passing locked-keychain receipts do not qualify the
unavailable-keychain case or actual Codex diagnostics.

Scope: GitHub #301 (private local token management), #293 (macOS Keychain), and
#302 (Linux Secret Service), based on `1e74e625`. Worktree:
`/tmp/hulymcp-local-auth`, branch `implement/local-auth-301-293-302`.

## PR #318 completion audit (historical)

The combined objective is **incomplete**. Current runtime candidate `6bdaf85f`
fixes the locked-Keychain logout blocker and passes fresh local `pnpm check-all`:
5,461 tests; statements 99.47%, branches 99.00%, functions 99.03%, lines 99.57%.
The fixture-only successor `f95f4706` passes
[Node 22/24 CI](https://github.com/dearlordylord/huly-mcp/actions/runs/38824941669)
and [Package Smoke](https://github.com/dearlordylord/huly-mcp/actions/runs/38824941635).
Its [complete native macOS gate](https://github.com/dearlordylord/huly-mcp/actions/runs/38824941679)
also passes: real CRUD, installed packed-CLI locked/logout/unlock recovery,
package dependency closure and all 5,461 tests. macOS 26.6.2 arm64 / Node 24.15.0
coverage matches the Linux receipt above. The blocker is corrected; remaining
actual-host denial/unavailable-session, upgrade and visual-prompt criteria keep
#293 and the combined objective incomplete.
The [macOS 27 host report](macos-local-authentication-2026-10-15.md) establishes
packed CLI and actual Codex MCP-host happy paths, and records the predecessor's
blocking logout failure. The corrected installed-CLI regression passes on a real
macOS runner in [run 38823671921](https://github.com/dearlordylord/huly-mcp/actions/runs/38823671921).
Its later harness failure and repairs remain separate receipts below.
PR [#318](https://github.com/dearlordylord/huly-mcp/pull/318) remains a draft.
The sections below retain earlier checkpoints and failed receipts as history.

The audit uses acceptance bullets in their order on each issue; research checks
are listed separately. A passing shared-port test proves application behavior,
but does not prove a native OS/process-context requirement.

| Issue / criteria | Evidence and result |
| --- | --- |
| #301 acceptance 1–5 | Passing private-input/process tests and packaged file/Linux workflows establish hidden/stdin import, verification before persistence, failed replacement preservation, configured versus verified status, metadata-preserving logout, and CLI/stdio access. |
| #301 acceptance 6–8 | Shared configuration/HTTP/parity checks and Standards/Spec reviews pass. Full CI and focused live auth workflows pass. The broad predecessor regression's one relation failure and passing scoped diagnosis remain separate receipts below. |
| #301 research checks | Hidden prompt and sentinel/file inspection pass in the packaged workflows. Environment-only status and shared-store serialization guards pass without compulsory persistence. |
| #293 acceptance 1, 5–7 | Explicit selection, schema-owned metadata, shared routing, documentation and configuration preservation have passing shared-seam tests/reviews. This is implementation evidence, not a full native macOS workflow receipt. |
| #293 acceptance 2–4, 8 | **Partial:** macOS 27 host evidence passes packed CLI login/check/import/rejected replacement and actual Codex MCP reads against local Huly. It demonstrates the predecessor locked-logout blocker. The corrected packed-CLI default-change/lock/failure/unlock/recovery/logout fixture passes on macOS 26 arm64; actual-host correction, access-denial and unavailable-session qualification remain open. |
| #293 update/headless research checks | Same-version reinstall and actual packed CLI/Codex MCP retrieval pass on the host. Actual binary upgrade, denied-access behavior and complete visual system-prompt observations remain untested. |
| #293 session and file-artifact research checks | Host inspection passes normal-access no-secret application JSON checks, native metadata shape, explicit file login/check, and complete environment-backed reads. Denied-state fallback isolation and a complete decryption-key audit remain unqualified. |
| #302 acceptance 1–5 | Real Linux Secret Service probes and installed packaged CLI/stdio workflows pass: explicit backend, CRUD/replacement/logout, locked collection, missing session/service, no plaintext fallback, and accurate offline backend/status. |
| #302 acceptance 6–8 | Configuration/HTTP/parity checks, schema/redaction/port reviews, full CI and focused local-Huly auth qualification pass. Platform-local dependencies and versions are recorded below. |
| #302 research checks | Same-session CLI/stdio, locked/missing-session failures and file inspection pass in the private D-Bus fixture. Typed prompt-return refusal and connection cleanup pass through the injected transport; no Prompt/Unlock operation exists in the supported protocol. Environment alternatives are documented. |

The remaining macOS qualification follows
[the checklist](macos-local-authentication.md). The supplied host report records
macOS 27 arm64, Node 25.6.1, packed CLI 0.51.1/MCP 0.53.1 and the actual Codex
app-server. A hosted regression job cannot substitute for its remaining actual
upgrade, denied/unavailable-session, and visual prompt observations. No secrets
or SecurityAgent UI automation are required or requested for this implementation.

## Delivered candidate

- `auth import-token` accepts hidden terminal input or explicit stdin, rejects
  token argument flags, parses a redacted token, and performs a bounded live read
  before persistence. Password login remains a separate existing workflow.
- `auth status` reports configured state with `verified: false`; native status
  reads nonsecret references rather than retrieving secrets. `auth check` is an
  explicit bounded live read. Logout retains profile metadata and selection.
- The shared credential-store seam routes CLI and stdio to file storage, macOS
  Keychain, or Linux Secret Service. File remains the default. Native selection is
  explicit; replacements retain the backend. There is no migration or fallback.
- Native secrets contain a schema-owned destination-bound payload. Ordinary
  profile/config files contain only nonsecret backend/destination references.
  Native operations use typed secret-free failures. Linux rejects locked items
  and prompt objects without invoking interactive Prompt behavior. macOS access
  prompts remain OS-controlled.
- Operator instructions: [local authentication](../local-authentication.md).

## Environment and completed checks

Linux arm64, Node `v24.20.0`, pnpm `10.29.3`, Effect `4.0.0`, Vitest `5.0.1`.
Native dependencies: `@napi-rs/keyring@2.1.1`, `dbus-next@0.10.2`. Linux native
facilities were extracted from Debian packages into
`/tmp/hulymcp-native-facilities`, without privileged installation:
GNOME Keyring `42.1-1+b2`, libsecret tools `0.20.5-3`, GCR/GCK `3.41.1-1+b1`.
Each native run uses a private `dbus-run-session` and disposable keyring data.

Completed evidence as of this checkpoint:

- `pnpm typecheck`: zero TypeScript/Effect errors or warnings (1,201 files).
- `pnpm lint`: pass; duplication 0.94%, below the unchanged 2% threshold.
- `pnpm complexity`: pass with the unchanged limit of 8.
- `pnpm verify-cli-package-closure`: the exact declared external set is
  `@napi-rs/keyring`, `dbus-next`, and `ws`, including dynamic imports.
- Focused native-store/profile/token tests pass, including failure preservation,
  native metadata serialization, status without native reads, and a TestClock
  check proving an unresponsive verification never saves.
- Real Linux adapter probe: write/read/replace/delete/missing-delete passes;
  separate real locked-collection and unavailable-service read/save/delete probes
  pass. Commands: `pnpm exec tsx scripts/native-credentials-probe.ts`, its
  `--locked` mode in a disposable collection, and its `--unavailable` mode in a
  private D-Bus session without Secret Service.
- Packaged file-profile live workflow passed on the candidate built with the
  profile rollback fix: `/tmp/hulymcp-local-auth-file-final.log`. This covers real
  password login, hidden and stdin import, rejected replacement preservation,
  offline status, explicit check, matching CLI/stdio project reads, changed
  destination refusal, logout, missing-credential refusal, and secret inspection.
- Packaged native-profile live workflow passed before the added command-level
  lock fixture: `/tmp/hulymcp-local-auth-native-profiles-live.log`. This also
  checks that application-managed files contain no native credential material.

## Failures and remaining qualification

The first `pnpm check-all` stopped at the package-closure checker, which still
expected only `ws`. The checker now examines both static requires and dynamic
imports and requires the exact three declared dependencies. Its focused check
passes; the failed full gate is not a passing receipt.

A separate broad coverage run passed 5,393 tests but failed two tests and one
suite cleanup hook. One failure was an existing custom-field property oracle:
seed `-1613549909`, path `72:0:0:0:0:0:0:0:0:0:1:9:9` generated `{of: 0}` as
supposedly-valid extra enum metadata. The schema correctly rejects a numeric
modeled `of` field. The generator now excludes modeled keys from valid extra
metadata, retains arbitrary metadata for the unknown variant, and has a literal
regression for the discovered counterexample. Four affected focused files / ten
tests pass after the repair; production custom-field behavior is unchanged.

The two process-related broad-run failures were a 10-second stdio fixture cleanup
hook timeout and a captured CLI defect-process timeout. The unchanged focused
files pass: two files / twelve tests. No timeout or quality threshold was raised.

The expanded Linux native command fixture rejected locked CLI reads/import/
logout and locked stdio, but its restoration step initially started a second
daemon instead of unlocking the existing one. A disposable-fixture-only daemon
replacement/unlock now restores the same persisted collection. The repaired
packaged live run passed (`/tmp/hulymcp-local-auth-native-final-repair.log`),
including locked CLI/stdio and missing-session failures. This is a fixture repair, not a native adapter fallback.

Required remaining evidence at this checkpoint:

- Fresh complete `pnpm check-all`, including 99% coverage.
- The expanded packaged Linux lock/missing-session workflow and the broader live
  MCP integration run (both running at this checkpoint).
- Standards and Spec reviews and any resulting fixes.
- Actual macOS native write/read/replace/delete, denial/locked/unavailable checks,
  packaged CLI and MCP-host-launched stdio, and observed update/system-prompt
  behavior. This Linux environment cannot certify macOS; injected fixtures and
  Linux evidence do not satisfy #293's native-platform criteria.

The three issues and the overall goal are not claimed complete.


## Review and successor candidate

The first implementation was committed as `2a6acb83`; normal hooks passed
TypeScript/Effect diagnostics and gitleaks. Standards and Spec reviews compared
that commit with `1e74e625`.

### Standards

The review reported four hard issues: raw token strings leaving input adapters,
non-schema-owned generic outbound D-Bus calls, file values permitted in native
backend metadata, and replacement policy embedded in CLI handlers. It also noted
repeated platform mapping. The successor redacts input at the adapter, uses a
closed schema-owned Secret Service operation set with colocated encodings,
restricts native backend values, and shares storage policy/platform mapping in
application modules. The D-Bus module is loaded only on native access. Typed
transport injection permits prompt-return and timeout/cleanup tests without
module mocks.

### Spec

The review reported missing macOS qualification, missing final full-gate/broad
live evidence, and an unsupported 64-KiB stdin-limit claim. The size limit is now
implemented with a bounded typed stream adapter and covered through actual CLI
processes. Process tests also prove that positional token mistakes, token flags,
and JSON parse failures do not echo token values. Terminal reads close on
cancellation. Required platform and broad qualification remain explicit below.

Additional successor safety work uses immutable native entries with atomic
selection publication. An injected native port can change a staged OS entry and
then return failure; the prior selected credential remains usable. Nonsecret
retired lookup IDs permit idempotent cleanup retry on logout. File/environment
operations do not access native facilities; complete environment status also
avoids reading unrelated saved credentials.

Focused successor checks pass for private input, protocol requests, prompt
refusal, injected-clock timeout/cleanup, backend policy, native publication,
profile status, and existing profile behavior. Representative focused run:
eight files / 59 tests (`/tmp/hulymcp-local-auth-review-ready-tests.log`), followed
by three files / 17 tests after schema-owned profile-summary output was added
(`/tmp/hulymcp-local-auth-status-schema-tests.log`). The broad MCP integration
process continues against the preserved first-candidate bundle; it is not yet a
complete passing receipt. A fresh full gate, final native workflow after the
lookup-ID publication change, and delta reviews remain required. macOS has no
execution receipt.

Successor delta reviews found no remaining hard Standards violations. The
Standards reviewer noted that retained retired lookup IDs grow with replacements;
they remain deliberately conservative cleanup receipts, including already-deleted
IDs, so cleanup can be retried without a second metadata publication that could
misreport a committed replacement. This is a retained-state tradeoff, not a
credential-material sidecar. The Spec reviewer found one checklist mistake:
stdio selection requires `HULY_PROFILE`, not a CLI flag; the checklist is corrected.

Latest successor checks: TypeScript/Effect diagnostics pass (1,211 files, zero
warnings/errors), lint passes (0.93% duplication), seven focused files / 26 tests
pass, and three private-input/process files / 22 tests pass. GitHub Actions is
enabled; `.github/workflows/native-macos.yml` prepares an isolated real Keychain
CRUD job. It has not executed and does not certify desktop prompts or live Huly.
The host checklist is [macOS qualification](macos-local-authentication.md).

## Frozen successor qualification (`fc93683f`)

A detached Linux qualification worktree preserves the broader predecessor MCP
run's original bundle. Both final installed packaged CLI workflows pass against
matching successor MCP output: file storage
(`/tmp/hulymcp-local-auth-fc93683f-file-live.log`) and real Secret Service
(`/tmp/hulymcp-local-auth-fc93683f-native-live.log`), including locked and missing
session errors, immutable replacement, offline status/check, CLI/stdio sharing,
secret inspection, and logout.

The fresh full gate passed every stage before tests/coverage, then failed five
process tests across three files: adapter subprocess timeout, two private-input
process timeouts, resistant-descendant timeout, and a missing process-cleanup
message. It passed 5,411 tests; this is a failed full receipt, not coverage
certification (`/tmp/hulymcp-local-auth-final-check-all.log`). All three unchanged
affected files pass together, 21 tests
(`/tmp/hulymcp-local-auth-final-failures-focused.log`). No timeout or threshold
changed. A fresh full gate remains required and is being retried after the
packaged live runs completed. macOS execution remains pending.

The first full retry passed all 5,416 tests but failed function (98.70%) and
branch (98.67%) coverage. A second candidate added SDK injection ports and tests
for native encoding/error/lifetime behavior, Keychain redaction/error translation,
native selection/publication guards, private argv parsing, and non-TTY input.
Standards and Spec delta reviews against `fc93683f` found no new issues. The next
full run passed 5,434 tests and function coverage (99.02%), but branches remained
98.94%. No threshold, exclusion, or timeout changed. Additional tests cover
missing-profile import, environment-only check, closed stdin, native-preserving
profile updates, and unselected offline status; the subsequent gate is pending.

The broader predecessor-bundle MCP regression finished with 1,443 passed, one
failed, and 31 skipped. Its failure was a missing reverse issue-relation
identifier after adding a relation. It is not a passing broad receipt. A scoped
fresh-pair probe against the current bundle returned both the expected forward
`blockedBy` and reverse `blocks` identifiers, then deleted its fixtures
(`/tmp/hulymcp-local-auth-relation-diagnosis-final.log`). An earlier diagnostic
parser expected an unwrapped response; its created fixture was recovered and
deleted before the successful scoped probe. No relation production code changed.

## Passing full gate after coverage repair

`pnpm check-all` passed on the final coverage-repaired source, including all
5,440 tests across 417 files. V8 coverage: statements 99.47%, branches 99.00%,
functions 99.04%, lines 99.56%. Every original threshold and timeout is unchanged;
no coverage exclusions were added. Receipt:
`/tmp/hulymcp-local-auth-final-certified-gate.log`. The installed D-Bus SDK also
has an actual connection/disconnect test; injected SDK tests exercise wire
requests, cleanup, and safe failure mapping. Real Linux native CRUD passes again
after the SDK-port refactor (`/tmp/hulymcp-local-auth-repaired-native-probe.log`).

Actual macOS execution and desktop/MCP-host authorization observations remain
unverified. The three issues are not collectively claimed complete.

## GitHub platform evidence

Draft PR [#318](https://github.com/dearlordylord/huly-mcp/pull/318) contains the
candidate. The [native macOS run](https://github.com/dearlordylord/huly-mcp/actions/runs/38810408590)
passed on macOS 26.6.2 (25G83), arm64, Node 24.15.0: isolated real Keychain CRUD
and CLI dependency closure. This establishes native adapter execution, not live
packaged CLI/MCP-host access or desktop authorization/update prompt behavior.
Those manual checklist items remain unverified.

Package Smoke exposed stale byte certificates. The verifier now inventories
both static requires and lazy imports while retaining exact closure equality.
This includes the new native libraries and a preexisting optional Redis digest
helper's lazy `@node-rs/xxhash` import in the MCP bundle. Actual MCP/CLI packed
certification and CLI size reporting pass with refreshed evidence. Three focused
artifact test files / 14 tests and TypeScript/Effect diagnostics pass. Separate
Standards and Spec delta reviews found no new issues or weakened checks. App
runtime is unchanged by this verification-only repair; the prior full gate and
native receipts are retained separately.

The next Package Smoke run passed artifact certification but exposed an old
seven-local-command inventory. The inventory now counts nine (five auth and four
profile leaves); the 604 registry routes and 55 root commands remain unchanged.
Smoke coverage includes both new auth helps using their existing Effect CLI
renderer. An installed `--no-optional` packed CLI smoke passes locally, including
all representative help, structured input, and exact failure-stream/exit checks.
Six focused contract tests, inventory verification, lint and formatting pass;
Standards and Spec reviews found no inventory weakening.

CI passed on both Node versions for `ad0b52fb`. On `50e35680`, Node 22 passed;
Node 24 failed the existing legacy handshake fixture with a missing response ID.
The fixture assumed the next message was a response and could receive a
notification. It now schema-parses notifications/responses and matches request
IDs. A deterministic transport-port test emits a notification and unrelated
response before the matching response. All five spawned stdio tests pass after
this fixture-only correction; timeouts and server behavior are unchanged.
The failed CI receipt remains distinct from passing scoped repair evidence.

## Locked Keychain logout regression

The host report `macos-local-authentication-2026-10-15.md` records successful
packed CLI authentication and real Codex MCP-host reads on macOS 27, followed by
a blocking logout failure. Its decisive sequence changes the default Keychain
while retaining the credential's Keychain in the search list, then locks that
Keychain. The predecessor reports successful logout and discards the reference;
unlocking cannot recover access through the profile.

The replacement adapter locates metadata across the search list and retrieves
secrets through the native SDK in a disposable process using the same Node
executable. A located entry without an accessible secret is an access failure,
not an absent credential. Deletion requires an accessible credential and a
confirmed absence afterward. Commands contain no token arguments; captured
secret payloads are schema-parsed and redacted. Native reads and metadata
commands are bounded. Failed logout preserves the credential reference.

Focused regressions exercise ineffective deletion acknowledgements, locked
reads, malformed/ambiguous records, and real-file metadata preservation through
lock/failure/unlock/success. The native macOS workflow installs the packed CLI
and reproduces the report's default-change sequence against a disposable
Keychain. [Native macOS run 38823671921](https://github.com/dearlordylord/huly-mcp/actions/runs/38823671921)
passes this exact packed-CLI fixture and native CRUD on `f5137afd`, macOS 26 arm64
and Node 24.15.0. The locked operation returns a typed failure within the 10s
adapter deadline; both metadata files remain byte-identical, unlock restores
the previous credential, and subsequent logout removes its reference.

The complete job then fails movement process checks: the runner lacks the
required Bash/GNU timeout tools, and the artifact-hash fixture needs a canonical
temporary root. These are fixture/environment repairs, not reduced custody
checks. Earlier runs 38822817578, 38823027332, and 38823401426 passed native CRUD
but failed the new fixture before lock because default restoration invalidated
its search-list setup. Setting search-list membership after default restoration
fixes that preparation error; those failed receipts are not passing evidence.
Standards and Spec reviews found no new demonstrated issues in the revision.

The host report also identified portable harness defects. CLI input fixtures
now use the actual OS profile paths; early stdin closure retains the child's
exit receipt without an unhandled EPIPE; permission-denied process-group probes
remain explicitly unconfirmed cleanup. Movement custody fixtures canonicalize
their temporary roots without relaxing production custody checks. The first fresh complete gate passed 5,454 tests but failed coverage
(functions 98.93%, branches 98.89%). The second passed 5,459 tests but failed
branches at 98.99% (functions 99.00%). Meaningful subprocess receipt, schema
failure, TestClock cleanup, pre-aborted read, and legacy-reference logout tests
address uncovered native boundaries without exclusions or threshold changes.
The third gate passed 5,461 tests (functions 99.03%) but still failed branches
at 98.99%. Coverage identified an unreachable empty-map fallback after a native
reference was already proven present. Logout now captures and narrows that map,
then carries it through deletion; missing-map/ref cases and repeated logout stay
idempotent. Standards review found no behavior change or gate weakening.
The fourth complete Linux gate passes on runtime `6bdaf85f`: 420 files / 5,461
tests; statements 99.47%, branches 99.00%, functions 99.03%, lines 99.57%.
All build, TypeScript/Effect diagnostics, movement process checks, architecture,
complexity, formatting, duplication and artifact closure gates pass. The fixture-only `f95f4706` successor passes Node 22/24 CI
(run 38824941669) and Package Smoke (run 38824941635). Its full macOS gate (run 38824941679)
also passes: 420 files / 5,461 tests, with the same four coverage percentages.

The fix prevents new reference loss. It does not reconstruct a reference that an
earlier successful-looking logout already discarded; restore its metadata
backup or authenticate explicitly again. The host's access-denial,
unavailable-session, actual upgrade, and complete visual prompt audit remain
unqualified. The earlier passing native CRUD checks did not cover this blocker.


macOS full-gate follow-up: [run 38824004057](https://github.com/dearlordylord/huly-mcp/actions/runs/38824004057)
on `f8408abe` again passes real CRUD and the installed CLI locked-logout
regression. With Bash/GNU timeout prerequisites installed, movement process
checks pass. The suite reaches 5,459 passing tests and two fixture failures:
`movement-stage-report` and `issue-movement-concurrency-evidence` used aliased
`/var` temporary roots. Those fixtures now canonicalize their owned roots before
constructing explicit negative symlink, permission, owner, noncanonical-path and
overwrite cases. Both files / 13 tests pass locally; fresh Standards and Spec
reviews report no findings. This fixture-only repair follows the successful
runtime `6bdaf85f` Linux gate; it does not relax production custody checks.


Final correction receipt (`f95f4706`, runtime unchanged from `6bdaf85f`):

- [Native macOS and complete gate](https://github.com/dearlordylord/huly-mcp/actions/runs/38824941679): PASS on macOS 26.6.2 arm64, Node 24.15.0; exact packed-CLI default-change/lock/logout failure/unchanged files/unlock recovery/successful logout sequence, real native CRUD and all 5,461 tests.
- [Node 22/24 CI](https://github.com/dearlordylord/huly-mcp/actions/runs/38824941669): PASS for both jobs.
- [Package Smoke](https://github.com/dearlordylord/huly-mcp/actions/runs/38824941635): PASS.
- Fresh Standards and Spec reviews: no findings in the runtime and final fixture deltas.

The original macOS 27 report remains an unchanged predecessor receipt. This
correction does not manufacture its outstanding actual-host observations or
recover references already discarded by the predecessor. PR #318 remains draft.
