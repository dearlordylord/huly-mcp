## Summary

Return the MCP tool catalog without importing handlers or waiting for Huly. Load handler groups on demand, warm the stdio full model in the background, and list projects through the authenticated REST client.

```text
discovery → generated catalog
          → background model initialization
call      → lazy handler group → lightweight projects / shared full model
shutdown  → interrupt wait → close ready or late client once
```

Keep stdio as the default and HTTP credentials isolated. CLI and request-owned HTTP clients load the model only when needed. Add explicit `MCP_PRELOAD_TOOLS=true` import qualification and reject stale generated metadata during builds.

## Evidence

`pnpm check-all`: 5,498 passing tests; all four coverage metrics meet the unchanged 99% threshold. Separate Standards and Spec reviews have no remaining findings.

Fresh local-Huly stdio processes in Codex-style proxy mode: median catalog 740 → 551 ms; first project read after discovery 1,321 → 79 ms. All 36 paired stdio samples preserve exact catalogs/project results/authoritative metadata and eight resources; nine read-only HTTP contexts also succeed. Native client-wide schema compilation is reported separately.

See `docs/verification/startup-production-321/REPORT.md` for raw measurements, lifecycle coverage, package evidence, and validation limits.

## Merge Danger

Changes affect shared Huly initialization and tool dispatch across MCP and CLI. No data migration is involved. Full-model behavior is retained for every operation except the qualified project-summary read. Mutation integration and actual Codex invocation remain pending under the operator's current restriction; this candidate is not certified for release.

Refs #321.
