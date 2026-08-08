# Mail integration spike

Date: 2026-08-08
Issue: [#145](https://github.com/dearlordylord/huly-mcp/issues/145)
Upstream source revision inspected: `hcengineering/platform@2a985b31e314c0793dd965e5a1d8abe28f262f34`

## Decision

Do not expose mail message reads, sends, replies, attachments, or delivery status from `@hcengineering/mail` yet. The published package is only a model identifier package: it exports the `mail:tag:MailThread` card mixin plus a label and icon. It contains no message entity, mailbox API, sender API, status contract, or attachment contract. Actual current mail content is written into Huly's separate card/communication stack by deployment services.

Replace #145 with [#184, Mail: read-only thread metadata discovery](https://github.com/dearlordylord/huly-mcp/issues/184). The smallest safe LLM-facing slice is a **read-only mail-thread index**, not a mail-message tool:

- list `mail:tag:MailThread` channel cards and child cards found through the published `card.class.Card` plus `parent` contract;
- return only authoritative card metadata: stable IDs, human-resolved space ID/name, outer channel title, child subject, and created/modified timestamps when present;
- state in the tool name, schema, and description that this is metadata discovery; do not add fixed capability booleans or imply support for bodies, attachments, send/reply, or delivery status;
- never infer that an enabled model plugin means a mailbox provider or worker is configured.

This slice is useful for discovering mail-channel titles and subjects without pretending to expose email content or participant roles. It is not available from the current dependency set: `@hcengineering/mail` is published at `0.7.0`, yet is installed in neither the MCP package nor the CLI package. Issue #184 owns that dependency and implementation work. Message access and all writes remain blocked for the concrete reasons below.

## Published package and model

The npm registry is authoritative about the published artifact:

```text
pnpm view @hcengineering/mail@0.7.0 name version types main dependencies --json
```

It reports version `0.7.0`, `types/index.d.ts`, `lib/index.js`, and dependencies only on card/core/platform. Inspecting and loading the registry tarball shows a named `mailId` export plus a default plugin export whose `tag`, `string`, and `icon` properties contain `MailThread`, `MailTag`, and `Mail`. There are no mail DTOs or operations. The corresponding official source is [`plugins/mail/src/index.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/mail/src/index.ts#L16-L35).

The model creates `MailThread` as a mixin extending `chat.masterTag.Thread`; it declares no mail-specific fields ([`models/mail/src/index.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/models/mail/src/index.ts#L25-L37)). Its effective fields therefore come from card/document ancestry. A live read-only `get_huly_class` probe returned inherited card metadata including `_id`, `_class`, `space`, `title`, `parent`, `content`, `attachments`, `comments`, `createdBy/On`, and `modifiedBy/On`; the mail mixin itself had zero attributes.

Current upstream services construct two card levels:

1. An outer private `chat.masterTag.Thread` card whose normalized email address is its `title`, then apply `mail.tag.MailThread` as a mixin ([`services/mail/mail-common/src/channel.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/mail-common/src/channel.ts#L75-L165)).
2. A child private `chat.masterTag.Thread` card whose `title` is the email subject and whose `parent` is that outer channel ([`services/mail/mail-common/src/message.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/mail-common/src/message.ts#L207-L269)).

The actual message body is not a document owned by `@hcengineering/mail`. The service publishes `CreateMessageEvent` and `ThreadPatchEvent` records into the communication domain ([`services/mail/mail-common/src/message.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/mail-common/src/message.ts#L275-L339)). Inbound attachments are uploaded to storage and attached with communication blob events, with partial upload failures logged rather than represented in a mail model status ([same file](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/mail-common/src/message.ts#L121-L158)).

## Runtime availability in this workspace

Read-only local probes were run against `HULY_URL=http://host.docker.internal:8087` using the normal MCP credentials. The first three lines below are MCP tool calls sent through the documented stdio harness, not shell commands; the fourth is a shell command:

```text
list_huly_classes {"query":"mail","limit":50}
get_huly_class {"class":"mail:tag:MailThread","includeInheritedAttributes":true}
list_huly_plugin_configurations {}
curl -fsS http://host.docker.internal:8087/config.json | jq 'keys'
```

For example, the class probe was reproduced with a normal discovery request followed by this tool call through `timeout 8 node dist/index.cjs`:

```json
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_huly_classes","arguments":{"query":"mail","limit":50}},"id":2}
```

The concise results were: four matching classifiers (`gmail:class:Message`, `gmail:class:NewMessage`, `gmail:class:SharedMessages`, and `mail:tag:MailThread`); `MailThread` was a zero-field mixin whose direct ancestor was `chat:masterTag:Thread`; plugin configuration rows for `mail` and `huly-mail` were enabled; and the front configuration keys included `GMAIL_URL` but not `HULYLAKE_URL`.

Observed facts:

- `mail:tag:MailThread` exists as a mixin of `chat:masterTag:Thread`.
- `mail` and `huly-mail` plugin configuration records are enabled; each has one model transaction.
- legacy Gmail classes also exist (`gmail:class:Message`, `gmail:class:NewMessage`, and `gmail:class:SharedMessages`).
- the front configuration advertises `GMAIL_URL`, but does **not** advertise `HULYLAKE_URL`.
- `pnpm why @hcengineering/mail` returned no dependency, and neither `node_modules/@hcengineering/mail` nor `packages/huly-cli/node_modules/@hcengineering/mail` exists.

The proposed document-client read was separately exercised rather than inferred from model metadata:

- the npm tarball loaded successfully through Node's CommonJS boundary and returned named keys `["default", "mailId"]`, default-plugin keys `["tag", "string", "icon"]`, and `mail.default.tag.MailThread === "mail:tag:MailThread"`;
- `findAll(mail.default.tag.MailThread, {}, { limit: 5 })` completed successfully against the live workspace (initial count `0`);
- a temporary outer MailThread mixin and child card were then created with the same two-card relationship used by upstream, queried as the outer mixin plus `findAll(card.class.Card, { parent: outerId })`, projected to published Card fields, and removed in a `finally` cleanup;
- the probe returned one outer row and one child row with `_id`, `_class`, `space`, `title`, `parent`, `createdOn`, and `modifiedOn`. The child lookup did not import or query an unpublished Chat identifier.

`@hcengineering/chat@0.7.0` is not published (`pnpm view @hcengineering/chat@0.7.0` returns `E404`). Issue #184 therefore uses only the published Mail tag and Card `parent` relationship. It must resolve each raw space reference to a schema-owned `{ id, name }` result before returning it.

These observations prove model availability only. They do not prove that a user has configured a mailbox, that the `pod-mail-worker` is running, or that outgoing mail can be delivered. Huly's UI obtains available mailboxes from the account service, resolves an email social ID, creates an `huly-mail` integration, and stores its target space ([`plugins/huly-mail-resources/src/components/Configure.svelte`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/plugins/huly-mail-resources/src/components/Configure.svelte#L51-L99)). The `@hcengineering/huly-mail` package that defines this integration kind is not published in npm (`pnpm view @hcengineering/huly-mail@0.7.0` returns `E404`), so this project cannot import its contract from a supported artifact.

Full communication-message reads require more than the normal document client. The official query implementation loads message groups from HulyLake and combines them with the communication query client ([`foundations/communication/packages/query/src/messages/query.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/foundations/communication/packages/query/src/messages/query.ts#L55-L190)); presentation initializes it with a workspace token and `HulylakeUrl` ([`packages/presentation/src/communication.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/packages/presentation/src/communication.ts#L107-L121)). The local deployment supplies no such URL, and the current MCP connection layer exposes no equivalent communication/HulyLake resource. Reading card `content` would not be a substitute for reading messages.

## Authentication, provider, send, attachment, and status constraints

- **Mailbox authorization is account-service state.** The worker obtains mailbox options and per-mailbox secrets from the account client; missing mailbox secrets cause a logged early return ([`pod-mail-worker/src/mailWorker.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/pod-mail-worker/src/mailWorker.ts#L248-L289)). A workspace token and an enabled model plugin are insufficient evidence of send capability.
- **Provider/runtime is deployment state.** The worker requires account, workspace, KVS, queue, communication topic, mail service URL, and mail auth configuration ([`pod-mail-worker/src/config.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/pod-mail-worker/src/config.ts#L19-L76)). None of this is represented by `@hcengineering/mail`.
- **Creating a Huly message is not a delivery acknowledgement.** The worker asynchronously observes communication events, applies date/channel/provider checks, and catches failures after the Huly message already exists ([`pod-mail-worker/src/mailWorker.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/pod-mail-worker/src/mailWorker.ts#L183-L232)).
- **Delivery status is not trustworthy.** The worker's HTTP adapter logs non-2xx responses without throwing ([`pod-mail-worker/src/send.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/pod-mail-worker/src/send.ts#L6-L32)); the mail service logs Nodemailer callback errors and still completes its request handler ([`pod-mail/src/mail.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/pod-mail/src/mail.ts#L47-L60), [`pod-mail/src/main.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/pod-mail/src/main.ts#L79-L140)). No durable sent/error status is written back to the communication message.
- **Outgoing attachments are not wired through the worker path.** Although the low-level mail HTTP endpoint accepts attachments, `sendMessageAsEmail` constructs a `MailMessage` with only from/to/subject/html/text/headers and never reads the communication message's attachments ([`pod-mail-worker/src/mailWorker.ts`](https://github.com/hcengineering/platform/blob/2a985b31e314c0793dd965e5a1d8abe28f262f34/services/mail/pod-mail-worker/src/mailWorker.ts#L263-L289)). An MCP send tool must therefore reject attachments rather than silently drop them.

## Relationship to Gmail and Telegram support

This is a third path, not a replacement for the current provider assessment:

- `@hcengineering/gmail@0.7.0` is installed and exposes legacy Gmail document classes. The existing `list_external_channel_messages` intentionally returns `supported=false` because the workspace cannot prove whether the live deployment writes legacy v1 documents or newer communication records; see `src/huly/operations/external-channel-messages.ts` and `src/domain/schemas/external-channel-messages.ts`. The live probe returned `unsupportedReasonCode: runtime-unverifiable`.
- Telegram likewise remains an explicit `package-incompatible` result because this build has no compatible published Telegram message package.
- `@hcengineering/mail` identifies provider-neutral mail thread cards used by the newer communication pipeline. Its presence does not make legacy Gmail records safe to read, does not establish a provider connection, and does not expose Telegram data.

## Recommended tickets

1. **Implement [#184, read-only `list_mail_threads`](https://github.com/dearlordylord/huly-mcp/issues/184) (small, dependency-ready).** Add exact `@hcengineering/mail@0.7.0` runtime dependencies to both packages; load the CommonJS plugin through the existing plugin boundary; query the `MailThread` mixin and child cards through `card.class.Card` plus `parent`. Filter by human-resolved space name/ID, neutral channel-title search, and limit. Return only schema-owned Card metadata and nested subject summaries, with space IDs paired with names. The outer title may be a normalized replication-recipient email, but the tool must expose it as `channelTitle` and must not infer that it identifies an external correspondent or configured mailbox. Do not emit fixed capability flags and do not present card `content` as an email body.
2. **Add a communication/HulyLake read adapter (blocked on deploy capability).** First expose and parse an authoritative HulyLake URL from server config, add schema-owned boundaries for published communication message/group/attachment payloads, and prove read access with a local deployment that advertises HulyLake. Only then add `list_mail_messages`/`get_mail_message`. Keep this separate from Gmail v1 compatibility.
3. **Do not ticket send/reply as an ordinary MCP CRUD wrapper yet.** It needs a supported mailbox-capability endpoint, an unambiguous sender/mailbox selection contract, worker availability, recipient/subject semantics, and a durable accepted/delivered/failed acknowledgement. Until upstream exposes those, return unsupported rather than claiming success when only a communication event was created.
4. **Keep outgoing attachments out of scope** until the worker forwards communication attachments and reports failures durably.

The actionable outcome for #145 is issue #184 alone, with its deliberately narrow metadata semantics. All broader Mail capabilities stay blocked for this concrete reason: **the published mail package exposes only a card tag, while safe message access requires unavailable communication/HulyLake runtime metadata and safe sending requires unavailable mailbox and delivery acknowledgements.**
