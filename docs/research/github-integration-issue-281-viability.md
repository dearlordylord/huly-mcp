# GitHub integration support (#281) viability

Date: 2026-09-21

Issue: [#281](https://github.com/dearlordylord/huly-mcp/issues/281)

MCP revision inspected: [`4b24672fbc71603a65cbf0f677c38d864f3a07b5`](https://github.com/dearlordylord/huly-mcp/tree/4b24672fbc71603a65cbf0f677c38d864f3a07b5)

Pinned Huly source inspected: [`hcengineering/platform@2a985b31e314c0793dd965e5a1d8abe28f262f34`](https://github.com/hcengineering/platform/tree/2a985b31e314c0793dd965e5a1d8abe28f262f34)

Official examples revision inspected: [`hcengineering/huly-examples@29b9f7f060d6308842d2897996776ef42374b5c6`](https://github.com/hcengineering/huly-examples/tree/29b9f7f060d6308842d2897996776ef42374b5c6)

## Decision

Issue #281 is **highly viable with moderate implementation risk** for its natural reading:

1. create a Huly issue, then separately request publication to a selected mapped GitHub repository; and
2. request publication of an existing Huly issue as a new GitHub issue.

Huly already implements both workflows by adding the `github:mixin:GithubIssue` mixin with a repository reference, an empty URL, and GitHub number `0`. Huly's server trigger and GitHub worker own the asynchronous external creation. The MCP should reproduce that native transaction shape and let Huly perform synchronization; it should not call GitHub directly or accept GitHub credentials.

The principal risk is contract stability. `@hcengineering/github` is intentionally not published, so the MCP cannot consume its types as an npm dependency. A safe implementation needs a small local compatibility module with schema-owned boundary records and well-known model refs, runtime capability checks, typed failures, and a real integration test against the target Huly deployment.

This decision does **not** establish a supported workflow for attaching an arbitrary already-existing GitHub issue by URL or number to a chosen Huly issue. The issue text says “add existing issues to GH,” which most naturally means publish existing Huly issues. The inspected UI sources prove that workflow. They do not prove arbitrary pairwise linking to an existing GitHub issue; configured repository synchronization imports GitHub issues through a different worker flow.

## Primary-source findings

### Both requested Huly-to-GitHub workflows are native

During issue creation, the official GitHub `DocCreateExtension` supplies a repository selector and then runs a post-create function. For a GitHub-enabled project, that function creates the `GithubIssue` mixin with `{ githubNumber: 0, repository, url: "" }` ([extension registration](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/model-github/src/index.ts#L622-L636), [post-create function](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/github-resources/src/index.ts#L41-L57), [repository selector](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/github-resources/src/components/GithubIssueInfoHeader.svelte#L31-L132)).

For an existing Huly issue, the official issue header uses the same operation. `assignRepository` updates the repository on an existing `GithubIssue` mixin or creates the mixin with `{ repository, url: "", githubNumber: 0 }` ([official issue header](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/github-resources/src/components/GithubIssueHeader.svelte#L20-L36)). This exactly supports publishing an existing Huly issue without a direct GitHub API call from the MCP.

The official API client exposes `createMixin` and `updateMixin` as normal client operations ([API-client mixin documentation](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/foundations/core/packages/api-client/README.md#L370-L409)). This repository already wraps both methods in `HulyClientOperations` ([local client port](../../src/huly/client.ts#L343-L363)), so no transport expansion is required.

### The mixin is the synchronization request, not presentation-only metadata

The GitHub server trigger watches both `GithubIssue` mixin transactions and issue changes in GitHub-enabled projects. It creates or updates a same-ID `DocSyncInfo` record with an empty `needSync` marker; new records begin with no repository, an empty URL, GitHub number `0`, and an external-version sentinel ([trigger dispatch](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/server-github-resources/src/index.ts#L45-L82), [sync-info update](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/server-github-resources/src/index.ts#L168-L219), [sync-info creation](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/server-github-resources/src/index.ts#L251-L298)). The MCP must not create or edit `DocSyncInfo` itself; it is worker-owned state.

When `DocSyncInfo.repository` is initially null, the worker reads the repository from the issue's `GithubIssue` mixin. If no external issue exists yet, it calls its `createGithubIssue` implementation, then stores the returned URL, number, and external state ([worker creation path](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/pod-github/src/sync/issues.ts#L310-L449)). `createGithubIssue` sends the repository node ID, title, converted description, and any mapped assignee through GitHub's GraphQL `createIssue` mutation ([worker mutation](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/pod-github/src/sync/issues.ts#L745-L794)).

Synchronization is asynchronous. A successful MCP mixin write means “publication requested,” not “GitHub issue created.” The MCP must not fabricate a URL or report synchronous external success.

### Repository and project constraints are discoverable in Huly

The native model defines:

- `GithubIssue`: GitHub URL, number, and repository;
- `GithubProject`: integration and mapped repository refs; and
- `GithubIntegrationRepository`: name, mapping to a GitHub project, enabled state, node ID, HTML URL, and repository metadata.

These contracts are in the official GitHub plugin source ([issue model](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/github/src/index.ts#L87-L99), [repository model](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/github/src/index.ts#L329-L370), [project model](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/github/src/index.ts#L462-L470)). The official UI offers repositories whose `githubProject` equals the target project ([repository editor](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/github-resources/src/components/RepositoryPresenterRefEditor.svelte#L35-L76)).

The MCP should additionally reject disabled repositories. The GitHub worker skips work for a resolved repository when `enabled` is false ([worker guard](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/pod-github/src/worker.ts#L1442-L1460)); accepting one would create a request that may remain pending indefinitely.

The deployment itself must run a configured GitHub integration. Huly's official self-host chart describes bidirectional issue, pull-request, and comment synchronization, requires a GitHub App, and disables the GitHub service by default ([official self-host configuration](https://github.com/hcengineering/huly-selfhost/blob/main/helm/huly/README.md#github-integration)). The worker also disables GitHub mutations when `GITHUB_READONLY=true` ([worker write guard](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/pod-github/src/sync/utils.ts#L29-L38)). Model presence alone therefore cannot prove that a requested external write will complete.

### The GitHub model is not a published SDK dependency

The upstream monorepo marks `@hcengineering/github`, its resources, its model, and the GitHub service packages with `shouldPublish: false` ([upstream package policy](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/rush.json#L2140-L2172)). It is absent from this project's dependencies and the public npm registry returned `404` during this investigation.

The model identifiers are deterministic (`github:mixin:GithubIssue`, `github:mixin:GithubProject`, and `github:class:GithubIntegrationRepository`) through the official plugin definition ([plugin refs](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/github/github/src/index.ts#L508-L539)). This repository already uses local compatibility descriptors for other unpublished Huly packages, such as recruiting ([local recruiting descriptor](../../src/huly/recruit-plugin.ts#L1-L33)). A GitHub descriptor is therefore feasible, but it must remain deliberately small and version-checked rather than copying the upstream package wholesale.

## Current MCP gap

The current `CreateIssueParamsSchema` has project, title, description, priority, assignee, status, task type, parent, due date, and estimation, but no GitHub repository selection ([issue input schema](../../src/domain/schemas/issues.ts#L300-L338)). `createIssueWithAssignee` ends after adding the Huly issue collection and never creates a GitHub mixin ([issue write operation](../../src/huly/operations/issues-write.ts#L149-L245)). `update_issue` likewise exposes no synchronization operation.

The gap is already acknowledged in SDK discovery: “GitHub sync metadata ... remain deferred” ([discovery rationale](../../src/huly/operations/sdk-discovery-tool-hints.ts#L117-L121)). No current issue output exposes a publication request, pending state, synchronized GitHub URL, or worker error. The official `huly-examples` issue-create example also covers only core Tracker issue creation and does not provide a GitHub integration example ([official issue-create example](https://github.com/hcengineering/huly-examples/blob/29b9f7f060d6308842d2897996776ef42374b5c6/platform-api/examples/issue-create.ts#L29-L118)); the authoritative behavior for this feature is the platform's GitHub plugin and worker.

## Settled contract

Design agreed for #281; implementation and end-to-end verification remain pending. See the [architectural decision](../adr/0001-huly-owned-external-publication.md) for the ownership rationale.

```text
list_external_tracker_targets({ project, provider? })
publish_issue_to_external_tracker({ project, identifier, provider: "github", target? })
get_issue_publication_status({ project, identifier })
```

`provider` discriminates the external integration; `tracker` remains Huly's internal issue plugin. GitHub is the only initial provider. Its native issue mixin has one repository reference, so this feature follows that model; future providers and multi-provider behavior are postponed.

Discovery returns project-mapped targets with provider, kind (`repository` for GitHub), stable Huly ID, name, enabled state, and an unavailable reason when applicable. Omitting `provider` lists every supported provider. Publication resolves `target` by stable ID or exact name within the project. If omitted, select the sole enabled target for the requested provider; missing, ambiguous, cross-project, or disabled targets produce actionable typed errors.

Publication requests a new external issue through Huly's native mixin transaction. Repeating a request for the same pending or published target returns its state without another write; a failed request to the same target requeues publication. A different target is rejected. Cancellation, detachment, retargeting, and linking arbitrary existing external issues are out of scope.

Publication and status lookup return the same state shape, derived from Huly through its client:

- `not_requested`: no publication mixin exists.
- `pending`: the mixin exists without a completed external URL/number; an accepted write does not establish external success.
- `published`: the mixin records the external URL and positive issue number.
- `failed`: Huly's worker-owned sync record shows an unsuccessful completed publication attempt, or a request has exceeded the bounded publication wait without evidence of completion.

Every publication response includes the Huly project and human issue identifier needed to call `get_issue_publication_status`; callers do not need to retain or discover an internal document ID. Include provider and target details when a publication exists, URL/number when published, and a bounded, redacted failure summary when failed. Pending responses include elapsed time so an agent can judge progress. A request must not remain `pending` forever when the GitHub worker is unavailable: after a fixed, documented wait limit, project the stale request as `failed` with a timeout summary. A later worker completion still takes precedence and becomes `published`.

A requeued attempt remains `pending` with `retrying: true` and best-effort `previousFailure`. ISO 8601 `stateChangedAt` reports Huly's native publication-state modification time, not a guaranteed request timestamp or durable failure history; elapsed time is computed from that persisted timestamp using the injected clock. Later synchronization failures do not undo an already-established publication.

Keep `create_issue`, `get_issue`, `list_issues`, `update_issue`, and `delete_issue` schemas unchanged. Creation followed by publication takes two calls. Generic mutations retain Huly's native synchronization effects, including downstream deletion; this feature adds no provider-specific deletion guard.

The implementation needs a small compatibility module with schema-owned boundary records and required native refs, including the worker-owned `DocSyncInfo` read model. Check model capabilities before writing and report observable configuration or worker failures distinctly. Installation, credentials, and synchronization belong to Huly; never call GitHub directly or write `DocSyncInfo`. Model presence alone cannot establish worker readiness or writable service configuration.

## Verification requirements

Implementation should include dependency-injected tests, with no module mocks, for:

- project capability and repository resolution by ID/exact name;
- cross-project, ambiguous, disabled, and missing repository failures;
- exact `createMixin` payload (`repository`, empty `url`, GitHub number `0`);
- idempotent pending/published behavior and failed-request retry;
- pending elapsed-time reporting and bounded stale-request failure using a deterministic injected clock;
- conflicting-repository rejection;
- automatic selection of the sole enabled target; and
- status projection, retry evidence, and bounded redaction without leaking raw worker state.

Per the project harness, run `pnpm check-all`. A real local-Huly integration test is required and must cover discovery, publication after a separate `create_issue` call, publication of an existing issue, and status lookup. It needs a GitHub-enabled Huly project, an enabled mapped disposable repository, a running writable GitHub service, and bounded polling for the worker-created URL/number. The default self-host configuration has the service disabled, so the fixture must explicitly prove these prerequisites and skip nothing silently. Cleanup must remove test artifacts from both Huly and the disposable GitHub repository, or use a dedicated repository whose contents can be safely retained and identified.

Until that external integration fixture exists, unit and Huly-model tests can validate the request transaction but cannot honestly certify end-to-end GitHub publication.

## Scope boundary

The recommended implementation satisfies “push an existing Huly issue to GitHub.” If the issue author instead requires linking a chosen Huly issue to an arbitrary pre-existing GitHub URL/number, treat that as a separate requirement. The inspected native UI does not expose that operation, and writing `url`/`githubNumber` or `DocSyncInfo.external` manually would bypass server ownership and conflict handling. That variant needs additional upstream research and should not be inferred into #281.
