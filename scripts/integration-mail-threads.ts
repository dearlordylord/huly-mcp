import type { Card as HulyCard, CardSpace as HulyCardSpace, MasterTag } from "@hcengineering/card"
import type { Blob, Data, Ref, TxOperations } from "@hcengineering/core"
import { Schema } from "effect"
import { createRequire } from "node:module"
import { parseArgs } from "node:util"

import { CardId, NonEmptyString, SpaceId } from "../src/domain/schemas/shared.js"
import { cardPlugin, mail } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toClassRef, toMixinRef, toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS runtime boundary for SDK helpers unavailable as reliable ESM named exports under tsx.
const core = require("@hcengineering/core") as typeof import("@hcengineering/core")
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS runtime boundary for rank helpers under the integration tsx runner.
const rank = require("@hcengineering/rank") as typeof import("@hcengineering/rank")

const NODE_ARGUMENT_OFFSET = 2
const CliArgsSchema = Schema.Union(
  Schema.Struct({ mode: Schema.Literal("setup"), runId: NonEmptyString }),
  Schema.Struct({ mode: Schema.Literal("cleanup"), outerId: CardId, childId: CardId })
)
const SetupResultSchema = Schema.Struct({
  outerId: CardId,
  childId: CardId,
  channelTitle: NonEmptyString,
  subject: NonEmptyString,
  spaceId: SpaceId,
  spaceName: NonEmptyString
})
const CleanupResultSchema = Schema.Struct({ removed: Schema.Array(CardId) })
type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>

const parseCliArgs = (): CliArgs =>
  Schema.decodeUnknownSync(CliArgsSchema)(
    parseArgs({
      args: process.argv.slice(NODE_ARGUMENT_OFFSET),
      options: {
        mode: { type: "string" },
        runId: { type: "string" },
        outerId: { type: "string" },
        childId: { type: "string" }
      }
    }).values
  )

const defaultCardSpace = async (client: TxOperations): Promise<HulyCardSpace> => {
  const space = await client.findOne<HulyCardSpace>(
    cardPlugin.class.CardSpace,
    hulyQuery<HulyCardSpace>({ _id: cardPlugin.space.Default })
  )
  if (space === undefined) throw new Error("Default Card space is unavailable for the Mail integration fixture.")
  return space
}

const cardData = (
  title: string,
  content: Ref<Blob>,
  rankValue: HulyCard["rank"],
  parent?: Pick<HulyCard, "_class" | "_id" | "parentInfo" | "title">
): Data<HulyCard> => ({
  title,
  content,
  blobs: {},
  parentInfo:
    parent === undefined ? [] : [...parent.parentInfo, { _id: parent._id, _class: parent._class, title: parent.title }],
  parent: parent?._id ?? null,
  rank: rankValue
})

const removeIfPresent = async (client: TxOperations, id: CardId): Promise<boolean> => {
  const card = await client.findOne<HulyCard>(cardPlugin.class.Card, hulyQuery<HulyCard>({ _id: toRef<HulyCard>(id) }))
  if (card === undefined) return false
  await client.removeDoc(toClassRef<HulyCard>(card._class), card.space, card._id)
  return true
}

const cleanup = async (
  client: TxOperations,
  args: Extract<CliArgs, { readonly mode: "cleanup" }>
): Promise<Schema.Schema.Type<typeof CleanupResultSchema>> => {
  const removed: Array<CardId> = []
  if (await removeIfPresent(client, args.childId)) removed.push(args.childId)
  if (await removeIfPresent(client, args.outerId)) removed.push(args.outerId)
  return { removed }
}

const setup = async (
  client: TxOperations,
  args: Extract<CliArgs, { readonly mode: "setup" }>
): Promise<Schema.Schema.Type<typeof SetupResultSchema>> => {
  const space = await defaultCardSpace(client)
  const cardClass = client.getHierarchy().getBaseClass(toMixinRef<HulyCard>(mail.tag.MailThread))
  const masterTag = toRef<MasterTag>(String(cardClass))
  const channelTitle = NonEmptyString.make(`mcp-mail-channel-${args.runId}@example.invalid`)
  const subject = NonEmptyString.make(`MCP Mail subject ${args.runId}`)
  const outerId = CardId.make(core.generateId<HulyCard>())
  const childId = CardId.make(core.generateId<HulyCard>())
  const content = core.generateId<Blob>()
  const outerRank = rank.makeRank(undefined, undefined)

  try {
    await client.createDoc(cardClass, space._id, cardData(channelTitle, content, outerRank), toRef<HulyCard>(outerId))
    await client.createMixin(toRef<HulyCard>(outerId), cardClass, space._id, mail.tag.MailThread, {})
    const outer = { _id: toRef<HulyCard>(outerId), _class: masterTag, parentInfo: [], title: channelTitle }

    await client.createDoc(
      cardClass,
      space._id,
      cardData(subject, content, rank.makeRank(outerRank, undefined), outer),
      toRef<HulyCard>(childId)
    )
    return {
      outerId,
      childId,
      channelTitle,
      subject,
      spaceId: SpaceId.make(space._id),
      spaceName: NonEmptyString.make(space.name)
    }
  } catch (cause) {
    await client.removeDoc(cardClass, space._id, toRef<HulyCard>(childId)).catch(() => undefined)
    await client.removeDoc(cardClass, space._id, toRef<HulyCard>(outerId)).catch(() => undefined)
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
