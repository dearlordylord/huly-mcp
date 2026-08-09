# Telegram integration spike

Date: 2026-08-08
Issue: [#144](https://github.com/dearlordylord/huly-mcp/issues/144)
Upstream source revision inspected: `hcengineering/platform@2a985b31e314c0793dd965e5a1d8abe28f262f34`

## Decision

A narrowly described **read-only stored-message branch is supportable**, after pinning the only compatible published artifact: exact `@hcengineering/telegram@0.7.0` in both the MCP and CLI packages. Extending the existing provider-discriminated `list_external_channel_messages` tool preserves its public locator and avoids making an LLM choose between overlapping read tools. The Telegram branch should list snapshots already stored in Huly. It must not claim to read Telegram live, prove provider health, or guarantee sync freshness.

Do not expose send, reply, attachment-send, or delivery-status tools. The published model can queue a `NewMessage` and distinguish only `new` from `sent`; it cannot represent rejected, failed, delivered, or read. Current official UI and worker sources also disagree about the provider API, and the local workspace has no Telegram integration, channel, or message fixture with which to prove end-to-end behavior.

The smallest safe LLM-facing result is therefore a list of authoritative Huly fields: message ID, resolved channel ID/value, direction, `sendOn`, Markdown-rendered content, and attachment count. Its description should say “stored Huly Telegram messages,” not “Telegram messages.”

## Published package compatibility

Registry and local dependency probes were:

```text
pnpm view @hcengineering/telegram versions --json
pnpm view @hcengineering/telegram@0.7.0 name version types main dependencies --json
pnpm view @hcengineering/telegram@0.7.382 name version types main dependencies --json
pnpm view @hcengineering/telegram@0.7.423 name version types main dependencies --json
pnpm pack @hcengineering/telegram@<version> --pack-destination <temporary-directory>
pnpm why @hcengineering/telegram
test -e node_modules/@hcengineering/telegram
test -e packages/huly-cli/node_modules/@hcengineering/telegram
```

The registry currently lists `0.7.0`, `0.7.382`, `0.7.411`, `0.7.413`, and `0.7.423`. Exact `0.7.0` matches this repository's `0.7.x` Huly dependency generation, declares normal `^0.7.0` dependencies (core is `^0.7.3`), and its tarball contains both `lib/index.js` and `types/index.d.ts`. Loading that tarball through Node's CommonJS boundary returned `telegramId === "telegram"`, `telegramIntegrationKind === "hulygram"`, and the expected class refs.

The later artifacts are not safe substitutes. Version `0.7.382` publishes literal `workspace:^0.7.382` dependency ranges. Versions `0.7.411`, `0.7.413`, and latest `0.7.423` declare `types/index.d.ts` but omit the `types` directory from their tarballs; latest also requires the incompatible `^0.7.423` package generation. These facts can be reproduced from the primary [0.7.0 registry manifest](https://registry.npmjs.org/@hcengineering/telegram/0.7.0), [0.7.423 registry manifest](https://registry.npmjs.org/@hcengineering/telegram/0.7.423), and their `dist.tarball` artifacts.

The package is currently installed in neither package: `pnpm why` printed no dependency and both filesystem probes were false. Pin exact `0.7.0`; a range or “latest” can select an unusable artifact.

## Model entities and fields

The published declarations define:

- `TelegramMessage`: `content`, optional attachment count, and the contact `ChannelItem` contract;
- `NewTelegramMessage`: an attached document with `content`, optional attachment count, and `status: "new" | "sent"`;
- `SharedTelegramMessage`: an embedded value with `content`, optional attachment count, `incoming`, `sender`, and `sendOn`;
- `SharedTelegramMessages`: an attached document containing an array of those values;
- integration kind `hulygram` and refs for `Message`, `NewMessage`, `SharedMessage`, and `SharedMessages`.

These declarations are also in the official [`plugins/telegram/src/index.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/telegram/src/index.ts#L16-L96). The model creates three persisted classifiers in domain `telegram`: `Message` has direct fields `content`, `incoming`, attachment collection, and `sendOn`; `NewMessage` has `content`, `status`, and attachment collection; `SharedMessages` has the embedded array ([`models/telegram/src/index.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/telegram/src/index.ts#L53-L100)). There is no independent persisted `SharedMessage` class. The model separately registers a Telegram contact `ChannelProvider` and a multi-instance integration type of kind `hulygram` ([same file](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/telegram/src/index.ts#L141-L172)).

Inbound worker records are attached to a contact `Channel`, use its `items` collection, store Telegram time as `sendOn`, convert Telegram markup into platform HTML, and set direction from Telegram's `out` flag ([`workspace.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/telegram/pod-telegram/src/workspace.ts#L545-L568)). A read tool should therefore use the project's existing HTML-to-Markdown boundary rather than present the stored `content` as plaintext.

## Live workspace evidence

Read-only probes used the normal credentials with `HULY_URL=http://host.docker.internal:8087`. The MCP stdio harness ran:

```text
list_huly_classes {"query":"telegram","limit":50}
get_huly_class {"class":"telegram:class:Message","includeInheritedAttributes":true}
get_huly_class {"class":"telegram:class:NewMessage","includeInheritedAttributes":true}
list_huly_plugin_configurations {}
list_external_channel_messages {"provider":"telegram","channel":"Ops"}
```

The first query returned exactly `telegram:class:Message`, `telegram:class:NewMessage`, and `telegram:class:SharedMessages`. The class probes confirmed the fields above. Plugin configuration records for `telegram` and `server-telegram` were enabled. The existing external-channel assessment correctly returned `supported:false`, reason code `package-incompatible`, because the package is not installed in this build.

Separate document-client probes used the project's `buildScopedClientBundle` and executed these read-only calls, each with `limit: 10`:

```text
client.findAll("telegram:class:Message", {}, { limit: 10 })
client.findAll("telegram:class:NewMessage", {}, { limit: 10 })
client.findAll(setting.class.Integration, { type: "telegram:integrationType:Telegram" }, { limit: 10 })
client.findAll(contact.class.Channel, { provider: "contact:channelProvider:Telegram" }, { limit: 10 })
```

Every query completed, but all four result sets were empty. Thus the live server accepts the published model IDs, but this workspace cannot establish synchronization, authorization, or send behavior.

The deployment's public configuration was inspected with:

```text
curl -fsS http://host.docker.internal:8087/config.json |
  jq '{TELEGRAM_URL,GMAIL_URL,HULYLAKE_URL,MODEL_VERSION,VERSION}'
```

It returned `TELEGRAM_URL: "http://nginx/_telegram"`, a separate `GMAIL_URL`, no `HULYLAKE_URL`, model `0.7.343`, and application `0.7.409`. Unauthenticated GETs to `/_telegram` and `/_telegram/api/integrations/` returned the front-end HTML shell, not a provider health or capability response. This does not prove that the service is absent; it proves that front configuration and an enabled plugin are insufficient provider-health evidence. Docker service inspection was unavailable because this container has no Docker CLI.

## Provider, authentication, send, status, and attachments

Current UI code connects through the account integration client, then calls `${TelegramURL}/api/integrations` for authorization state, code/password challenges, chat listing, restart, and disconnect. Channel configuration includes `syncEnabled`, optional read-only access, and target space ([`telegram-resources/src/api.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/telegram-resources/src/api.ts#L29-L95)). No implementation of that route was found in the inspected official platform tree.

The checked-in Telegram worker is a legacy GramJS/MTProto user-account service. It requires Telegram API ID/hash, Mongo, account-service URL, and secret ([`config.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/telegram/pod-telegram/src/config.ts#L1-L50)). More importantly, its server constructs an empty endpoint list while the older `/signin` flow is commented out ([`main.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/telegram/pod-telegram/src/main.ts#L43-L56)). The published model does not bridge this source/runtime gap. A configured `hulygram` account must be proven by a supported authenticated capability API before MCP may claim provider availability.

The UI “send” action only creates a `NewMessage` collection document with HTML content, attachments, and status `new` ([`Chat.svelte`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/telegram-resources/src/components/Chat.svelte#L115-L130)). The legacy worker later attempts delivery and writes `sent` only after Telegram API calls return ([`workspace.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/telegram/pod-telegram/src/workspace.ts#L303-L366)). Missing users or channels can return without changing status; thrown errors are logged, and startup retries documents still marked `new` ([same file](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/telegram/pod-telegram/src/workspace.ts#L531-L542)). There is no error state, provider message ID, delivery receipt, or read receipt. Consequently `sent` means only that this worker's send calls returned, not delivered/read, while `new` conflates pending, skipped, and failed.

Incoming attachment creation is intentionally detached from the message transaction and can lag or fail independently ([same file](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/telegram/pod-telegram/src/workspace.ts#L443-L461)). Read results may safely expose the authoritative attachment count/collection with a freshness caveat. For outgoing data, one file is sent with the body; multiple files become multiple Telegram messages, only the first carrying the body ([same file](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/telegram/pod-telegram/src/workspace.ts#L333-L359)). This surprising fan-out, plus the unverified provider and weak status model, makes attachment sending unsafe for an LLM-facing tool.

## Separation from Gmail and Mail

Telegram is a legacy provider-specific document model attached to contact channels. Gmail has a different provider-specific package and classes. The existing external-channel operation treats both as explicit compatibility assessments rather than assuming that model presence proves live records.

`@hcengineering/mail` is a third path: its published surface is only the provider-neutral `mail:tag:MailThread` card tag, and newer mail services write content through the communication/HulyLake pipeline. It provides neither Telegram DTOs nor Telegram provider access. Likewise, `GMAIL_URL` and legacy Gmail classes do not establish Telegram capability. The three integrations must retain separate dependency, model, runtime, and result semantics.

## Recommended tickets

1. **Implement the read-only Telegram branch of `list_external_channel_messages` (small, dependency-ready).** Add exact `@hcengineering/telegram@0.7.0` to both runtime packages and load it through the existing CommonJS plugin boundary. Resolve a Telegram channel from raw channel ID first or an unambiguous exact Telegram channel value; query `telegram.class.Message` by `attachedTo`, newest `sendOn` first, with a bounded limit. Parse inputs/results with Effect Schema and return IDs, resolved channel identity, direction, timestamp, Markdown content, and attachment count. Say explicitly that results are stored Huly snapshots and sync freshness is unverified.
2. **Add an integration fixture before declaring the read ticket complete.** The local class/query probes prove model access but found no records. Integration verification must exercise a temporary model-faithful Telegram channel/message fixture with cleanup, or a connected disposable Telegram deployment. It must not require a real outbound message merely to validate reads.
3. **Keep send/reply unsupported.** Revisit only after an authenticated provider-capability endpoint is available, the deployed provider implementation is traceable to published source, recipient/channel resolution is unambiguous, and an accepted/failed acknowledgement can be represented durably. Creating `NewMessage` alone is not successful sending, and Huly read-after-write eventual consistency prevents a reliable single-call create-then-poll workaround.
4. **Keep outbound attachments and delivery/read status unsupported.** They require documented one-logical-message semantics and durable provider IDs/statuses. Inbound attachment metadata may be added to reads only with its asynchronous freshness caveat.
5. **Keep capability claims separate.** The Telegram branch may advertise stored-read support only when the exact package, workspace model, and contact channel are present. Provider health and send capability must remain separate operations rather than being inferred from read compatibility.

The concrete unsupported reason for writes is: **the only compatible package supplies a queue/status model, not a verified provider capability or delivery contract; current official provider sources diverge, and `new | sent` cannot distinguish failure from delivery.**
