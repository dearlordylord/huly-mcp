# Intabia collaborator discovery validation

Validated 2026-09-13 against the host-provisioned Intabia `0.8.33` / model `0.8.4`, workspace `mcp-compat`, and the existing local Huly control deployment. Credentials stayed in ignored private environment files.

The unchanged MCP failed `list_projects` with a connection error even though native SDK account/model probes worked. Intabia omits `COLLABORATOR_URL` from frontend config and returns `collaboratorEndpoint` from workspace selection.

The adapter now parses workspace-specific discovery first, falling back to Huly's global field when workspace discovery is null or absent. It accepts absolute HTTP(S)/WS(S) endpoints and rejects invalid discovery through a sanitized typed `HulyConnectionError` before opening the workspace client. It does not fall back from an explicitly malformed workspace endpoint.

## Live evidence

| Check | Result |
| --- | --- |
| Intabia MCP: list projects, employees, teamspaces and Default-space card types | Passed |
| Intabia MCP: create HULY project, retrieve it and list its five statuses | Passed; retained as suite fixture |
| Intabia built CLI: `projects list --json` | Passed |
| Intabia MCP: create teamspace, create Markdown document, read, targeted edit, read changed content, delete document/teamspace | Passed |
| Existing Huly MCP: same document lifecycle through global collaborator discovery | Passed |

All live probes used the built artifact and a fresh MCP process per call. Document bodies included a heading, Unicode text and bold markup. The probe waited for the tool response before closing stdin: closing it immediately hit the existing bounded EOF shutdown during an initial Huly edit attempt. The initial attempt's fixtures and both successful lifecycle runs' fixtures were deleted.

These focused checks verify the endpoint adapter and ordinary collaborative content. They do not certify all Intabia modules, UI behavior, notification links or multi-user behavior. Intabia model loading also emits missing-model-document warnings; that remains separate compatibility evidence to investigate.

## Remaining host fixture work

- Log owner, actor and reviewer into the native UI once and verify their Employee records; current `list_employees` shows only the AI bot.
- Override `services.transactor.environment.FRONT_URL` to `http://host.docker.internal:18087` in the isolated Compose configuration and recreate the affected service. The upstream default still points at the existing Huly port 8087. This was not changed from the coding container.
- Verify Mac browser DNS/login. The HULY tracker project has now been seeded through the patched MCP and has Backlog, Todo, In Progress, Done and Canceled statuses. The original Default card space was preserved; no permanent teamspace was added by these probes.
- Run the full suite after fixture and notification routing prerequisites are resolved. No full Intabia integration certification is claimed here.

## Code verification

The focused client and discovery tests passed: 96 tests. Standalone TypeScript and strict Effect diagnostics passed with zero errors or warnings. Both `pnpm check-all` attempts exceeded the 120-second TypeScript/Effect stage budget. Standalone schema-boundary verification, circular dependency detection, complexity and lint (including formatting and duplication) passed. Full coverage passed: 337 test files and 4,861 tests; statements 99.52%, branches 99.01%, functions 99.04%, lines 99.56%. The run took 568.70 seconds with two workers. Build also passed. The combined `check-all` command remains unsuccessful because of its diagnostics timeout; the standalone checks passed without changing its budgets or thresholds.

## Additional single-user read probes

Seven further built-MCP calls were exercised against Intabia. `list_channels`, `list_drives` and `list_calendars` returned populated results. `list_issues` (HULY), `list_milestones` (HULY) and `list_labels` succeeded with empty results; these establish query execution, not populated-record mapping or write compatibility. `list_boards` failed with a wrapped `findAll` connection error. Its cause is not established yet and must be investigated before claiming board support. These probes made no writes.

## Host fixture completion and follow-up probes

The host agent reports successful native first UI login for all three fixture users, confirmed account roles (owner OWNER; actor/reviewer USER), corrected transactor FRONT_URL, and a native assignment notification delivered to actor and Mailpit. Its notification link uses HTTP correctly; its email issue link still uses HTTPS because the branding entry omits protocol. Pinned Intabia source confirms loadBrandingMap defaults protocol to https. The host should set protocol to http in the applicable branding entry and recreate the services that load it. The technical admin remaining USER is not a blocker when the fixture owner is available.

Independent MCP checks now see all three active Employee records. Actor and reviewer each successfully retrieved HULY and listed its issues. The project was public but had only owner membership. add_space_members successfully added actor/reviewer by email, preserving owner membership and ownership; a fresh get_space confirmed all three members. Sidebar rendering has not been rechecked.

The attempted assigned-issue cross-user lifecycle did not complete: create_issue returned a connectivity error, and the subsequent read intended to reconcile possible writes also failed. Direct HTTP verification then returned 502 for Intabia /config.json on port 18087, while existing Huly on 8087 returned 200. Therefore this attempt does not establish a create_issue incompatibility. No write retry was made. Once Intabia recovers, list HULY issues and reconcile any title beginning `Cross-user compatibility ` before retrying or cleaning up; creation outcome is currently unknown.

A separate projection discrepancy remains: list_employees reports role USER for the owner, whereas the host's authoritative account checks report OWNER. Treat this as a role-source discrepancy to investigate, not evidence that ownership changed. Full integration testing is pending deployment recovery. Earlier first-login and HULY membership prerequisites above are now resolved.

## Recovery and successful cross-user issue lifecycle

The host agent traced the transient 502 to nginx retaining old upstream container IPs after recreation; reloading nginx restored routing. The host also reports applying branding protocol http, recreating its five consumers, and verifying both links in a newly generated email. This is a generated-file override that a setup.sh rerun would remove; earlier stored notifications are unchanged.

Independent recovery checks returned HTTP 200 for Intabia config, found no issues in HULY (the interrupted creation left no visible record), and confirmed owner/actor/reviewer project membership with owner retained as sole owner. A subsequent built-MCP lifecycle passed: owner created HULY-1 assigned to actor; actor read it and changed status to In Progress; reviewer and owner read the changed status; owner deleted it successfully. Thus basic cross-user issue creation, assignment, reads and status mutation now have live evidence. This is not a negative authorization test or full permissions certification. The earlier connectivity failure is resolved, and no additional host fixture task is currently needed for broader testing.

## Broad suite and review follow-up

See [broad integration report](intabia-broad-integration.md) for the completed 1,187-pass / 26-fail / 39-skip run and the separate 226-pass targeted rerun. Subagent review found and corrected a discovery-refresh retry regression. The final source passed pnpm check-all (4,862 tests and >99% coverage in all categories), superseding the earlier gate timeout limitation. Its document lifecycle also passed on Intabia and existing Huly. Broader support remains partial because of the recorded compatibility failures and skipped scenarios.
