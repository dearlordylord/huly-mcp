import type { Card as HulyCard } from "@hcengineering/card"
import type { Space } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type {
  ListMailThreadsParams,
  ListMailThreadsResult,
  MailThreadSpace,
  MailThreadSubjectSummary,
  MailThreadSummary
} from "../../domain/schemas/mail.js"
import { MAIL_THREAD_SUBJECT_LIMIT } from "../../domain/schemas/mail.js"
import { CardId, SpaceId, Timestamp } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { SpaceIdentifierAmbiguousError, SpaceNotFoundError } from "../errors.js"
import { HulyError } from "../errors.js"
import { cardPlugin, mail } from "../huly-plugins.js"
import { clampLimit, escapeLikeWildcards, hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"
import { findSpace, type GenericSpace, spaceMapById } from "./spaces-shared.js"

const MailCardProjectionSchema = Schema.Struct({
  _id: CardId,
  space: SpaceId,
  title: Schema.String,
  parent: Schema.optional(Schema.NullOr(CardId)),
  createdOn: Schema.optional(Timestamp),
  modifiedOn: Schema.optional(Timestamp)
})
type MailCardProjection = Schema.Schema.Type<typeof MailCardProjectionSchema>

const MailSpaceProjectionSchema = Schema.Struct({ _id: SpaceId, name: Schema.String })
type MailSpaceProjection = Schema.Schema.Type<typeof MailSpaceProjectionSchema>

type ListMailThreadsError = HulyClientError | HulyError | SpaceIdentifierAmbiguousError | SpaceNotFoundError

const parseMailCard = (input: unknown): Effect.Effect<MailCardProjection, HulyError> =>
  Schema.decodeUnknown(MailCardProjectionSchema)(input).pipe(
    Effect.mapError((cause) => new HulyError({ message: "Huly returned malformed Mail thread card metadata.", cause }))
  )

const parseMailSpace = (input: unknown): Effect.Effect<MailSpaceProjection, HulyError> =>
  Schema.decodeUnknown(MailSpaceProjectionSchema)(input).pipe(
    Effect.mapError((cause) => new HulyError({ message: "Huly returned malformed Mail thread space metadata.", cause }))
  )

const projectTimestamps = (card: MailCardProjection) => ({
  ...(card.createdOn === undefined ? {} : { createdOn: card.createdOn }),
  ...(card.modifiedOn === undefined ? {} : { modifiedOn: card.modifiedOn })
})

const subjectSummary = (card: MailCardProjection): MailThreadSubjectSummary => ({
  id: card._id,
  subject: card.title,
  ...projectTimestamps(card)
})

const resolveSpaces = (
  client: HulyClient["Type"],
  cards: ReadonlyArray<MailCardProjection>,
  selectedSpace?: GenericSpace
): Effect.Effect<ReadonlyMap<SpaceId, MailThreadSpace>, ListMailThreadsError> =>
  selectedSpace === undefined
    ? spaceMapById(
        client,
        cards.map((card) => toRef<Space>(card.space))
      ).pipe(
        Effect.flatMap((spaces) => Effect.forEach(spaces.values(), parseMailSpace)),
        Effect.map(
          (spaces) =>
            new Map(spaces.map((space) => [space._id, { id: space._id, name: space.name } satisfies MailThreadSpace]))
        )
      )
    : parseMailSpace(selectedSpace).pipe(
        Effect.map((space) => new Map([[space._id, { id: space._id, name: space.name } satisfies MailThreadSpace]]))
      )

const requireResolvedSpace = (
  spaces: ReadonlyMap<SpaceId, MailThreadSpace>,
  card: MailCardProjection
): Effect.Effect<MailThreadSpace, HulyError> => {
  const space = spaces.get(card.space)
  return space === undefined
    ? Effect.fail(new HulyError({ message: "Huly Mail thread references a space that could not be resolved." }))
    : Effect.succeed(space)
}

const listSubjects = (
  client: HulyClient["Type"],
  thread: MailCardProjection
): Effect.Effect<Array<MailThreadSubjectSummary>, HulyClientError | HulyError> =>
  client
    .findAll<HulyCard>(cardPlugin.class.Card, hulyQuery<HulyCard>({ parent: toRef<HulyCard>(thread._id) }), {
      limit: MAIL_THREAD_SUBJECT_LIMIT,
      sort: { modifiedOn: SortingOrder.Descending }
    })
    .pipe(
      Effect.flatMap((cards) => Effect.forEach(cards.slice(0, MAIL_THREAD_SUBJECT_LIMIT), parseMailCard)),
      Effect.map((cards) => cards.map(subjectSummary))
    )

export const listMailThreads = (
  params: ListMailThreadsParams
): Effect.Effect<ListMailThreadsResult, ListMailThreadsError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const selectedSpace = params.space === undefined ? undefined : yield* findSpace(client, { space: params.space })

    const query = hulyQuery<HulyCard>({
      ...(selectedSpace === undefined ? {} : { space: selectedSpace._id }),
      ...(params.channelTitleSearch === undefined
        ? {}
        : { title: { $like: `%${escapeLikeWildcards(params.channelTitleSearch)}%` } })
    })

    const rawThreads = yield* client.findAll<HulyCard>(toClassRef<HulyCard>(mail.tag.MailThread), query, {
      limit: clampLimit(params.limit),
      sort: { modifiedOn: SortingOrder.Descending }
    })
    const threads = yield* Effect.forEach(rawThreads, parseMailCard)
    const spaces = yield* resolveSpaces(client, threads, selectedSpace)

    const summaries = yield* Effect.forEach(
      threads,
      (thread): Effect.Effect<MailThreadSummary, ListMailThreadsError> =>
        Effect.gen(function* () {
          const space = yield* requireResolvedSpace(spaces, thread)
          const subjects = yield* listSubjects(client, thread)
          return { id: thread._id, channelTitle: thread.title, space, subjects, ...projectTimestamps(thread) }
        }),
      { concurrency: 8 }
    )

    return { threads: summaries }
  })
