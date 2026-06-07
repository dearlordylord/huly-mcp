import type { CardSpace as HulyCardSpace, MasterTag as HulyMasterTag } from "@hcengineering/card"
import { type Class, ClassifierKind, type Ref, SortingOrder } from "@hcengineering/core"
import { Effect, Either } from "effect"

import {
  MasterTagIdentifier,
  type MasterTagIdentifier as MasterTagIdentifierValue,
  ObjectClassName
} from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { MasterTagNotFoundError } from "../errors.js"
import { decodeHulyModelLabelTail } from "../huly-labels.js"
import { cardPlugin, core } from "../huly-plugins.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { type DirectAncestorRef, directAncestorRefs, type MetadataClassDoc } from "./sdk-discovery-mappers.js"

type CardMasterTagDoc = HulyMasterTag & MetadataClassDoc
type CardClassId = ObjectClassName
type DescendantsByAncestor = ReadonlyMap<CardClassId, ReadonlySet<CardClassId>>
type MutableDescendantsByAncestor = Map<CardClassId, Set<CardClassId>>

// core.class.Class is the SDK class registry; the generic narrows the returned class docs.
// eslint-disable-next-line no-restricted-syntax -- SDK boundary cast for class model queries
const classRef = core.class.Class as Ref<Class<CardMasterTagDoc>>

const cardClassId = (value: DirectAncestorRef | Ref<HulyMasterTag>): CardClassId => ObjectClassName.make(String(value))

const masterTagLookupCandidate = (
  value: HulyMasterTag["label"] | Ref<HulyMasterTag> | string
): MasterTagIdentifierValue => MasterTagIdentifier.make(String(value))

export const masterTagDisplayName = (tag: CardMasterTagDoc): string =>
  Either.getOrElse(
    decodeHulyModelLabelTail(tag.label),
    () => String(tag.label)
  )

const matchesMasterTagIdentifier = (tag: CardMasterTagDoc, identifier: MasterTagIdentifierValue): boolean =>
  masterTagLookupCandidate(tag._id) === identifier
  || masterTagLookupCandidate(tag.label) === identifier
  || masterTagLookupCandidate(masterTagDisplayName(tag)) === identifier

const addDescendant = (
  descendants: MutableDescendantsByAncestor,
  ancestorId: CardClassId,
  childId: CardClassId
): void => {
  const existing = descendants.get(ancestorId) ?? new Set<CardClassId>()
  // Local graph-index state keeps descendant expansion linear; the mutable collections do not escape as mutable types.
  // eslint-disable-next-line functional/immutable-data
  existing.add(childId)
  // eslint-disable-next-line functional/immutable-data
  descendants.set(ancestorId, existing)
}

const buildDescendantsByAncestor = (classes: ReadonlyArray<CardMasterTagDoc>): DescendantsByAncestor => {
  const descendants = new Map<CardClassId, Set<CardClassId>>()
  classes.forEach((tag) => {
    const childId = cardClassId(tag._id)
    directAncestorRefs(tag).forEach((ancestor) => {
      addDescendant(descendants, cardClassId(ancestor), childId)
    })
  })
  return descendants
}

const collectDescendants = (
  rootIds: ReadonlySet<CardClassId>,
  descendantsByAncestor: DescendantsByAncestor
): ReadonlySet<CardClassId> => {
  const visited = new Set<CardClassId>(rootIds)
  const pending = [...rootIds]
  let nextIndex = 0
  while (nextIndex < pending.length) {
    const current = pending[nextIndex]
    const unvisitedChildren = [...(descendantsByAncestor.get(current) ?? [])].filter((childId) => !visited.has(childId))
    unvisitedChildren.forEach((childId) => {
      // Local traversal state keeps descendant expansion linear; the mutable collections do not escape as mutable types.
      // eslint-disable-next-line functional/immutable-data
      visited.add(childId)
      // eslint-disable-next-line functional/immutable-data
      pending.push(childId)
    })
    nextIndex += 1
  }
  return visited
}

export const fetchMasterTagsForSpace = (
  client: HulyClient["Type"],
  cardSpace: HulyCardSpace
): Effect.Effect<ReadonlyArray<CardMasterTagDoc>, HulyClientError> =>
  Effect.gen(function*() {
    const typeRefs = cardSpace.types
    if (typeRefs.length === 0) return []

    const query: StrictDocumentQuery<CardMasterTagDoc> = { kind: ClassifierKind.CLASS }
    const allClasses = yield* client.findAll<CardMasterTagDoc>(
      classRef,
      hulyQuery(query),
      { sort: { _id: SortingOrder.Ascending } }
    )
    const descendantsByAncestor = buildDescendantsByAncestor(allClasses)
    const spaceTypeIds = collectDescendants(new Set(typeRefs.map(cardClassId)), descendantsByAncestor)
    const cardRootIds = collectDescendants(new Set([cardClassId(cardPlugin.class.Card)]), descendantsByAncestor)

    return allClasses.filter((tag) =>
      tag._id !== cardPlugin.class.Card
      && spaceTypeIds.has(cardClassId(tag._id))
      && cardRootIds.has(cardClassId(tag._id))
    )
  })

export const findMasterTag = (
  client: HulyClient["Type"],
  cardSpace: HulyCardSpace,
  identifier: MasterTagIdentifierValue
): Effect.Effect<CardMasterTagDoc, MasterTagNotFoundError | HulyClientError> =>
  Effect.gen(function*() {
    const masterTags = yield* fetchMasterTagsForSpace(client, cardSpace)
    if (masterTags.length === 0) {
      return yield* new MasterTagNotFoundError({
        identifier,
        cardSpace: cardSpace.name
      })
    }

    const masterTag = masterTags.find((tag) => matchesMasterTagIdentifier(tag, identifier))
    if (masterTag !== undefined) return masterTag

    return yield* new MasterTagNotFoundError({
      identifier,
      cardSpace: cardSpace.name
    })
  })
