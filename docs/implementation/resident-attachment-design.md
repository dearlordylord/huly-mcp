# Resident attachment design

Status: selected design; native TLS primitive implemented, attachment wiring and
qualification pending. Applies to #323–#328.

## Problem

The manual adapter sends a reusable bearer to an explicitly selected loopback
HTTP port. Host/Origin checks and bearer authorization authenticate callers, but
do not authenticate the receiver. A separate challenge followed by ordinary
HTTP also leaves a port-replacement window. The actual request and response
channel must authenticate the expected backend generation before HTTP dispatch.

## Usage

An explicitly started resident backend will publish a protected attachment file
after native application readiness. Each manual adapter deliberately selects
that file. Automatic selection in #324 will use the same attachment boundary.
Ordinary stdio and direct HTTP retain their existing launch paths.

```ts
const attachment = yield* ResidentAttachment.connect(selectedAttachment)
yield* runStdioBridge(attachment)

// Resident bootstrap injects an authenticated listener into the native MCP app.
const listener = yield* ResidentListener.make(resolvedConfiguration)
yield* runNativeMcpServer(listener)

// Managed selection later supplies the same parsed attachment selection.
const selection = yield* selectOrStartCompatibleResident(resolvedConfiguration)
const managedAttachment = yield* ResidentAttachment.connect(selection)
```

These names describe the target interface. They are not implemented commands.
The current endpoint/token manual form remains an unfinished experimental path
until replacement with the authenticated attachment boundary is complete.

## Shape

Use generation-scoped TLS 1.3 external PSK around the existing native MCP HTTP
application. The existing injectable Node listener factory supplies an HTTPS
listener; the MCP protocol layers, policy and request-fiber context remain native.
This is an authenticated-listener extension, not evidence that the current plain
HTTP listener already authenticates generations. Each generation owns fresh
independent channel and bearer secrets, separate from Huly credentials.

The attachment file schema owns its version, transport identifier, generation,
literal-loopback HTTPS endpoint, redacted channel/bearer secrets and compatibility
descriptor. Its protection must establish current-user ownership and regular-file
permissions through opened handles, safe ancestors and atomic publication.
POSIX mode bits do not prove Windows ACL isolation. Generation-specific immutable
files avoid an old owner unlinking a replacement's file; shared locator publication
still needs the real ownership coordinator required by #324.

One attachment module owns parsed selection, immutable compatibility, private
attachment capability and scoped exchanges. A TLS channel module owns Node
socket details. A listener module owns generation secrets, native factory and
admission/publication. These are internal interfaces, not a public wire SDK.
Boundary payload types derive from Effect Schema. The stdio bridge retains
request-ID, cancellation, response ownership and bounded-output behavior.

Each exchange initially owns its own HTTPS agent, pending sockets and request
scope. The asynchronous `createConnection` implementation returns no socket
until TLS authentication passes; HTTP headers/body remain queued. Scope closure
marks the exchange closed, completes a pending callback once, destroys pending
and handed-off sockets, and waits for close. A late `secureConnect` cannot hand
a socket to HTTP after cancellation. No transport retries or redirects are used.

Require TLS 1.3, the qualified cipher, an empty peer certificate, and explicit
per-connection external-PSK callback approval. Certificate fallback is forbidden,
including a certificate otherwise trusted by the OS. Keep certificate validation
enabled; never use a blanket permissive hostname verifier. Client session input
and caching are absent. Server ticket controls and per-socket PSK approval must
prevent a cached ticket bypassing expected-generation admission.

**Do not reject on `isSessionReused()` alone.** Fresh external TLS 1.3 PSK
connections report true in OpenSSL. The first strict probe exposed this incorrect
assumption in both candidate designs. External callback provenance and cache/ticket
controls need their own tests. This behavior is documented by
[OpenSSL](https://docs.openssl.org/3.0/man3/SSL_CTX_set_psk_client_callback/).
Node's relevant transport surface is documented in its
[TLS PSK reference](https://nodejs.org/download/release/v24.20.0/docs/api/tls.html#pre-shared-keys).

The private adapter attachment remains distinct from modern MCP metadata and
native legacy UUID sessions. One backend owner tracks attachment eligibility,
owned requests and native session IDs. Release closes new admission, interrupts
only owned requests, waits for their resource cleanup, then releases their native
sessions. #326 adds crash-expiring renewal and idle/drain ordering. A heartbeat
expiring does not prove active work stopped. Modern traffic gains no invented
MCP session. Legacy release needs a minimal pinned native runtime hook and real
inventory checks; clearing an adapter-local UUID is insufficient.

## Synthesis decision

Two independent candidates both selected TLS PSK over pinned certificates or
authenticated HTTP framing. Candidate A is the base because it specifies the
asynchronous socket handoff, immediate pending-socket ownership, cancellation
fence and once-only callback. The independent judge scored A 13/15 and B 11/15
against generation authentication, native semantics, shared ownership boundary,
falsifiable primitives and caller simplicity. Parent comparison agrees with
that conditional selection. Both initially made the incorrect resumption-flag
assumption described above; the primitive experiment corrected it before source
integration.

Retain B's compact three-owner structure, distinction between implementation
compatibility and private effective configuration, and rejection of a native
legacy session used through another attachment. Retain A's separate request
accounting and attachment liveness, and cleanup barrier before session removal.
The environment offers GPT models only; independent candidates and judge used
the available inherited model, rather than the skill's unavailable Claude/Grok
defaults. This limits model diversity, not the behavioral acceptance criteria.

Candidate and grounding artifacts are retained at
`/tmp/resident-attachment-grounding.md`,
`/tmp/resident-attachment-candidate-a.md`,
`/tmp/resident-attachment-candidate-b.md` and
`/tmp/resident-attachment-judgment.md`.

## Tradeoffs and alternatives

- Accept one TLS handshake per request initially for simpler generation and
  cancellation ownership. Final performance measurements include this cost.
- Accept runtime/platform qualification in exchange for no production crypto
  dependency or custom authenticated stream format. Unsupported paths fail
  closed while qualification remains incomplete.
- Pinned ephemeral certificates provide a viable alternative, but need a
  reviewed certificate-generation dependency; a runtime OpenSSL shell command
  is not a portable package contract.
- Authenticated encrypted HTTP framing would require owned replay windows,
  incremental authentication and stream framing already supplied by TLS.
  A preflight challenge followed by plain bearer HTTP is insufficient.

## Experiment evidence and remaining gates

On Linux Node v24.20.0/OpenSSL 3.5.7, the first probe admitted matching key and
generation, and dispatched no HTTP request for wrong key/generation
(`/tmp/resident-tls-psk-probe.log`). The stricter probe initially timed out during
pending-handshake cancellation (`/tmp/resident-tls-channel-probe.log`). Closing
the per-request agent's pending sockets and completing the connection callback
resolved that ownership gap.

The next strict run refused the genuine backend because external PSK reported
`isSessionReused: true`; metadata in `/tmp/resident-tls-channel-diagnosis.log`
established the cause. With explicit client external-PSK provenance,
`/tmp/resident-tls-channel-external-psk-witness.log` records genuine dispatch,
zero dispatch to a trusted certificate-only replacement or wrong key/generation,
and pre-handoff cancellation with no leaked application bytes or pending sockets.
These scripts report observations; they are not the native MCP qualification.

Packaged native factory qualification, server-side ticket-bypass refusal, post-verification
cancellation, protected state, attachment/session release, Quint alignment, live
Huly, supported Node versions and native macOS/Windows behavior remain pending.
No issue is complete on the strength of these probes or design reviews.

The source primitive now exists in `src/resident/tls-channel.ts`. It uses a
versioned product/generation PSK identity, schema-owned key/endpoint inputs,
asynchronous pre-HTTP socket handoff, scoped close waiting and a native HTTPS
factory with generation-key callback admission. `HttpServerFactory` can report
its protocol without changing ordinary HTTP or Unix-socket address reporting.
The primitive is not connected to the production manual launcher yet.

`/tmp/resident-tls-coherent-tests.log` passes 59 affected tests in eight files.
The new test calls actual `McpServerService` through the injected native HTTPS
listener, checks valid context output, rejects wrong key/generation, reuses the
valid identity afterward, and interrupts a deliberately stalled handshake.
`/tmp/resident-tls-same-port-replacement.log` additionally confirms that a
plaintext replacement on the exact retired native listener port receives no
bearer, channel key or operation bytes and supplies no accepted reply.
`/tmp/resident-tls-coherent-typecheck.log` checks 1,204 files with zero errors or
warnings; focused lint and complexity also pass.
The final same-port and interruptible-cleanup increment passes the two native
TLS checks in `/tmp/resident-tls-finalizer-bound-tests.log`; final diagnostics
remain clean in `/tmp/resident-tls-checkpoint-typecheck.log`.

Retained failed attempts include `/tmp/resident-tls-native-first-attempt.log`
(test called readiness before the server fiber had claimed its run control),
`/tmp/resident-tls-native-second-attempt.log` (test omitted the existing nested
`structuredContent.result` envelope), and
`/tmp/resident-tls-native-third-attempt.log` (URL normalization lost the Unix
socket path in readiness reporting). The fourth attempt passes the native TLS
and existing transport suites. No assertion or deadline was weakened.

Scoped independent Standards and Spec reviews reported no new actionable
findings. They retained certificate fallback, real ticket-bypass attempts,
post-verification cancellation, streamed response cancellation, protected files,
launcher integration and session release as remaining gates. The earlier
certificate-only probe is not a substitute for testing production primitive
behavior against an otherwise trusted replacement.

## Next implementation step

Implement protected explicit attachment selection and backend publication using
this primitive, then connect the packaged manual adapter to that boundary.

## Listener retirement correction

An unauthenticated peer withholding TLS prevented native listener retirement
from completing within five seconds. `/tmp/resident-tls-listener-retire-red.log`
reproduces it. The resident listener now owns accepted TCP sockets until
authentication hands their live peer connection to native HTTP. Retirement
destroys the remaining unauthenticated sockets and refuses late raw accepts.
Authenticated HTTP responses keep native drain behavior.

`/tmp/resident-tls-listener-final-tests.log` passes 16 focused transport checks,
including stalled-handshake retirement and a held authenticated response that
finishes after the port refuses new connections. Removing the authentication
handoff makes the latter test fail
(`/tmp/resident-tls-authenticated-drain-mutant.log`); the mutation was restored
before the passing run. TypeScript/Effect diagnostics check 1,204 files with zero
errors or warnings in `/tmp/resident-tls-listener-drain-typecheck.log`.
Scoped Standards and Spec reviews report no new actionable findings.

## Protected descriptor implementation limit

The POSIX descriptor codec and scoped publisher now exist in
`src/resident/attachment-file.ts`. Exclusive publication never overwrites an
existing generation. Reading checks the opened file, and cleanup detects a
replacement installed before its inode check. The check and unlink are not an
atomic conditional removal. Before production wiring, the ownership protocol
must enforce one writer for each immutable generation. No concurrent replacement
of that generation's path is supported. A non-cooperating same-user writer can
race the check, so the current helper does not prove unconditional replacement
preservation. Managed locator replacement requires its own ownership protocol.

## Authenticated adapter wiring

The selected attachment path now connects the production `stdio-http` adapter
to the production `resident-http` backend. `attachment-exchange.ts` owns one
native Node HTTP exchange inside the authenticated TLS agent's scope. The old
plain endpoint/token adapter path has been removed. Readback and publication
still enforce exact package compatibility through a derived descriptor schema.
The [manual launch guide](../resident-manual.md) documents explicit selection.
This connection does not yet implement per-adapter admission or native session
release, managed coordination, or full resident qualification.
