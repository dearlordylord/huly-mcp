# Issue 325 implementation evidence

## Token and password configurations — criterion 4

The managed backend receives the complete captured Huly configuration through
private Start IPC. `resolveProcessConfiguration` provides that configuration to
the HTTP backend through `HulyConfigService`. The Huly client passes either the
captured token or the captured email and password to the SDK. Configured resident
HTTP rejects Huly override headers before resolving a request client; credentials
are not supplied through per-invocation token headers.

The configuration guard in `test/resident/process-configuration.test.ts` covers
both authentication methods against conflicting ambient URL, workspace, token
and profile settings, including a conflicting Effect config provider. It checks
the retained authority, authentication method, password whitespace, lazy setting
and sanitized runtime context. Both selected cases passed on 2026-10-18.

A read-only local Huly observation used the packaged production source at
`0db836c2959eed1b06eefd41a82c818327cc30ee`. It authenticated with a password,
obtained an ordinary workspace token through the existing SDK, and started one
managed stdio adapter for each method. Each reported the expected authentication
method and read the expected existing project through `get_project`. They used
distinct backend generations and ports. Both adapters and both backends exited
with code 0; the private runtime namespace was empty afterward.

Local evidence is retained in `/tmp/resident-auth-config-0db836c2`:

- `live-input-next.json` binds the runtime, observer and target hashes.
- `live-receipt-next.json` records both typed reads and owned process exits.
- `adapter-password-next.json` and `adapter-token-next.json` record each direct
  parent's wait result for its Node adapter.
- `live-owned-exits-next.jsonl` records the outer supervisor's wait results for
  the two reparented backends and the observation process.
- `captured-final-direct.json` records the two focused configuration tests.

The first live attempt reached both successful reads but failed its exit
observer: the outer supervisor tried to wait for adapter exits already consumed
by the MCP SDK. Its failed receipt and source remain unchanged. The corrected
observer makes each wrapper wait for its own adapter and asks the outer
supervisor only for reparented backend exits.

This observation uses MCP revision `2025-06-18`, supported by the recorded actual
Codex consumer. It establishes this Linux authentication scenario. It does not
establish modern protocol startup, macOS qualification, performance, a full
quality gate or completion of issue 325.

## Saved-profile changes — criterion 5

The focused packaged native-HTTP profile lifecycle scenario passed on
2026-10-18. It checks token rotation, logout, URL and workspace changes, profile
deletion, another selected profile and a missing profile. Each incompatible new
explicit attachment is refused, while the original adapter retains its catalog,
context and expected project read. Restoring the original profile allows a new
attachment. The scenario asserts nine project reads, no writes and no invalid
REST requests. It uses the disposable local REST fixture, rather than live Huly.

`/tmp/resident-auth-config-0db836c2/profile-lifecycle-phase-observed.json`
contains the passing result. `phase-first-source.json` and the two
`phase-first-*.ts` files preserve the exact observed test sources. A subsequent
diagnostic-only correction places the `close` phase after successful reads so
cleanup cannot hide the stage of an earlier failure.

Two earlier failures remain preserved: `profile-lifecycle-current.json` timed
out in the shared preparation hook; `profile-lifecycle-deferred-host.json`
completed preparation but timed out in the scenario. No deadline was increased.
The unrelated native-host fixture now builds only in its consuming tests.
Failed profile scenarios retain their last fixed phase in the owned bundle's
`profile-lifecycle-phase.json`; that diagnostic contains no profile or credential
values. One later success does not establish stable startup or explain the
earlier intermittent failures.

The subsequent in-flight extension holds one actual REST project response while
the saved token rotates. A new explicit adapter is refused and the existing
adapter performs another business read. The held call must remain pending
through both actions, then return the exact original result when released. This
scenario asserts ten reads, no writes and no invalid REST requests. The first
passing observation and exact source hashes are retained in
`profile-inflight-first.json` and `inflight-first-input.json` under the same
evidence directory. Cleanup releases and joins the held call before asserting
success, preserving an earlier scenario failure if one occurred.

The compatibility tests also distinguish password replacement and email changes.
The managed-auth fixture covers equivalent token callers attached together,
password isolation and a rotated token selecting a separate managed backend.
These cases complement the explicit-backend refusal scenario. They do not
establish upstream credential revocation or native macOS qualification.
