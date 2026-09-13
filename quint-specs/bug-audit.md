# Quint bug audit

This audit compares the pre-model baseline `f8e00de4` with `cc2c7352`, which added the
HTTP lifecycle model, oracle plumbing, and the accompanying production changes. The
evidence supports three original defects and a later review-hardening pass. It does not
show that Quint's model checker independently discovered a production bug.

The three original lock rows are explicit about their evidence: the blank-token row says
its test was red against the old `Config.redacted` reader
([`quint.lock`#L66-L79](quint.lock#L66-L79)); the unsupported-header row says all three
tests were red against the old trigger
([`quint.lock`#L81-L106](quint.lock#L81-L106)); and the shutdown row says the new test was
red against `Effect.ignore`
([`quint.lock`#L108-L127](quint.lock#L108-L127)). An independent focused rerun restored
those exact prior-code fragments and made five selected checks fail while one unchanged
control passed; the current code passed all six. That is useful regression evidence, but
it is not an exact historical checkout or a daemon-generated counterexample trace.

The original fixes were:

1. In `f8e00de4` (`src/index.ts:67`), a whitespace `MCP_AUTH_TOKEN` was accepted as configured, then trimmed to an empty
   effective token and disabled authentication. The current schema rejects blank values
   at startup ([`src/index.ts`#L67-L74](../src/index.ts#L67-L74)), with the regression at
   [`test/index.test.ts`#L176-L182](../test/index.test.ts#L176-L182).
2. In `f8e00de4` (`src/config/config.ts:149-156`), any `x-huly-*` header, including unrelated proxy metadata, entered strict header mode
   and could turn an otherwise valid env-configured request into a failed bundle. Header
   mode now starts only when a supported config header exists
   ([`src/config/config.ts`#L147-L160](../src/config/config.ts#L147-L160)); the resolver then
   uses the shared env path when no provider is returned
   ([`src/runtime/http-client-leases.ts`#L17-L31](../src/runtime/http-client-leases.ts#L17-L31)).
   Parser, runtime-context, and lease-routing checks are at
   [`test/config/config.test.ts`#L504-L510](../test/config/config.test.ts#L504-L510),
   [`test/config/config.test.ts`#L795-L808](../test/config/config.test.ts#L795-L808), and
   [`test/runtime/http-client-leases.test.ts`#L122-L141](../test/runtime/http-client-leases.test.ts#L122-L141).
3. In `f8e00de4` (`src/mcp/http-transport.ts:218-259`), the HTTP scope finalizer used `Effect.ignore(mounted.close)`, so handler or
   tracked-server shutdown failures disappeared. The current wiring catches that failure
   and emits a static diagnostic, while also handling bind/serve errors
   ([`src/mcp/http-transport.ts`#L306-L334](../src/mcp/http-transport.ts#L306-L334)); the
   transport regression is at
   [`test/mcp/http-transport.test.ts`#L954-L1005](../test/mcp/http-transport.test.ts#L954-L1005).

The same `cc2c7352` diff contains later review hardening. HTTP wiring now retains the
existing admission lifecycle and awaits `quiesce()` before request-client cleanup
([`src/mcp/protocol-handlers.ts`#L255-L262](../src/mcp/protocol-handlers.ts#L255-L262),
[`src/mcp/request-client-lifecycle.ts`#L113-L142](../src/mcp/request-client-lifecycle.ts#L113-L142));
shutdown rejects new calls with 503 and makes timeout/close idempotent
([`src/mcp/http-transport.ts`#L222-L293](../src/mcp/http-transport.ts#L222-L293)). The
finalizer is registered only after `server.serve` succeeds and has explicit bind/serve error paths
([`src/mcp/http-transport.ts`#L322-L334](../src/mcp/http-transport.ts#L322-L334)). These
changes should be credited as review hardening, not as the three lock rows' original
red-against-old discoveries. A strengthened integration check now waits for the 499
response before allowing the blocked body to finish
([`test/mcp/server-http.test.ts`#L76-L137](../test/mcp/server-http.test.ts#L76-L137)); it
passes with the current code and fails when only `src/mcp/server.ts` is restored from
`f8e00de4`, directly substantiating the admission ordering. The earlier test sequencing
could release work at `onclose` and was a synchronization gap, now corrected.

Several behaviors were deliberately retained. Resolver cache semantics still evict only
recoverable unavailability and keep fatal/mixed failures cached
([`src/runtime/huly-clients.ts`#L120-L150](../src/runtime/huly-clients.ts#L120-L150));
there is still no header-bundle pooling, while header-less requests reuse the process
bundle ([`test/runtime/http-client-leases.test.ts`#L65-L120](../test/runtime/http-client-leases.test.ts#L65-L120)).
The unused `prime` API was removed
([`src/runtime/huly-clients.ts`#L25-L28](../src/runtime/huly-clients.ts#L25-L28),
[`src/runtime/huly-clients.ts`#L152-L164](../src/runtime/huly-clients.ts#L152-L164));
this is cleanup, not a newly demonstrated bug. A
cause-bearing cleanup log was also reverted for secret safety: current wiring emits a
fixed message ([`src/mcp/server.ts`#L298-L303](../src/mcp/server.ts#L298-L303)) and tests
assert that causes are not exposed ([`test/mcp/server-http.test.ts`#L268-L312](../test/mcp/server-http.test.ts#L268-L312),
[`test/index.test.ts`#L315-L327](../test/index.test.ts#L315-L327)). The lock's cause-visible
hazard ([`quint.lock`#L129-L148](quint.lock#L129-L148)) is therefore stale.

The in-flight shared-client shutdown hazard was already recorded as `partial`, with the
`runConfiguredServer` ordering explicitly uncovered and no production change made
([`quint.lock`#L171-L202](quint.lock#L171-L202)); it cannot be claimed as discovered only
by later review. Remaining limits are also explicit: after the 5-second grace period, the
handler logs and returns while drain work may still be pending
([`src/mcp/http-transport.ts`#L283-L292](../src/mcp/http-transport.ts#L283-L292)); the
model omits the five-second duration/timing and treats timeout as nondeterministic
([`http-transport-admission.qnt`#L23-L26](http-transport-admission.qnt#L23-L26)).
No fresh daemon-backed E2E run is evidenced here; ordinary tests run without the Quint
daemon ([`README.md`#L22-L26](README.md#L22-L26)). The lock still lists removed `prime`
operations and stale references
([`quint.lock`#L275-L288](quint.lock#L275-L288),
[`quint.lock`#L1107-L1111](quint.lock#L1107-L1111)).

The earlier telemetry attribution and error-tag changes are separate work, not Quint
fixes: they already appear in the pre-integration history (`16def7d`, `58db2e2a`,
`c8c738c2`) and the package [changelog](../CHANGELOG.md#L3-L18).
