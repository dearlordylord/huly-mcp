# Support integration spike

Date: 2026-08-08
Issue: [#146](https://github.com/dearlordylord/huly-mcp/issues/146)
Upstream source revisions inspected: `hcengineering/platform@2a985b31e314c0793dd965e5a1d8abe28f262f34` and release `v0.7.423@b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd`

## Decision

Do not implement support **message** reads. `@hcengineering/support` has no message, participant, body, attachment, thread, Chunter, communication, or contact contract. Its misleadingly named `SupportConversation` is only an account preference/status row containing an opaque external widget conversation ID and one stored unread boolean. The browser-loaded support widget owns actual conversation content outside Huly's document model.

A smaller read-only tool is supportable after adding exact `@hcengineering/support@0.7.0` to both runtime packages: one zero-argument `get_support_status` call that discovers workspace support-system configuration and the authenticated account's stored conversation-status rows. It should return:

- `setupStatus: "missing" | "configured" | "ambiguous"`;
- configured systems as `{ id, name }`, without exposing or loading the executable `factory` resource;
- only the caller's status rows as `{ recordId, providerConversationId, storedHasUnreadMessages, modifiedOn }`;
- an explicit explanation that no message content is available and the unread value is a stored fallback, not a live provider count.

Missing setup is a normal successful result, not an exception. The live test workspace produced that result: the model/plugin exists and is enabled, but it has no `SupportSystem` and no caller conversation rows. No honest read/send/reply/widget-control tool is supportable beyond the status discovery above.

## Published package viability

Primary registry probes were:

```text
pnpm view @hcengineering/support versions --json
pnpm view @hcengineering/support@0.7.0 name version types main dependencies --json
pnpm view @hcengineering/support@0.7.382 name version types main dependencies --json
pnpm view @hcengineering/support@0.7.423 name version types main dependencies --json
curl -fsSL https://registry.npmjs.org/@hcengineering/support/-/support-<version>.tgz | tar -tz
pnpm why @hcengineering/support
test -e node_modules/@hcengineering/support
test -e packages/huly-cli/node_modules/@hcengineering/support
```

The registry lists exactly `0.7.0`, `0.7.382`, `0.7.411`, `0.7.413`, and `0.7.423`. Exact `0.7.0` is the only viable artifact for this repository:

- its `core` and `platform` ranges are `^0.7.3`, compatible with this project's `0.7.26` and `0.7.20` respectively;
- its tarball contains working CommonJS plus `types/index.d.ts`, `types/types.d.ts`, and `types/utils.d.ts`;
- loading its `lib/index.js` with this repository's dependencies returns `supportId === "support"`, `support:class:SupportConversation`, and `support:class:SupportSystem`;
- its `svelte` manifest entry points to omitted source, but the proposed Node/CommonJS read path does not use that entry.

Version `0.7.382` ships declarations but publishes literal `workspace:^0.7.382` dependencies; clean npm/pnpm consumer installation fails. Versions `0.7.411`, `0.7.413`, and `0.7.423` install JavaScript but declare a `types/index.d.ts` file absent from their eight-file tarballs, and require their much newer synchronized Huly dependency generations. Reproduction for each release is possible through the [registry manifest](https://registry.npmjs.org/@hcengineering/support) and official tarballs such as [0.7.0](https://registry.npmjs.org/@hcengineering/support/-/support-0.7.0.tgz) and [0.7.423](https://registry.npmjs.org/@hcengineering/support/-/support-0.7.423.tgz). A clean-install check for the broken workspace dependency is:

```text
probe_dir=$(mktemp -d)
pnpm --dir "$probe_dir" add @hcengineering/support@0.7.382
# ERR_PNPM_WORKSPACE_PKG_NOT_FOUND
```

`@hcengineering/support` is installed in neither the MCP package nor the CLI package: `pnpm why` returned no dependency and both filesystem probes were false. The implementation must pin exactly `0.7.0`, not use a caret or `latest`.

## What the model actually represents

The published declarations define only two document shapes:

- `SupportConversation`: `conversationId: string` and `hasUnreadMessages: boolean`;
- `SupportSystem`: `name: string` and `factory: Resource<SupportWidgetFactory>`.

The official definitions are visible in [`plugins/support/src/types.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/support/src/types.ts#L22-L33). The plugin exposes those two class IDs and a browser support-client resource ([`plugins/support/src/index.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/support/src/index.ts#L32-L55)).

The runtime model adds important semantics ([`models/support/src/index.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/models/support/src/index.ts#L31-L49)):

- `SupportConversation` extends `preference.class.Preference`, is stored in the preference domain, and indexes `conversationId`;
- `SupportSystem` is a model-domain document;
- neither class declares model properties with `@Prop`, so live classifier introspection reports zero direct attributes even though created documents may carry the TypeScript-declared values.

Preference inheritance adds an `attachedTo: string` model field ([`plugins/preference/src/index.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/preference/src/index.ts#L23-L25), [`models/preference/src/index.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/models/preference/src/index.ts#L25-L29)). However, the support helper creates rows with only `conversationId` and `hasUnreadMessages`; it uses the account `PersonId` as `space` and actor, and does not set `attachedTo` ([`plugins/support/src/utils.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/support/src/utils.ts#L23-L42)). An MCP output must not invent or depend on `attachedTo`.

`conversationId` is an opaque widget/provider identifier. It is not a Huly Chunter channel, direct message, communication thread, contact, URL, or human-readable support number. `SupportConversation` contains no `SupportSystem` foreign key, so even a stored row cannot be authoritatively associated with one of multiple configured systems. There is also no uniqueness constraint on `SupportSystem`; the browser uses an unfiltered `findOne`, while an LLM-first tool must report multiple rows as `ambiguous` rather than pick nondeterministically.

## Runtime, setup, and authentication

Support setup is document- and browser-resource-based, not a server integration contract. The presentation client finds one `SupportSystem`; if none exists it returns `undefined`. When present, it dynamically loads `supportSystem.factory`, configures the widget with the current account, workspace slug, and language, and receives unread/visibility callbacks ([`support-resources/src/support.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/support-resources/src/support.ts#L44-L66), [same file](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/support-resources/src/support.ts#L121-L147)).

No provider implementation or authenticated support API is present in the inspected official platform source. The front pod merely publishes `INTERCOM_APP_ID` and `INTERCOM_API_URL` environment values ([`pods/front/src/__start.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/pods/front/src/__start.ts#L29-L34)); the support package itself does not define Intercom request, response, token, conversation, or message schemas. A model plugin being enabled therefore proves only that the two classifiers were loaded.

The safe runtime-detection sequence is:

1. verify the exact package loaded and both class IDs exist;
2. query `SupportSystem` from the client-side model, because it is a model-domain document;
3. classify zero systems as `missing`, one as `configured`, and more than one as `ambiguous`;
4. query `SupportConversation` only for the authenticated primary social ID, with both `space` and `createdBy` filters;
5. return stored status only; never call `getResource(factory)` or instantiate the browser widget in MCP.

This requires normal Huly workspace authentication only. It does not establish provider authorization. Loading executable presentation resources in a Node MCP process would add browser/runtime coupling and still would not provide a published message API.

## Privacy and visibility constraints

Support status is account-private preference data, not workspace conversation data. Official write helpers use `account as space`, and the UI's live query filters `createdBy` to `currentAccount.primarySocialId` ([`support-resources/src/support.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/support-resources/src/support.ts#L55-L65)). The MCP must preserve both constraints even if server-side security also filters preference rows:

- accept no account/person selector;
- derive the primary social ID from the authenticated client;
- query `{ space: primarySocialId, createdBy: primarySocialId }`;
- never enumerate another member's support IDs or unread state;
- do not log the opaque provider conversation ID;
- expose system `name` but not executable `factory` metadata.

The stored boolean is not live provider truth. Once the widget is loaded, its runtime unread count overrides the persisted boolean; otherwise the browser falls back to whether any stored row has `hasUnreadMessages` ([`support-resources/src/support.ts`](https://github.com/hcengineering/platform/blob/b9f2f9d5b110e18e0484c90e4358f0fc8ae419bd/plugins/support-resources/src/support.ts#L102-L118)). Name the MCP field `storedHasUnreadMessages` and include `modifiedOn`; do not return an `unreadCount` or claim freshness. Widget visibility is runtime-only and cannot be discovered from Huly documents.

## Relationship to Chunter, communication, and contact

There is no model relationship. The support artifact depends only on core and platform. Its declarations and official support sources import none of Chunter, communication, contact, attachment, or storage. The support widget is an external presentation resource; Huly persists only an account-scoped conversation identifier and unread fallback.

Consequences:

- generic channel/DM/thread tools must not accept `providerConversationId`;
- communication/HulyLake reads cannot retrieve support widget messages;
- contact resolution cannot identify support participants or agents;
- attachment listing, message search, transcript export, sending, replying, marking read, widget show/hide, and deletion are unsupported;
- a Huly `SupportConversation` row remaining after `SupportSystem` removal is possible and must be reported as an orphaned status row, not proof of active support setup.

## Live read-only evidence

The current branch was built with `pnpm build`. Live probes sourced `.env.local`, rewrote `localhost` to `host.docker.internal`, and explicitly unset a potentially stale token so email/password authentication was used:

```text
set -a && source .env.local && set +a
unset HULY_TOKEN
HULY_URL="${HULY_URL/localhost/host.docker.internal}"
```

The documented MCP stdio harness then called:

```text
list_huly_classes {"query":"support","limit":50}
get_huly_class {"class":"support:class:SupportConversation","includeInheritedAttributes":true}
get_huly_class {"class":"support:class:SupportSystem","includeInheritedAttributes":true}
list_huly_plugin_configurations {}
```

Results:

- exactly the two published support classifiers exist;
- `SupportConversation` extends `preference:class:Preference`, whose inherited attributes include `attachedTo` and normal document metadata;
- `SupportSystem` extends `core:class:Doc` in domain `model`;
- both report zero direct attributes, matching the missing `@Prop` declarations above;
- plugin configuration `support` is enabled with two model transactions.

Direct read-only client probes used `buildScopedClientBundle` and the following calls:

```text
client.findAll("support:class:SupportConversation", {}, { limit: 20 })
client.findAll("support:class:SupportSystem", {}, { limit: 20 })
client.findAllInModel("support:class:SupportSystem", {}, { limit: 20 })
```

All completed and returned empty arrays. The current primary social ID was resolved successfully, but is intentionally omitted from this durable report. The public front configuration was also checked:

```text
curl -fsS http://host.docker.internal:8087/config.json |
  jq '{INTERCOM_APP_ID,INTERCOM_API_URL,MODEL_VERSION,VERSION}'
```

Both Intercom values were empty; model version was `0.7.343` and application version `0.7.409`. Combined with the absence of any `SupportSystem`, this is a concrete missing-setup state. The empty values alone would not prove provider absence on every deployment, and an enabled support plugin does not override the missing system document.

## Recommended implementation tickets

1. **Implement `get_support_status` (small, dependency-ready).** Pin exact `@hcengineering/support@0.7.0` in MCP and CLI, load its CommonJS default plugin through the existing SDK boundary, and define all input/output with Effect Schema. Use no input selector. Read model systems and only caller-owned preference rows. Return deterministic `missing/configured/ambiguous` setup state, `{ id, name }` systems, and opaque caller status rows with the explicitly stored unread name and timestamp. Empty setup and empty rows are successful results.
2. **Make privacy a tested application invariant.** Query conversation rows with both caller `space` and `createdBy`; unit-test that no caller-supplied identity exists and foreign rows are excluded. Treat malformed rows as typed/skipped diagnostics rather than leaking raw documents. Do not put provider IDs in logs or errors.
3. **Add a local-Huly unsupported-state integration test.** Verify both classifiers, query model systems and caller-scoped rows, and assert the current local deployment returns `setupStatus: "missing"` without throwing. A separate temporary model-faithful fixture may test configured/ambiguous projection with guaranteed cleanup, but must not instantiate a widget or contact an external provider.
4. **Do not ticket transcript/message reads as SDK CRUD.** Reconsider only if Huly publishes a provider-neutral, authenticated message/participant/attachment schema and an access policy tied to the calling account. A browser `SupportWidget` factory is not that API.
5. **Keep all mutations and widget controls unsupported.** The package exports update/delete helpers and UI show/hide/toggle methods, but issue #146 is discovery-only and none has a safe LLM-facing provider acknowledgement or visibility contract.

The explicit unsupported reason for support messages is: **Huly publishes only account-private widget status records and a browser factory reference; actual support conversation content has no Huly document/API contract and cannot be joined to Chunter, communication, or contact data.**
