# Local authentication

CLI and stdio MCP share named profiles. Profiles contain the instance URL,
workspace, optional default project, and selected credential storage. Credentials
remain bound to the exact URL and workspace used when saved.

```bash
huly profile create work --url https://huly.example --workspace main
huly auth login --profile work --storage os
huly projects list --profile work --json
huly auth status --profile work --json
huly auth check --profile work --json
```

`login` asks for email and a hidden password, and saves the resulting workspace
token. It does not create a managed API token. Existing login defaults to file
storage. `--storage os` explicitly selects macOS Keychain or Linux Secret Service.
Later replacements retain that selection when the flag is omitted. Existing
saved credentials cannot be migrated by changing this flag; use a separate
profile for a different backend. Updates do not migrate credentials or activate
native storage for file-backed or environment-only configurations.

Prefer OS storage when available. Persisted plaintext file credentials remain
supported, with restrictive file permissions, but are not recommended. Runtime
environment injection from a secret manager is a separate supported mode and
does not require persisting a credential in a profile.

## Import an existing token

```bash
huly auth import-token --profile work
```

This asks for hidden terminal input. For automation, explicitly select `--stdin`
and pipe a token from your secret manager. Tokens are never accepted as command
argument values. A token must be a single nonempty value without whitespace;
leading/trailing whitespace from stdin is removed. Input is limited to 64 KiB.
For a new profile without a saved credential, `--storage os` opts into native
storage during import as well.

Import verifies a token with a live read before saving. The check has a
10-second budget. Failed verification leaves the saved credential unchanged.
There is no automatic token renewal or additional read/write/project scope.
Managed-token capability and revocation guarantees depend on the Huly deployment;
import does not change them.

## Status, connectivity, and logout

`auth status` is offline. `configured` means credentials are configured, and
`verified: false` explicitly means connectivity has not been checked. The retained
`authenticated` field is a compatibility alias for configured state, not evidence
of a live authenticated session. Native status uses saved nonsecret references;
it does not retrieve the native secret and cannot detect external deletion or
revocation. `credentialStorage` reports the selected backend.

`auth check` explicitly reads Huly and returns `verified: true` only after that
read succeeds. It does not save or replace credentials.

```bash
huly auth logout --profile work
```

Logout deletes the selected saved credential and retains profile metadata and
selection. A deletion failure is an error. Logout does not revoke Huly tokens,
remove environment credentials, or disconnect an already-running CLI/MCP process.

## Native sessions and headless runners

On macOS, Keychain access runs as the current OS user. macOS controls access
prompts and may display one after an update or when the executable identity
changes. Explicit native-storage selection authorizes Keychain access; the
application does not promise suppression of OS prompts. Denied or unavailable
access fails without plaintext fallback or an application-owned unlock prompt.

On Linux, CLI and the MCP host must share access to the same user's desktop
session D-Bus and unlocked Secret Service collection (for example GNOME Keyring).
The default collection must already exist. The adapter does not invoke Secret
Service prompt objects or unlock a collection. Missing service/session, locked
storage, and requested interaction return an actionable error within a bounded
operation. Container and headless runners should explicitly inject complete
environment credentials when native storage is unavailable.

Native replacement writes a separate OS entry before selecting it, so a failed or timed-out write leaves the previous selected credential intact. Metadata contains nonsecret lookup IDs rather than decryption keys. After selection succeeds, cleanup of the previous entry is attempted; retained lookup IDs let logout retry deletion if cleanup was unavailable.

Native mode writes no token or decryption key beside profile metadata. Windows
continues to support file credentials and environment injection. File-backed and
environment-only operations do not access Keychain or Secret Service.

Set `HULY_PROFILE=work` in the stdio MCP process environment to select the same
profile. CLI uses `--profile`, then `HULY_PROFILE`, then the active profile. Stdio
requires explicit profile selection and otherwise preserves environment-only
configuration. Complete environment credentials and destination override a saved
profile without reading its native store; partial credential overrides fail.
