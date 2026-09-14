# Effect 4 MCP transport unblock status

Checked 2026-09-13.

**The missing protocol support has merged upstream, but is not yet in the latest published Effect RC.** Replacing our MCP SDK transport with Effect AI can be revisited against upstream source; a normal dependency upgrade is still waiting for a release containing that change.

## The relevant migration

The Effect runtime migration is already complete: [package.json](../../package.json) pins `effect@4.0.0-rc.108`, and the [final parity report](../migrations/effect-4/final-parity-report.md) records its certification. The separate Effect AI MCP transport replacement was implemented in `60b33ce8` and reverted in `a955dce5` on 2026-08-18 to restore MCP 2026 behavior. The reverted ADR can be read with `git show a955dce5^:docs/adr/0004-effect-ai-mcp-transport.md`.

The relevant blocker was Effect AI's missing `2026-07-28` protocol support, including `server/discover`, stateless HTTP, and request-scoped metadata. It was not general compatibility between Effect 4 and the official MCP TypeScript SDK. The checkout continues using MCP SDK v2 through [create-mcp-server.ts](../../src/mcp/create-mcp-server.ts).

## Upstream has implemented it

Effect PR [#7265, “feat: add v2026-07-28 protocol adapter”](https://github.com/Effect-TS/effect/pull/7265) merged on **2026-09-11 at 23:23:35 UTC**, commit `a2c4154cf8bcbe455bd43bf7f3f12d9cbf38247c`, closing [#7024](https://github.com/Effect-TS/effect/issues/7024). Fresh [GitHub API metadata](https://api.github.com/repos/Effect-TS/effect/pulls/7265) confirms the merge; search-indexed GitHub HTML still showed the earlier open state during this check.

The change adds `McpProtocol.v2026_07_28`, stateless discovery, per-request client context, modern HTTP routing, multi-round-trip results, and subscriptions. The [merged adapter source](https://github.com/Effect-TS/effect/blob/a2c4154cf8bcbe455bd43bf7f3f12d9cbf38247c/packages/effect/src/unstable/ai/internal/mcpProtocol/v2026_07_28.ts) contains the `server/discover` handler and `Stateless` runtime descriptor. This addresses the protocol-level reason for our revert; it does not by itself certify our integration's behavior.

## Published packages still lag

Fresh [npm registry metadata](https://registry.npmjs.org/effect) reports `rc: 4.0.0-rc.115` and `latest: 3.22.2`. RC 115 was published **2026-09-11 at 17:20:13 UTC**, approximately six hours before the merge.

I downloaded and inspected the [published rc.115 tarball](https://registry.npmjs.org/effect/-/effect-4.0.0-rc.115.tgz) without installing dependencies. Its `src/unstable/ai/McpProtocol.ts` exports only `v2025_11_25`, `v2025_06_18`, `v2025_03_26`, and `v2024_11_05`; the archive contains no `2026_07_28` paths. **Bumping our rc.108 pin to rc.115 would not remove this blocker.**

Next step: use a subsequent coherent Effect cohort containing PR #7265, then restore/adapt the transport replacement and run the existing protocol, scope/authentication, and local-Huly parity gates. A source-pinned spike is possible now; released-package adoption still awaits publication.

## Verification scope

This was a source, package, and history check. `pnpm verify:effect-cohort` passed. `pnpm check-all` was attempted but stopped at startup because shared `node_modules` contains macOS ARM64 esbuild while this container needs Linux ARM64. Dependencies were not reinstalled and no transport code changed. Existing certification results were not freshly rerun.
