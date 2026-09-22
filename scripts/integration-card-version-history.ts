import type { Card as HulyCard, CardSpace as HulyCardSpace } from "@hcengineering/card"
import type { Data, Doc, Ref, TxOperations, VersionableDoc } from "@hcengineering/core"
import { Console, Effect, Schema } from "effect"
import { createRequire } from "node:module"
import { parseArgs } from "node:util"

import { CardId, CardIdentifier, CardSpaceIdentifier, Count } from "../src/domain/schemas/shared.js"
import { cardPlugin } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toClassRef, toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: core does not expose generateId as an ESM runtime named export under tsx.
const core = require("@hcengineering/core") as typeof import("@hcengineering/core")

type VersionableCardDoc = HulyCard & VersionableDoc

const MAX_ADDITIONAL_VERSIONS = 60
const NODE_ARGUMENT_OFFSET = 2

const AdditionalVersionCount = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt(), Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAX_ADDITIONAL_VERSIONS))
)

const CliArgsSchema = Schema.Union([
  Schema.Struct({
    mode: Schema.Literal("setup"),
    cardSpace: CardSpaceIdentifier,
    card: CardIdentifier,
    additionalVersions: AdditionalVersionCount
  }),
  Schema.Struct({ mode: Schema.Literal("cleanup"), cardSpace: CardSpaceIdentifier, baseId: CardId }),
  Schema.Struct({ mode: Schema.Literal("strip"), cardSpace: CardSpaceIdentifier, card: CardIdentifier })
])
const SetupResultSchema = Schema.Struct({ baseId: CardId, versionIds: Schema.Array(CardId), total: Count })
const CleanupResultSchema = Schema.Struct({ removed: Count })
const StripResultSchema = Schema.Struct({ cardId: CardId })

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>

const parseCliArgs = (): CliArgs =>
  Schema.decodeUnknownSync(CliArgsSchema)(
    parseArgs({
      args: process.argv.slice(NODE_ARGUMENT_OFFSET),
      options: {
        mode: { type: "string" },
        cardSpace: { type: "string" },
        card: { type: "string" },
        baseId: { type: "string" },
        additionalVersions: { type: "string" }
      }
    }).values
  )

const findCardSpace = async (client: TxOperations, identifier: CardSpaceIdentifier): Promise<HulyCardSpace> => {
  const cardSpace =
    (await client.findOne<HulyCardSpace>(cardPlugin.class.CardSpace, hulyQuery<HulyCardSpace>({ name: identifier }))) ??
    (await client.findOne<HulyCardSpace>(
      cardPlugin.class.CardSpace,
      hulyQuery<HulyCardSpace>({ _id: toRef<HulyCardSpace>(identifier) })
    ))
  if (cardSpace === undefined) throw new Error(`Card space '${identifier}' not found.`)
  return cardSpace
}

const findCard = async (
  client: TxOperations,
  cardSpace: HulyCardSpace,
  identifier: CardIdentifier
): Promise<HulyCard> => {
  const card = await client.findOne<HulyCard>(
    cardPlugin.class.Card,
    hulyQuery<HulyCard>({ space: cardSpace._id, _id: toRef<HulyCard>(identifier) })
  )
  if (card === undefined) throw new Error(`Card '${identifier}' not found.`)
  return card
}

const versionData = (source: HulyCard, baseId: Ref<Doc>): Data<VersionableCardDoc> => ({
  title: source.title,
  content: source.content,
  blobs: source.blobs,
  parentInfo: source.parentInfo,
  parent: source.parent ?? null,
  rank: source.rank,
  baseId
})

const setup = async (
  client: TxOperations,
  args: Extract<CliArgs, { readonly mode: "setup" }>
): Promise<Schema.Schema.Type<typeof SetupResultSchema>> => {
  const cardSpace = await findCardSpace(client, args.cardSpace)
  const base = await findCard(client, cardSpace, args.card)
  const baseId = CardId.make(base._id)
  const versionIds: Array<CardId> = []

  for (let index = 0; index < args.additionalVersions; index += 1) {
    const versionId = core.generateId<VersionableCardDoc>()
    await client.createDoc<VersionableCardDoc>(
      toClassRef<VersionableCardDoc>(base._class),
      cardSpace._id,
      versionData(base, toRef<Doc>(baseId)),
      versionId
    )
    versionIds.push(CardId.make(versionId))
  }

  return { baseId, versionIds, total: Count.make(versionIds.length + 1) }
}

const cleanup = async (
  client: TxOperations,
  args: Extract<CliArgs, { readonly mode: "cleanup" }>
): Promise<Schema.Schema.Type<typeof CleanupResultSchema>> => {
  const cardSpace = await findCardSpace(client, args.cardSpace)
  const cards = await client.findAll<VersionableCardDoc>(
    toClassRef<VersionableCardDoc>(cardPlugin.class.Card),
    hulyQuery<VersionableCardDoc>({ space: cardSpace._id, baseId: toRef<Doc>(args.baseId) })
  )
  for (const card of cards) {
    await client.removeDoc(card._class, card.space, card._id)
  }
  return { removed: Count.make(cards.length) }
}

const stripVersionMetadata = async (
  client: TxOperations,
  args: Extract<CliArgs, { readonly mode: "strip" }>
): Promise<Schema.Schema.Type<typeof StripResultSchema>> => {
  const cardSpace = await findCardSpace(client, args.cardSpace)
  const card = await findCard(client, cardSpace, args.card)
  await client.updateDoc<VersionableCardDoc>(
    toClassRef<VersionableCardDoc>(card._class),
    card.space,
    toRef<VersionableCardDoc>(card._id),
    { $unset: { baseId: true, version: true, isLatest: true, readonly: true } }
  )
  return { cardId: CardId.make(card._id) }
}

const main = async (): Promise<string> => {
  const args = parseCliArgs()
  const { client } = await connectIntegrationHuly()
  try {
    switch (args.mode) {
      case "setup":
        return JSON.stringify(Schema.encodeUnknownSync(SetupResultSchema)(await setup(client, args)))
      case "cleanup":
        return JSON.stringify(Schema.encodeUnknownSync(CleanupResultSchema)(await cleanup(client, args)))
      case "strip":
        return JSON.stringify(Schema.encodeUnknownSync(StripResultSchema)(await stripVersionMetadata(client, args)))
    }
  } finally {
    await client.close()
  }
}

void main().then(
  async (output) => {
    await Effect.runPromise(Console.log(output))
  },
  async (cause) => {
    await Effect.runPromise(Console.error(cause))
    // eslint-disable-next-line functional/immutable-data -- process exit status is the script boundary.
    process.exitCode = 1
  }
)
