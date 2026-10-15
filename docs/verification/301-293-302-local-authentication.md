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
replacement/unlock now restores the same persisted collection; a fresh focused
live run is in progress. This is a fixture repair, not a native adapter fallback.

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
