import type { Card as HulyCard, CardSpace as HulyCardSpace } from "@hcengineering/card"
import type { ChatMessage } from "@hcengineering/chunter"
import type { Ref, TxOperations } from "@hcengineering/core"
import { Console, Effect, Schema } from "effect"
import { createRequire } from "node:module"
import { parseArgs } from "node:util"

import { CardIdentifier, CardSpaceIdentifier, CommentId, NonEmptyString } from "../src/domain/schemas/shared.js"
import { cardPlugin, chunter } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: core does not expose generateId as an ESM runtime named export under tsx.
const core = require("@hcengineering/core") as typeof import("@hcengineering/core")
// eslint-disable-next-line @typescript-eslint/consistent-type-imports, no-restricted-syntax -- CJS interop boundary: text does not expose stable ESM runtime named exports under tsx.
const text = require("@hcengineering/text") as typeof import("@hcengineering/text")

const CliArgsSchema = Schema.Struct({ cardSpace: CardSpaceIdentifier, card: CardIdentifier, body: NonEmptyString })
const ResultSchema = Schema.Struct({ commentId: CommentId })
const IntegrationOperation = Schema.Literals([
  "add-comment",
  "close-client",
  "connect-client",
  "find-card",
  "find-card-space"
])

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>
type IntegrationOperation = Schema.Schema.Type<typeof IntegrationOperation>

class CliInputError extends Schema.TaggedError<CliInputError>()("CliInputError", { cause: Schema.Defect() }) {}

class IntegrationOperationError extends Schema.TaggedError<IntegrationOperationError>()("IntegrationOperationError", {
  operation: IntegrationOperation,
  cause: Schema.Defect()
}) {}

class IntegrationCardSpaceNotFoundError extends Schema.TaggedError<IntegrationCardSpaceNotFoundError>()(
  "IntegrationCardSpaceNotFoundError",
  { cardSpace: CardSpaceIdentifier }
) {}

class IntegrationCardNotFoundError extends Schema.TaggedError<IntegrationCardNotFoundError>()(
  "IntegrationCardNotFoundError",
  { cardSpace: CardSpaceIdentifier, card: CardIdentifier }
) {}

const NODE_ARGV_OFFSET = 2

const integrationOperation = <A>(
  operation: IntegrationOperation,
  run: () => PromiseLike<A>
): Effect.Effect<A, IntegrationOperationError> =>
  Effect.tryPromise({ try: run, catch: (cause) => new IntegrationOperationError({ operation, cause }) })

const parseCliArgs = (): Effect.Effect<CliArgs, CliInputError> =>
  Effect.try({
    try: () =>
      parseArgs({
        args: process.argv.slice(NODE_ARGV_OFFSET),
        options: { cardSpace: { type: "string" }, card: { type: "string" }, body: { type: "string" } }
      }).values,
    catch: (cause) => new CliInputError({ cause })
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(CliArgsSchema)),
    Effect.mapError((cause) => (cause instanceof CliInputError ? cause : new CliInputError({ cause })))
  )

const findCardSpace = (
  client: TxOperations,
  identifier: CardSpaceIdentifier
): Effect.Effect<HulyCardSpace, IntegrationCardSpaceNotFoundError | IntegrationOperationError> =>
  integrationOperation(
    "find-card-space",
    async () =>
      (await client.findOne<HulyCardSpace>(
        cardPlugin.class.CardSpace,
        hulyQuery<HulyCardSpace>({ name: identifier })
      )) ??
      (await client.findOne<HulyCardSpace>(
        cardPlugin.class.CardSpace,
        hulyQuery<HulyCardSpace>({ _id: toRef<HulyCardSpace>(identifier) })
      ))
  ).pipe(
    Effect.flatMap((cardSpace) =>
      cardSpace === undefined
        ? Effect.fail(new IntegrationCardSpaceNotFoundError({ cardSpace: identifier }))
        : Effect.succeed(cardSpace)
    )
  )

const findCard = (
  client: TxOperations,
  cardSpace: HulyCardSpace,
  args: CliArgs
): Effect.Effect<HulyCard, IntegrationCardNotFoundError | IntegrationOperationError> =>
  integrationOperation(
    "find-card",
    async () =>
      (await client.findOne<HulyCard>(
        cardPlugin.class.Card,
        hulyQuery<HulyCard>({ space: cardSpace._id, title: args.card })
      )) ??
      (await client.findOne<HulyCard>(
        cardPlugin.class.Card,
        hulyQuery<HulyCard>({ space: cardSpace._id, _id: toRef<HulyCard>(args.card) })
      ))
  ).pipe(
    Effect.flatMap((card) =>
      card === undefined
        ? Effect.fail(new IntegrationCardNotFoundError({ cardSpace: args.cardSpace, card: args.card }))
        : Effect.succeed(card)
    )
  )

const addNativeComment = (
  client: TxOperations,
  args: CliArgs
): Effect.Effect<
  CommentId,
  IntegrationCardNotFoundError | IntegrationCardSpaceNotFoundError | IntegrationOperationError
> =>
  Effect.gen(function* () {
    const cardSpace = yield* findCardSpace(client, args.cardSpace)
    const card = yield* findCard(client, cardSpace, args)
    const commentId: Ref<ChatMessage> = core.generateId()
    const message = text.jsonToMarkup({
      type: text.MarkupNodeType.doc,
      content: [{ type: text.MarkupNodeType.paragraph, content: [{ type: text.MarkupNodeType.text, text: args.body }] }]
    })
    yield* integrationOperation("add-comment", () =>
      client.addCollection(
        chunter.class.ChatMessage,
        card.space,
        card._id,
        card._class,
        "comments",
        { message },
        commentId
      )
    )
    return CommentId.make(commentId)
  })

const main = Effect.gen(function* () {
  const args = yield* parseCliArgs()
  return yield* Effect.acquireUseRelease(
    integrationOperation("connect-client", connectIntegrationHuly),
    ({ client }) => addNativeComment(client, args),
    ({ client }) => integrationOperation("close-client", () => client.close()).pipe(Effect.orDie)
  )
})

Effect.runPromise(main).then(
  async (commentId) => {
    await Effect.runPromise(Console.log(JSON.stringify(Schema.encodeSync(ResultSchema)({ commentId }))))
  },
  async (error: unknown) => {
    await Effect.runPromise(Console.error(error instanceof Error ? (error.stack ?? error.message) : String(error)))
    process.exitCode = 1
  }
)
