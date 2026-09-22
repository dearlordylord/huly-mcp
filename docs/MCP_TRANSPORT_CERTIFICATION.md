# MCP transport architecture and certification

## Current architecture

Huly MCP uses the MCP server, protocol, and schema modules shipped in the pinned
Effect cohort. `src/mcp/effect-ai-registry.ts` registers built-in, proxy, and
native tools plus Huly resources. The same registry feeds both transports and
routes calls into the shared Huly operation layer; transports do not duplicate
tool behavior.

The server configures two dated protocol adapters:

- `2026-07-28` is stateless. HTTP requests carry the protocol version, routing
  headers, and client metadata on every request.
- `2025-06-18` supports initialized HTTP sessions using `Mcp-Session-Id` and
  legacy stateless HTTP calls without initialization. Stateless calls use an
  isolated binding whose lifetime ends with the request. Stdio negotiates the
  session protocol from the opening exchange.

Stdio runs through Effect's MCP stdio layer and Node stdio service. The Huly
lifecycle wrapper owns EOF and signal handling, stops new admissions, drains
in-flight calls, closes the wire and telemetry, and then closes process-scoped
Huly clients within bounded shutdown deadlines.

HTTP runs through Effect's MCP HTTP layer mounted at `/mcp` on an Effect HTTP
router and Node listener. Middleware enforces the optional endpoint bearer
token, derives sanitized Huly configuration from environment variables or the
supported request headers, and provides a request-local Huly client resolver.
Concurrent requests therefore do not share mutable credential state. The server
rejects unsupported methods at the route boundary and drains admitted requests
before closing the listener.

## Release-candidate certification

This table records outcomes only after the named command or suite completes on
the final candidate. Replace `pending` with the sanitized result; do not infer a
pass from compilation or a narrower test.

| Verification | Status | Evidence |
| --- | --- | --- |
| `pnpm check-all` | passed | 337 test files, 4,724 tests; coverage: 99.49% statements, 99.00% branches, 99.07% functions, 99.58% lines. All static gates passed; duplication 0.97%. |
| Focused stdio protocol and lifecycle tests | passed | Included in the full gate: modern discovery, legacy initialization, delayed EOF output drain, signals, and bounded cleanup. The backpressure regression drains twelve delayed 128 KB replies. |
| Focused HTTP protocol, authentication, request-context, and lifecycle tests | passed | Modern and legacy routing, bare legacy calls, header and origin rejection, bearer auth, request isolation, unknown and hidden tool errors, cancellation cleanup, and shutdown drain. |
| `pnpm integration:tool-scope` | passed | Final built candidate passed the native/proxy/auto and strict-scope matrix. |
| Local-Huly native stdio full integration | passed | 1,441 passed, 0 failed, 31 skipped; exit 0 after cleanup. See the candidate scope note below. |
| Local-Huly HTTP integration with environment credentials | passed | 1,437 passed, 0 failed, 35 skipped; exit 0 after cleanup. |
| Local-Huly HTTP integration with request headers | passed | 1,437 passed, 0 failed, 35 skipped; exit 0 after cleanup. Server-side Huly connection credentials were unset. |
| `pnpm integration:cli:full` | passed | Packed and installed the CLI in an isolated consumer: 1,441 passed, 0 failed, 31 skipped; exit 0 after cleanup. |
| Packed artifact and clean-consumer smoke | passed | Packed artifact certification and clean pnpm/npm consumers passed discovery, successful and invalid calls, EOF, and SIGTERM checks. No external Effect package is required by the installed bundle. |

Raw credentials, tokens, request headers, workspace data, and private response
payloads do not belong in this record. Keep detailed private logs outside the
repository and record only counts, outcomes, and sanitized failure summaries.

The full stdio CRUD run used a frozen rc.117 bundle. Subsequent changes preserve
hidden/unknown-tool error results, handle synchronous injected-listener cleanup,
and remove redundant metadata conditionals. The final built-stdio tests, public
schema contracts, and tool-scope matrix cover those changes. The full CRUD run
was not repeated for those isolated changes. Its skips are the existing harness
cases requiring unavailable fixtures or mutations without safe restoration.
The HTTP runs additionally skip four dynamic date-field fixture checks that
require a fresh stdio connection; those checks passed in the stdio run.
