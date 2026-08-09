import type { Channel, Person } from "@hcengineering/contact"
import type { AttachedData, TxOperations } from "@hcengineering/core"
import type { TelegramMessage } from "@hcengineering/telegram"
import { Schema } from "effect"
import { createRequire } from "node:module"
import { parseArgs } from "node:util"

import { ChannelId, MessageId, NonEmptyString } from "../src/domain/schemas/shared.js"
import { contact, telegram } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS runtime boundary for SDK ID generation under the integration tsx runner.
const core = require("@hcengineering/core") as typeof import("@hcengineering/core")
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS runtime boundary for integration-fixture Huly markup encoding under tsx.
const text = require("@hcengineering/text") as typeof import("@hcengineering/text")

const NODE_ARGUMENT_OFFSET = 2
const CliArgsSchema = Schema.Union(
  Schema.Struct({ mode: Schema.Literal("setup"), runId: NonEmptyString }),
  Schema.Struct({ mode: Schema.Literal("cleanup"), channelId: ChannelId, messageId: MessageId })
)
const SetupResultSchema = Schema.Struct({
  channelId: ChannelId,
  channelValue: NonEmptyString,
  messageId: MessageId,
  contentMarkdown: NonEmptyString
})
const CleanupResultSchema = Schema.Struct({ removed: Schema.Array(Schema.Union(ChannelId, MessageId)) })
type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>

const parseCliArgs = (): CliArgs =>
  Schema.decodeUnknownSync(CliArgsSchema)(
    parseArgs({
      args: process.argv.slice(NODE_ARGUMENT_OFFSET),
      options: {
        mode: { type: "string" },
        runId: { type: "string" },
        channelId: { type: "string" },
        messageId: { type: "string" }
      }
    }).values
  )

const removeMessage = async (client: TxOperations, id: MessageId): Promise<boolean> => {
  const message = await client.findOne<TelegramMessage>(
    telegram.class.Message,
    hulyQuery<TelegramMessage>({ _id: toRef<TelegramMessage>(id) })
  )
  if (message === undefined) return false
  await client.removeCollection<Channel, TelegramMessage>(
    telegram.class.Message,
    message.space,
    message._id,
    message.attachedTo,
    contact.class.Channel,
    "items"
  )
  return true
}

const removeChannel = async (client: TxOperations, id: ChannelId): Promise<boolean> => {
  const channel = await client.findOne<Channel>(contact.class.Channel, hulyQuery<Channel>({ _id: toRef<Channel>(id) }))
  if (channel === undefined) return false
  await client.removeCollection<Person, Channel>(
    contact.class.Channel,
    channel.space,
    channel._id,
    toRef<Person>(channel.attachedTo),
    contact.class.Person,
    "channels"
  )
  return true
}

const cleanup = async (
  client: TxOperations,
  args: Extract<CliArgs, { readonly mode: "cleanup" }>
): Promise<Schema.Schema.Type<typeof CleanupResultSchema>> => {
  const removed: Array<ChannelId | MessageId> = []
  if (await removeMessage(client, args.messageId)) removed.push(args.messageId)
  if (await removeChannel(client, args.channelId)) removed.push(args.channelId)
  return { removed }
}

const setup = async (
  client: TxOperations,
  args: Extract<CliArgs, { readonly mode: "setup" }>
): Promise<Schema.Schema.Type<typeof SetupResultSchema>> => {
  const owner = await client.findOne<Person>(contact.class.Person, hulyQuery<Person>({}))
  if (owner === undefined) throw new Error("A contact Person is required for the Telegram integration fixture.")

  const channelId = ChannelId.make(core.generateId<Channel>())
  const messageId = MessageId.make(core.generateId<TelegramMessage>())
  const channelValue = NonEmptyString.make(`mcp-telegram-${args.runId}`)
  const contentMarkdown = NonEmptyString.make(`Telegram fixture ${args.runId}`)
  const messageData: AttachedData<TelegramMessage> = {
    content: text.jsonToMarkup({
      type: text.MarkupNodeType.doc,
      content: [
        { type: text.MarkupNodeType.paragraph, content: [{ type: text.MarkupNodeType.text, text: contentMarkdown }] }
      ]
    }),
    incoming: true,
    sendOn: 1,
    attachments: 0
  }

  try {
    await client.addCollection<Person, Channel>(
      contact.class.Channel,
      owner.space,
      owner._id,
      contact.class.Person,
      "channels",
      { provider: contact.channelProvider.Telegram, value: channelValue },
      toRef<Channel>(channelId)
    )
    await client.addCollection<Channel, TelegramMessage>(
      telegram.class.Message,
      owner.space,
      toRef<Channel>(channelId),
      contact.class.Channel,
      "items",
      messageData,
      toRef<TelegramMessage>(messageId)
    )
    return { channelId, channelValue, messageId, contentMarkdown }
  } catch (cause) {
    await removeMessage(client, messageId).catch(() => undefined)
    await removeChannel(client, channelId).catch(() => undefined)
    throw cause
  }
}

const main = async (): Promise<string> => {
  const args = parseCliArgs()
  const { client } = await connectIntegrationHuly()
  try {
    return args.mode === "setup"
      ? JSON.stringify(Schema.encodeUnknownSync(SetupResultSchema)(await setup(client, args)))
      : JSON.stringify(Schema.encodeUnknownSync(CleanupResultSchema)(await cleanup(client, args)))
  } finally {
    await client.close()
  }
}

void main().then(
  (output) => {
    // eslint-disable-next-line no-console -- stdout is this integration helper's JSON result boundary.
    console.log(output)
  },
  (cause) => {
    // eslint-disable-next-line no-console -- stderr is this integration helper's failure boundary.
    console.error(cause)
    // eslint-disable-next-line functional/immutable-data -- process exit status is the script boundary.
    process.exitCode = 1
  }
)
