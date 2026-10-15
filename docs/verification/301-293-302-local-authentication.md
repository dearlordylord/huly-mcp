# Local authentication implementation and qualification

Scope: GitHub #301 (private local token management), #293 (macOS Keychain), and
#302 (Linux Secret Service), based on `1e74e625`. Worktree:
`/tmp/hulymcp-local-auth`, branch `implement/local-auth-301-293-302`.

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
