# macOS local authentication qualification

This checklist records evidence still required by #293. A passing hosted-runner
Keychain CRUD probe establishes native adapter behavior only. It does not establish
desktop authorization prompts, live Huly access, or a particular MCP host's access.

The [2026-10-15 host report](macos-local-authentication-2026-10-15.md) records
completed happy paths and the predecessor's locked-logout failure. Use a corrected
candidate for remaining checks; same-version reinstall does not qualify upgrade.

Use the candidate's packed CLI and MCP packages on the same macOS account and
login session as the intended MCP host. Record the candidate commit, package
versions, macOS version, Node executable, MCP host/version, date, and observations.
Use a disposable Huly account/profile; never record token or password values.

1. Build with `pnpm build`, then run
   `pnpm exec tsx scripts/native-credentials-probe.ts`. Confirm real native
   write/read/replace/delete succeeds. This probe deletes its test entry.
2. Install the packed CLI and MCP packages in an isolated directory. Create a
   profile pointing to the test Huly workspace, then run
   `huly auth login --profile macos-qualification --storage os`. Enter the password
   only at the hidden prompt. Record every Keychain authorization prompt and the
   selected response.
3. Run `huly auth status --profile macos-qualification` and
   `huly auth check --profile macos-qualification`. Status must report configured,
   unverified state; the explicit check must report verified access. Use hidden
   `huly auth import-token --profile macos-qualification` to replace the token,
   then check again. An invalid replacement must preserve the previous access.
4. Configure the actual MCP host to launch the installed MCP executable with
   `HULY_PROFILE=macos-qualification` in its environment, without token/password
   environment overrides.
   Perform a project read from that host and compare it with the CLI. Record
   authorization prompts separately for Terminal and the MCP host.
5. Use Keychain Access to deny access or lock the disposable test keychain, then
   exercise CLI read/import/logout and MCP-host read. Capture only sanitized
   outcomes: failure must be actionable and must preserve selected metadata and
   the saved token. Restore access explicitly and confirm the prior credential
   still works. Offline status must not request Keychain access.
   Include the reported default-change regression: save into an unlocked disposable
   Keychain, restore the original default, then explicitly retain the disposable
   Keychain in the search list. Confirm access before locking it. Locked logout
   must fail and keep both application files byte-identical; unlock must restore
   access to the same credential. Lock only the disposable Keychain.
6. Repeat after replacing/upgrading the packaged executable. Record whether macOS
   requests authorization again; the application does not promise to suppress
   system prompts. Also check a session where the selected Keychain is unavailable.
7. Inspect application-managed profile/credential files for token/password values
   and decryption keys without printing them. Native metadata may contain lookup
   IDs and destinations only. File-backed and complete environment-backed access
   must succeed without accessing Keychain, including while native access is denied.
8. Run `huly auth logout --profile macos-qualification`; confirm the native entry
   is removed, profile metadata/selection remain, and subsequent CLI/MCP starts
   require credentials without terminal prompts. Logout does not revoke a Huly
   token or clear environment variables or credentials held by a running process.

Record PASS/FAIL/NOT RUN for each item and link sanitized logs. Do not mark #293
qualified until the real packaged CLI and MCP-host checks have execution evidence.
