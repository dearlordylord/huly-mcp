# Workbench integration spike

Date: 2026-08-08
Issue: [#147](https://github.com/dearlordylord/huly-mcp/issues/147)
Upstream source revisions inspected: `hcengineering/platform@2a985b31e314c0793dd965e5a1d8abe28f262f34` and release `v0.7.423@b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd`

## Decision

Implement one small read-only tool: **`list_workbench_applications`**. It is useful to a coding agent as a route/domain inventory: application `alias` is the authoritative human-readable URL key, and summarized navigation models reveal the space classes and stable item IDs beneath an application. Return model declarations, not a claim that every application is enabled or visible in the browser.

Do not include personal tabs or widget state in that default inventory. Stored Workbench tabs are private, ephemeral browser-navigation history; the selected tab is only in browser `localStorage`, so Huly cannot identify the active tab. Widget definitions have no human-readable alias, widget tabs/sidebar state are also browser-local, and the published package supplies only internationalization resource IDs rather than resolved display labels. Widget and tab discovery therefore adds privacy/output cost without a reliable agent action.

The safe application result should contain:

- stable application ID, exact `alias`, and untranslated `labelId`;
- model flags only: `hidden`, `accessLevel`, `position`, `order`, and optional `type`;
- intentionally summarized navigation entries: kind, stable item `id`, `labelId` when present, `spaceClass`/`groupByClass`, position, and access level;
- optional current-account `hiddenByPreference`, derived without returning the preference row itself;
- explicit wording that model presence is not plugin/provider/runtime capability and that effective browser visibility also depends on role, exclusions, module permissions, and browser metadata.

Pin exact `@hcengineering/workbench@0.7.0` as a direct dependency of both MCP and CLI. It is the only compatible, typed published artifact. Define output boundaries independently with Effect Schema because its declarations lag newer live model fields.

## Published package viability

Primary registry and installation probes were:

```text
pnpm view @hcengineering/workbench versions --json
pnpm view @hcengineering/workbench@0.7.0 name version types main dependencies --json
pnpm view @hcengineering/workbench@0.7.382 name version types main dependencies --json
pnpm view @hcengineering/workbench@0.7.423 name version types main dependencies --json
curl -fsSL https://registry.npmjs.org/@hcengineering/workbench/-/workbench-<version>.tgz | tar -tz
pnpm why @hcengineering/workbench
test -e node_modules/@hcengineering/workbench
test -e packages/huly-cli/node_modules/@hcengineering/workbench
```

The registry contains exactly `0.7.0`, `0.7.382`, `0.7.411`, `0.7.413`, and `0.7.423` ([registry metadata](https://registry.npmjs.org/@hcengineering/workbench)). Exact `0.7.0` is the only usable version for this repository:

- it depends on core/platform `^0.7.3` and UI/view/preference/notification `^0.7.0`, compatible with this project's exact package generation;
- its 22-file tarball contains CommonJS plus complete `types/analytics.d.ts`, `index.d.ts`, `plugin.d.ts`, `types.d.ts`, and `utils.d.ts`;
- clean installation alongside core `0.7.26`, platform `0.7.20`, and the project's `0.7.0` packages succeeds;
- loading `lib/index.js` returns `workbenchId === "workbench"`, `WidgetType`, and the six expected class refs;
- its `svelte: src/index.ts` manifest entry points to omitted source, but the proposed Node/CommonJS model-read path does not use it.

Version `0.7.382` includes declarations but publishes six literal `workspace:^0.7.382` dependency edges, so external npm/pnpm installation fails. Versions `0.7.411`, `0.7.413`, and `0.7.423` install JavaScript but omit the declared `types` directory and require synchronized `^0.7.411`/`.413`/`.423` dependencies. The official [0.7.0 tarball](https://registry.npmjs.org/@hcengineering/workbench/-/workbench-0.7.0.tgz) and [0.7.423 tarball](https://registry.npmjs.org/@hcengineering/workbench/-/workbench-0.7.423.tgz) reproduce the contrast. A clean reproduction of the workspace-protocol failure is:

```text
probe_dir=$(mktemp -d)
pnpm --dir "$probe_dir" add @hcengineering/workbench@0.7.382
# ERR_PNPM_WORKSPACE_PKG_NOT_FOUND
```

`pnpm why` finds `@hcengineering/workbench@0.7.0` only transitively through packages such as attachment and Chunter. Neither MCP nor CLI has a direct node_modules link or declared dependency. Importing an undeclared transitive dependency is not safe; add exact `0.7.0` directly to both.

## Exported shapes and model storage

The stable official interfaces are in [`plugins/workbench/src/types.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench/src/types.ts#L35-L126):

- `Application extends Doc`: required `label`, `alias`, `icon`, `hidden`; optional position/order/type, inline navigator model, location resources, components, and access level;
- `ApplicationNavModel extends Doc`: `extends: Ref<Application>` plus optional `spaces`, `specials`, and `groups` navigation extensions;
- `HiddenApplication extends Preference`: `attachedTo: Ref<Application>`; presence means hidden for that preference owner;
- `Widget extends Doc`: label/icon/type/component plus optional tab/switcher/header components, close behavior, callback, and access level;
- `WidgetPreference extends Preference`: inherited `attachedTo` is refined to a widget ref and `enabled` is boolean;
- `WorkbenchTab extends Preference`: `attachedTo: AccountUuid`, `location`, `isPinned`, and optional `name`.

`WidgetType` values are `fixed`, `flexible`, and the upstream literal `configurable ` **with a trailing space**. Boundary parsing must preserve/recognize that exact published value rather than silently trim it.

The current runtime model establishes inheritance and storage ([`models/workbench/src/index.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/models/workbench/src/index.ts#L45-L123)):

- `Application`, `ApplicationNavModel`, and `Widget` extend `Doc` in `DOMAIN_MODEL`; they are static model-space configuration;
- `HiddenApplication`, `WidgetPreference`, and `WorkbenchTab` extend `Preference` in the preference domain;
- only the preference `attachedTo` refinements have `@Prop`; most Workbench fields therefore exist in document payloads while live classifier inventory reports zero direct attributes.

The exact plugin IDs are stable and published ([`plugins/workbench/src/plugin.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench/src/plugin.ts#L35-L49)). The `0.7.0` declarations nevertheless lag current source: they omit `Application.navHeaderActions`, navigation `groups`, `NavigatorModel.hideStarred`, and the newer `OpenInNewTab` resource. The proposed tool must parse a narrow schema-owned projection and tolerate additional fields rather than treat `0.7.0` as the complete live-record schema.

## Identifier and ambiguity semantics

**Applications.** `alias` is the only published human-readable stable identifier. The UI reads the URL application segment and resolves the first model application with that alias ([`workbench-resources/src/workbench.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench-resources/src/workbench.ts#L262-L285)). The model has no uniqueness constraint. An MCP exact-alias filter must return an ambiguity error if duplicate aliases exist instead of copying the UI's first-row behavior. Return `_id` alongside alias.

`label` is an `IntlString` resource ID such as `tracker:string:TrackerApplication`, not display text. Translation loaders live in presentation plugins and are not part of the Workbench artifact or the current Node client. Return it honestly as `labelId`; do not turn an ID tail into fabricated human text.

**Navigation items.** `spaces`, `specials`, and `groups` have author-assigned string IDs, but they are scoped to an application and kind. Navigation extensions merge space entries by ID and concatenate other entries ([`workbench-resources/src/utils.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench-resources/src/utils.ts#L179-L207)). Use `{ applicationAlias, kind, id }` as the composite identifier and preserve duplicates in discovery output; do not execute `visibleIf`, `queryBuilder`, components, or arbitrary component props. Summarize only declarative IDs/classes/flags.

**Workbench tabs.** `name` is optional and non-unique. `location` is a normalized Workbench path and can contain object IDs or user-visible titles; `_id` is the only stable tab identifier. UI matching itself combines name/location segments rather than asserting name uniqueness ([`workbench-resources/src/workbench.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench-resources/src/workbench.ts#L80-L130)). A future personal-tab tool must list IDs and reject ambiguous name selectors.

**Widgets.** Widget documents have no alias or plain name. Their stable ref is machine-readable and their label is only an unresolved `IntlString`. Therefore issue #147 cannot honestly promise a human-readable widget selector from the published/runtime model. This is a concrete reason to defer an agent-facing widget tool.

## Preference payloads and privacy

The three server-stored preference shapes are small and should be typed, never returned as raw arbitrary JSON:

- hidden application: `{ applicationId }`, derived from `attachedTo`; the preference row ID/actor metadata is unnecessary;
- widget preference: `{ widgetId, enabled }`; duplicate rows for one widget must be surfaced as ambiguous rather than first-wins;
- Workbench tab: `{ tabId, name?, location, isPinned, modifiedOn }` after strict parsing.

Official UI writes hidden and widget preferences in `core.space.Workspace` and queries them without an account selector ([hide/show source](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench-resources/src/utils.ts#L150-L165), [widget source](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench-resources/src/components/sidebar/widgets/AddWidgetsPopup.svelte#L29-L63)). It relies on preference-domain visibility. MCP should add an application-level defense: accept no user selector and filter those rows by the authenticated primary social ID's `createdBy` plus workspace space.

Workbench tabs have a stronger owner key: the UI queries `{ attachedTo: currentAccount.uuid }`, sorted pinned-first then oldest-first ([`Workbench.svelte`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench-resources/src/components/Workbench.svelte#L191-L213)). A future tool must derive the account UUID from the authenticated client and also constrain `createdBy`; it must never accept another account UUID.

Tab names/locations expose the caller's recent workspace context. That is authorized but unnecessary in a workspace application inventory, so keep it behind a separate opt-in personal tool if a real agent use case appears. Do not log tab locations or preference payloads.

## Browser-only state and unsupported claims

Huly persists Workbench tab documents, but the currently selected tab ID is stored only under `workbench.<workspace>.<accountUuid>.tab` in browser `localStorage` ([`workbench.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench-resources/src/workbench.ts#L137-L165)). An MCP process cannot identify the active tab from server data.

`WidgetTab` is not a document class. Widget tabs, selected widget, sidebar variant, and arbitrary widget `data` are serialized entirely into browser `localStorage` ([`workbench-resources/src/sidebar.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/workbench-resources/src/sidebar.ts#L29-L110)). The only Huly widget preference is the `enabled` boolean.

Consequently, these capabilities are explicitly unsupported:

- active-tab, active-widget, sidebar, or widget-tab discovery;
- browser navigation/open/close/show/hide/toggle operations;
- create/close/pin/unpin tab mutations;
- hide/show application or enable/disable widget mutations;
- executing component/resource callbacks or returning arbitrary `componentProps`, query builders, or widget-tab data;
- treating an application declaration as proof that its plugin, external provider, worker, or API is enabled.

The last point matters for Gmail/Mail/Telegram/Support: Workbench is generic presentation navigation. It neither authenticates those integrations nor makes their records readable. The live model included applications whose plugin configurations were disabled, proving that application presence is not a capability signal.

## Live read-only evidence

The branch built successfully with `pnpm build`. Live probes used the normal local credentials and explicitly avoided a stale token:

```text
set -a && source .env.local && set +a
unset HULY_TOKEN
export HULY_URL="${HULY_URL/localhost/host.docker.internal}"
```

The documented MCP stdio harness called:

```text
list_huly_classes {"query":"workbench","limit":50}
get_huly_class {"class":"workbench:class:Application","includeInheritedAttributes":true}
get_huly_class {"class":"workbench:class:WorkbenchTab","includeInheritedAttributes":true}
list_huly_plugin_configurations {}
```

It returned six classes plus `SpaceView`: model-domain `Application`, `ApplicationNavModel`, and `Widget`; preference-derived `HiddenApplication`, `WidgetPreference`, and `WorkbenchTab`; and the mixin. The Workbench plugin was enabled with 17 transactions. As the source predicts, only `HiddenApplication.attachedTo` and `WidgetPreference.attachedTo` were direct model attributes; application and tab classifier metadata did not describe their payload fields.

Direct `buildScopedClientBundle` probes performed:

```text
client.findAllInModel("workbench:class:Application", {}, { limit: 200 })
client.findAllInModel("workbench:class:ApplicationNavModel", {}, { limit: 200 })
client.findAllInModel("workbench:class:Widget", {}, { limit: 200 })
client.findAll("workbench:class:HiddenApplication", { space: "core:space:Workspace", createdBy: primarySocialId }, { limit: 200 })
client.findAll("workbench:class:WidgetPreference", { space: "core:space:Workspace", createdBy: primarySocialId }, { limit: 200 })
client.findAll("workbench:class:WorkbenchTab", { attachedTo: accountUuid, createdBy: primarySocialId }, { limit: 200 })
```

Results were 24 applications with unique aliases, one navigation extension, eight widgets, zero caller hidden-application rows, zero caller widget preferences, and one caller-owned tab. The tab's private name/location and both account identifiers are intentionally omitted from this report. One legacy Lead space-navigation declaration lacked the published required `id`; the implemented list operation omits that unusable entry with an agent-visible warning while preserving the application and its valid navigation. Model applications included entries belonging to disabled plugin configurations; results are therefore model declarations only. All observed widgets were `fixed` or `flexible`; the malformed `configurable ` enum was not exercised live.

## Recommended tickets

1. **Implement `list_workbench_applications` (small, useful).** Add exact direct `@hcengineering/workbench@0.7.0` dependencies to MCP and CLI. Query applications/navigation from the model cache, optionally filter by exact alias or case-insensitive alias substring, and apply bounded output. Join only caller-owned hidden-application preferences. Return schema-owned application and summarized navigation shapes; preserve label resource IDs as `labelId`. Validate alias uniqueness on exact resolution and state that results are model declarations, not effective runtime visibility.
2. **Test model/version drift explicitly.** Parse the stable subset rather than trusting every `0.7.0` interface field. Cover current-only navigation groups, unknown future fields, duplicate aliases, duplicate navigation IDs, missing required values, and embedded/unresolved label IDs. Never execute model resources.
3. **Add local-Huly integration coverage.** Assert the Workbench classifiers exist, application aliases are non-empty, and application/nav model queries succeed. Verify a known alias can be found, and compare plugin configuration only to prove the tool does not infer capability from application presence. Read personal preferences only through caller-derived filters.
4. **Defer `list_my_workbench_tabs`.** Add it only for a concrete navigation-history use case and keep it a separate opt-in tool. It must be caller-only, identify tabs by raw ID plus optional non-unique name, return no `active` flag, and describe locations as private stored paths rather than authoritative object locators.
5. **Do not ticket widget/widget-preference discovery yet.** The model has no human-readable widget alias, translations are not available through this SDK boundary, widget tabs are browser-only, and the current workspace has no stored widget preferences. Revisit after a first-party label-resolution boundary or a demonstrated agent workflow.
6. **Keep all Workbench mutations unsupported.** They change a human's UI/session preferences and cannot synchronize the active browser state from MCP.

The durable outcome for #147 is application/navigation discovery only. Personal tabs and widget preferences are typed and queryable, but they are intentionally excluded because they describe private browser presentation state, not Huly work objects or actionable coding-agent capability.
