# Late HTTP attachment across managed idle

The configured managed server now has an additional lifecycle test in
`test/resident/managed-idle.test.ts`. The original no-client retirement test
remains intact.

At virtual 4900ms, a caller selects the actual published server through the
production selection/admission path. Its HTTPS ping must decode to exactly
`{ jsonrpc: "2.0", id: 1, result: {} }`. The retained attachment holds the
server across another full 5000ms. A second exact successful ping completes
before the caller releases its admission. The server remains alive for 4900ms
after release, then joins retirement after another 100ms. Its private state
directory must be empty; subsequent selection must acquire absent ownership
rather than reuse a retired descriptor.

The first review correctly identified that HTTP200 alone allowed an MCP error.
Both calls now use the production bounded response decoder and exact terminal
reply assertions.

Evidence: `/tmp/resident-late-http-idle-final.log`, two files/seven tests pass.
Changed-file Oxlint and formatting pass. This is an actual configured HTTPS
server with controlled Effect time in one process. It does not prove separate
OS-process races, replacement backend startup, or physical timeout duration.
No production code, legacy behavior, journal, or timeout changed. No full gate
or live Huly campaign was run. Issues323–328 remain incomplete.

## Replacement startup extension

After the original owner joins and its state is empty, the test now runs an
actual replacement through `runOwnedGeneration` and
`runConfiguredResidentServer`. Its published generation path must differ from
the original. A fresh caller must select precisely that path and receive the
exact successful ping reply through HTTPS. After its release, the replacement
also completes managed idle retirement and leaves the directory empty.

This supersedes the earlier absent-ownership-only observation: replacement
startup and fresh attachment are now exercised. It still does not establish an
OS-process race or physical timeout duration. The publication signals preserve
the parsed `ResidentFilePath` type. Evidence:
`/tmp/resident-idle-replacement-final.log`, two files/seven tests pass; scoped
Spec review accepted, Standards path-type finding corrected. No full gate.
