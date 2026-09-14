# Validating TraceX and Intabia support

Research date: 2026-09-13. Huly MCP checkout: `3fe93934`.

## Recommendation

Validate compatibility in layers, with evidence tied to an exact product release, deployment, authentication mode, and enabled module set. Shared ancestry or matching package versions is insufficient. The target is **our MCP/CLI using the vendor's platform APIs**; connecting to TraceX's own MCP server would test a different product.

For a reproducible environment, start with Intabia's maintained self-host stack and reproduce its collaborator endpoint discovery failure before adapting the connection path. TraceX is the stronger candidate for an unchanged-artifact connection smoke test when an evaluation workspace is available; its release-pinned self-host fixture needs more assembly. Use isolated self-hosted fixtures for the full mutation suite, followed by a smaller cloud-specific certification when a disposable workspace is available.

Supporting investigations:

- [TraceX source compatibility](tracex-source-compatibility.md)
- [Intabia source compatibility](intabia-source-compatibility.md)
- [Self-hosted and cloud environments](fork-test-environments.md)

## What source inspection already established

The ignored reference checkouts are `.reference/tracex` at `a5dcad32bf888b85b3261151114850669c7a23ed` and `.reference/intabia-platform` at `be9f942e4ea285e38a4faad49a02211d95b76bdb`. Their exact sources and comparison methods are linked in the assessments above.

- **TraceX:** config/token bootstrap and collaborator client match our installed sources closely; storage runtime is equivalent in the compared file. Its package versions still match our pins despite changed source. Differences requiring tests include two-factor password login, workspace-scoped API keys, typed/versioned cards, additional tracker fields, and native rich-text nodes/marks unsupported by our renderer. A workspace API key is a candidate first authentication route, not yet certified.
- **Intabia:** common REST routes, identities, tracker interfaces and storage remain close. However, workspace selection now supplies `collaboratorEndpoint`, while our eager collaborator construction reads `config.COLLABORATOR_URL`. Default current-source configuration therefore appears to fail connection initialization even for read tools. This is a source-derived prediction, subject to actual deployed config. Policy/quota 403 handling also differs between its SDK and ours.

These findings supersede broad assumptions in the older local `.reference/huly-forks-and-distributions.md` note that shared platform ancestry alone implies a superset with no meaningful adapter differences. They do not establish that every release has the current-source differences.

## Environment choice

| Target | Practical starting point | What is still unproven |
| --- | --- | --- |
| Intabia | Official self-host repo with account/workspace bootstrap and Mailpit; pin candidate images to `v0.8.33`, matching observed cloud version. Core images exist for amd64/arm64. Free cloud plan documentation includes API access. | Stack boot, current deployment-script compatibility with that release, full account fixtures and our adapter. Observed cloud config also omits `COLLABORATOR_URL`, strengthening the source-derived connection concern. |
| TraceX | Published amd64/arm64 core images at `v0.7.426`, matching observed cloud version; adapt that release's development service configuration into a pinned fixture. Alternatively use a dedicated writable cloud evaluation workspace. | A ready-to-run release fixture, complete bootstrap and cloud account/API entitlement. No general free writable cloud sandbox was confirmed. |

See the [environment research](fork-test-environments.md) for registry evidence, exact setup candidate commands and deployment caveats. Source HEAD is newer than these cloud baselines; repeat relevant source comparisons at the actual release before interpreting live failures. Neither source clone nor image publication proves that the stack boots.

## Layers and acceptance evidence

| Layer | What to check | Evidence required to pass |
| --- | --- | --- |
| 0. Target provenance | Product source SHA/tag, image digest and CPU architecture, reported deployment version, our artifact hash and SDK lockfile, authentication mode, workspace role, enabled modules | Reproducible manifest; explicitly distinguish source HEAD from released and deployed code |
| 1. Static contract comparison | Config discovery, account/token exchange, REST routes and envelopes, transaction semantics, storage and collaborator protocols; class/mixin IDs, field names/types, enums, relations and model registrations actually used by our code | A consumed-contract ledger with exact source/declaration references, differences and executable probes; no conclusion based solely on package names or version strings |
| 2. Read-only connection and model probe | Config endpoints, account/workspace selection, account identities, full model loading, one real backend read, model discovery and feature availability | Successful calls through the unchanged published artifact where possible; record unsupported modules separately from authentication, permission, and transport failures |
| 3. Core behavioral scenarios | Create/read/update/delete, explicit clearing, idempotent retries, references, ordering, pagination, search, attachments and collaborative content | Logical results match a Huly baseline after normalizing generated IDs/times; bounded fresh-session reads confirm persistence; cleanup succeeds |
| 4. Independent product checks | Vendor SDK or UI reads our writes, our MCP reads UI/vendor-created records, correct UI visibility, server triggers, backlinks, workflow transitions, file bytes and content | Independent observation confirms semantics, rather than the same mapper making an identical mistake on write and read |
| 5. Permissions and lifecycle | Owner/member/restricted access, private spaces, cross-workspace isolation, invalid/expired tokens, reconnect/restart, cancellation and cleanup | Forbidden operations remain forbidden, allowed operations retain correct attribution, no cross-request credential/workspace leakage |
| 6. Product/module coverage | Core shared modules plus enabled optional modules; explicit treatment of TraceX-specific compliance features and Intabia-specific functionality | Capability matrix shows passed, failed, unsupported, disabled, and untested; skipped tests never silently count as supported |
| 7. Release and deployment matrix | Our stdio MCP, HTTP environment credentials, HTTP request credentials, proxy/native exposure, packed CLI; self-hosted release and cloud deployment | Existing gates plus target-specific integration evidence; rerun affected scenarios after either side upgrades |

Not every dimension needs the full Cartesian product. Run core platform semantics once per backend/version first. Then test the transport and credential boundaries that can change those semantics. Cloud testing adds real reverse proxies, TLS, endpoint discovery, plan restrictions and rate limits that local Compose cannot certify.

## Existing harness: useful, but not yet a fork certifier

The existing [full integration suite](../../scripts/integration_test_full.sh) already accepts a target URL/workspace and password or token authentication. It runs our built artifact, supports stdio and HTTP (`INTEGRATION_TRANSPORT`), environment or request-header HTTP credentials (`INTEGRATION_HTTP_CONFIG`), and a [packed CLI mirror](../../scripts/integration_test_cli_full.sh). Its fresh-session retry and cleanup machinery is useful for Huly's eventual consistency.

Concrete constraints found in the current code:

- `get_huly_context` [explicitly does not connect](../../src/mcp/huly-context-tool.ts). Neither it nor successful `tools/list` is a backend compatibility test. Use a real `list_projects`/model read as the first connection proof.
- The full suite hardcodes the existing `HULY` project and `Default` card space. Many scenarios assume fixture state; it is not a clean-workspace bootstrap or a read-only probe runner.
- [Integration setup](../../INTEGRATION_TESTING.md) documents incomplete account bootstrap: owner plus two additional accepted members are needed for some scenarios, invitation delivery needs a mail sink, and kick restoration is not available with ordinary owner credentials.
- [Fixture helpers](../../scripts/integration-huly-client.ts) use the same pinned upstream SDK as the product. A failing fixture bootstrap can be an SDK-compatibility failure, not a failed operation; conversely, that shared SDK cannot serve as the only independent oracle.
- The [SDK parity audit](../../scripts/audit-sdk-parity.mjs) inventories installed SDK model exports and an optional hardcoded `.reference/platform/models` tree. It is a coverage/classification ledger, not a vendor wire/model compatibility test. This checkout lacks `.reference/platform`, so that optional part reports partial coverage. The new vendor clones do not automatically make the audit fork-aware.
- The suite includes administration, identity, role, sequence, and destructive lifecycle operations. Run it against owned disposable fixtures. Do not point the full script at an existing business workspace as a first cloud smoke test.

## Minimal harness additions to make next

These are proposed work, not implemented by this research:

1. **Target manifest and preflight.** Parse a target profile with source/image/deployment provenance, nonsecret origin, auth-mode labels, module expectations and fixture identifiers. Keep credentials in the existing redacted config boundary. Verify service reachability and a real backend read before any fixture writes.
2. **Consumed-contract inventory.** Start from [HulySdkDependencies](../../src/huly/sdk-deps.ts), client/account/storage adapters, query classes and projection fields. Parameterize the source root instead of repointing existing reference directories. Compare runtime class IDs and registered attributes, not only TypeScript declarations. Use Effect Schema for the eventual manifest and report I/O.
3. **Read-only capability report.** Use existing `list_huly_classes`, `get_huly_class`, `list_huly_attributes`, `list_huly_enums`, `list_huly_plugin_configurations`, and `describe_huly_space_type_capabilities`. Capture the actual deployed model; public source is only a hypothesis about it.
4. **Portable fixture bootstrap and scenario selection.** Resolve or create named disposable project/spaces/types; supply account fixtures explicitly; select scenarios by supported modules and prerequisites. Preserve failures for required modules; record justified skips with owning reasons. Build a small core smoke suite before adapting the monolithic full suite.
5. **Independent readback.** Use a vendor-compatible SDK or UI to verify representative records, collaborative content, event-triggered side effects and permissions. TraceX's own MCP can corroborate its overlapping card/search tools, but cannot certify our broader catalog.
6. **Certification report.** Record per-scenario outcomes, cleanup residuals, sanitized diagnostics, artifact hash and target matrix. Promote README claims only for the tested scope/version. Add a scheduled or release-triggered rerun later; do not claim a broad moving-version guarantee.

## Suggested initial scenario set

- Account/workspace selection, active employee/social identity, project and class discovery.
- Issue create/update/clear/relation/comment with a UI-visible parent, workflow and assignee.
- Document Markdown/HTML round-trip with a native reference, attachment upload/download byte hash, collaborator persistence and browser-openable links.
- Cards: discover space/type capabilities; read a UI-created card; create/update a disposable card; verify versioning and read-only historical revisions where enabled.
- One member-versus-owner/private-space test and one two-workspace credential-isolation test.
- Search visibility and idempotent retries through bounded fresh sessions.
- Dispose the fixtures and independently confirm no leftover records or changed pre-existing settings.

After that passes, expand to the existing catalog matrix. Shared-core support does not imply support for every TraceX compliance module, electronic-signature workflow, or Intabia extension.

## Local execution boundary

No vendor account was created, no stack was launched, and no vendor fixture writes were performed during this research. The current container has no `docker` executable. Its shared `node_modules` contains macOS-native binaries; use a separate Linux dependency installation or a suitable host runner for future verification, not a reinstall in the shared checkout.

The preceding README-only task attempted `pnpm check-all` in an isolated Linux checkout: preceding stages passed, but tests/coverage exceeded the 300-second gate. This is not vendor integration evidence or a fresh full-green baseline. A real certification run must first establish a healthy Huly control run and then run equivalent target scenarios.
