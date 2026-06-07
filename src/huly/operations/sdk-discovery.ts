import type { AnyAttribute, Class, Enum as HulyEnum, Obj, Ref } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Array as Arr, Effect, Either, Option } from "effect"

import type {
  GetHulyClassParams,
  GetHulyClassResult,
  ListHulyAttributesParams,
  ListHulyAttributesResult,
  ListHulyClassesParams,
  ListHulyClassesResult,
  ListHulyEnumsParams,
  ListHulyEnumsResult
} from "../../domain/schemas/sdk-discovery.js"
import { HulyDiscoveryCount, SDK_DISCOVERY_DEFAULT_LIMIT } from "../../domain/schemas/sdk-discovery.js"
import { NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { HulyClassNotFoundError } from "../errors-sdk-discovery.js"
import { decodeHulyModelLabelTail } from "../huly-labels.js"
import { core } from "../huly-plugins.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"
import {
  attributeSearchText,
  classSearchText,
  type DirectAncestorRef,
  directAncestorRefs,
  encodeClassifierKindFilter,
  enumSearchText,
  type MetadataClassDoc,
  toAttributeSummary,
  toClassSummary,
  toEnumSummary
} from "./sdk-discovery-mappers.js"

type SdkDiscoveryError = HulyClientError | HulyClassNotFoundError

const MAX_ANCESTOR_DEPTH = 32

// Huly plugin constants are compatible with Ref<Class<MetadataClassDoc>> at runtime; the SDK type is narrower.
// eslint-disable-next-line no-restricted-syntax -- SDK boundary cast for class model queries
const classRef = core.class.Class as Ref<Class<MetadataClassDoc>>

const includesQuery = (text: string, query: Option.Option<string>): boolean =>
  Option.isNone(query) || text.includes(query.value.toLowerCase())

const batchResolveClassLabels = (
  client: HulyClient["Type"],
  classIds: ReadonlyArray<ObjectClassName>
): Effect.Effect<Map<ObjectClassName, NonEmptyString>, HulyClientError> =>
  Effect.gen(function*() {
    if (classIds.length === 0) return new Map()

    const uniqueIds = [...new Set(classIds)]
    const classes = yield* client.findAll<MetadataClassDoc>(
      classRef,
      hulyQuery<MetadataClassDoc>({ _id: { $in: uniqueIds.map(toRef<MetadataClassDoc>) } })
    )

    const modelEntries = classes.map((cls) => {
      const classId = ObjectClassName.make(String(cls._id))
      const label = Either.getOrElse(
        decodeHulyModelLabelTail(cls.label),
        () => NonEmptyString.make(String(cls._id))
      )
      return [classId, label] as const
    })
    const modelLabels = new Map<ObjectClassName, NonEmptyString>(modelEntries)
    const fallbackEntries = uniqueIds
      .filter((classId) => !modelLabels.has(classId))
      .map((classId) => [classId, NonEmptyString.make(classId)] as const)

    return new Map<ObjectClassName, NonEmptyString>([...modelEntries, ...fallbackEntries])
  })

// `batchResolveClassLabels` returns a label for every requested owner id (a decoded model label,
// or an id fallback when the class is absent from the model). Callers only ever look up owner ids
// drawn from that same requested set, so the nullish branch below is a type-guard for `Map.get`'s
// `| undefined` return and is unreachable at runtime.
const ownerLabelOrId = (
  labels: ReadonlyMap<ObjectClassName, NonEmptyString>,
  ownerClassId: ObjectClassName
): NonEmptyString => {
  const label = labels.get(ownerClassId)
  /* v8 ignore start -- unreachable: every owner id is a key in the resolved label map */
  if (label === undefined) return NonEmptyString.make(ownerClassId)
  /* v8 ignore stop */
  return label
}

const countAttributesByClass = (
  attributes: ReadonlyArray<AnyAttribute>
): Map<ObjectClassName, number> => {
  const grouped = Arr.groupBy(attributes, (attr) => String(attr.attributeOf))
  return new Map(
    Object.entries(grouped).map(([ownerClassId, group]) => [ObjectClassName.make(ownerClassId), group.length] as const)
  )
}

const fetchClasses = (
  client: HulyClient["Type"],
  params: ListHulyClassesParams
): Effect.Effect<ReadonlyArray<MetadataClassDoc>, HulyClientError> => {
  const kind = params.kind === undefined ? Option.none() : encodeClassifierKindFilter(params.kind)
  const query: StrictDocumentQuery<MetadataClassDoc> = {
    ...(Option.isSome(kind) ? { kind: kind.value } : {}),
    ...(params.domain === undefined ? {} : { domain: params.domain })
  }

  return client.findAll<MetadataClassDoc>(
    classRef,
    hulyQuery(query),
    { sort: { _id: SortingOrder.Ascending } }
  )
}

const fetchAttributes = (
  client: HulyClient["Type"],
  params: ListHulyAttributesParams
): Effect.Effect<ReadonlyArray<AnyAttribute>, HulyClientError> => {
  const query: StrictDocumentQuery<AnyAttribute> = {
    ...(params.class === undefined ? {} : { attributeOf: toRef<Class<Obj>>(params.class) }),
    ...(params.customOnly === true ? { isCustom: true } : {})
  }

  return client.findAll<AnyAttribute>(
    core.class.Attribute,
    hulyQuery(query),
    { sort: { name: SortingOrder.Ascending } }
  )
}

const resolveClass = (
  client: HulyClient["Type"],
  classId: ObjectClassName
): Effect.Effect<MetadataClassDoc, SdkDiscoveryError> =>
  Effect.gen(function*() {
    const cls = yield* client.findOne<MetadataClassDoc>(
      classRef,
      hulyQuery<MetadataClassDoc>({ _id: toRef<MetadataClassDoc>(classId) })
    )
    if (cls === undefined) {
      return yield* new HulyClassNotFoundError({ classId })
    }
    return cls
  })

const loadAncestorDocs = (
  client: HulyClient["Type"],
  frontier: ReadonlyArray<string>,
  resolved: ReadonlyMap<string, MetadataClassDoc>,
  depth: number
): Effect.Effect<ReadonlyMap<string, MetadataClassDoc>, HulyClientError> =>
  Effect.gen(function*() {
    const pending = [...new Set(frontier)].filter((id) => !resolved.has(id))
    if (pending.length === 0 || depth >= MAX_ANCESTOR_DEPTH) return resolved

    const fetched = yield* client.findAll<MetadataClassDoc>(
      classRef,
      hulyQuery<MetadataClassDoc>({ _id: { $in: pending.map(toRef<MetadataClassDoc>) } })
    )
    const nextResolved = new Map<string, MetadataClassDoc>([
      ...resolved,
      ...fetched.map((doc) => [String(doc._id), doc] as const)
    ])
    const nextFrontier = fetched.flatMap((doc) => directAncestorRefs(doc).map(String))
    return yield* loadAncestorDocs(client, nextFrontier, nextResolved, depth + 1)
  })

const resolveAncestors = (
  client: HulyClient["Type"],
  cls: MetadataClassDoc
): Effect.Effect<ReadonlyArray<MetadataClassDoc>, SdkDiscoveryError> =>
  Effect.gen(function*() {
    // Phase 1: breadth-first batch-load every reachable ancestor in one findAll per depth level,
    // rather than a sequential findOne per ancestor.
    const docs = yield* loadAncestorDocs(client, directAncestorRefs(cls).map(String), new Map(), 0)

    // Phase 2: rebuild the original depth-first, cycle-safe ancestor order from the in-memory docs.
    // A ref genuinely absent from the model surfaces the same HulyClassNotFoundError the sequential
    // resolver produced.
    const collect = (
      nextRefs: ReadonlyArray<DirectAncestorRef>,
      visited: ReadonlySet<string>,
      depth: number
    ): Effect.Effect<ReadonlyArray<MetadataClassDoc>, SdkDiscoveryError> =>
      Effect.gen(function*() {
        if (nextRefs.length === 0 || depth >= MAX_ANCESTOR_DEPTH) return []

        const [next, ...tail] = nextRefs
        if (visited.has(String(next))) return yield* collect(tail, visited, depth)

        const parent = docs.get(String(next))
        if (parent === undefined) {
          return yield* new HulyClassNotFoundError({ classId: ObjectClassName.make(String(next)) })
        }
        const nextVisited = new Set([...visited, String(next)])
        const parentAncestors = yield* collect(directAncestorRefs(parent), nextVisited, depth + 1)
        const siblingAncestors = yield* collect(
          tail,
          new Set([...nextVisited, ...parentAncestors.map((ancestor) => String(ancestor._id))]),
          depth
        )
        return [parent, ...parentAncestors, ...siblingAncestors]
      })

    return yield* collect(directAncestorRefs(cls), new Set(), 0)
  })

const attributesForClasses = (
  client: HulyClient["Type"],
  classIds: ReadonlyArray<ObjectClassName>
): Effect.Effect<ReadonlyArray<AnyAttribute>, HulyClientError> =>
  classIds.length === 0
    ? Effect.succeed([])
    : client.findAll<AnyAttribute>(
      core.class.Attribute,
      hulyQuery<AnyAttribute>({ attributeOf: { $in: classIds.map(toRef<Class<Obj>>) } }),
      { sort: { name: SortingOrder.Ascending } }
    )

export const listHulyClasses = (
  params: ListHulyClassesParams
): Effect.Effect<ListHulyClassesResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit ?? SDK_DISCOVERY_DEFAULT_LIMIT)
    const query = Option.fromNullable(params.query)
    const classes = yield* fetchClasses(client, params)

    const matched = classes
      .map((cls) => toClassSummary(cls))
      .filter((summary) => params.kind === undefined || summary.kind === params.kind)
      .filter((summary) => includesQuery(classSearchText(summary), query))
      .slice(0, limit)

    // Count attributes only for the classes that survive filtering and the limit, rather than
    // loading the entire attribute model on every call.
    const attributeCounts = countAttributesByClass(
      yield* attributesForClasses(client, matched.map((summary) => summary.classId))
    )
    const summaries = matched.map((summary) => ({
      ...summary,
      attributesCount: HulyDiscoveryCount.make(attributeCounts.get(summary.classId) ?? 0)
    }))

    return { classes: summaries, total: HulyDiscoveryCount.make(summaries.length) }
  })

export const getHulyClass = (
  params: GetHulyClassParams
): Effect.Effect<GetHulyClassResult, SdkDiscoveryError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const includeInheritedAttributes = params.includeInheritedAttributes ?? true
    const cls = yield* resolveClass(client, params.class)
    const ancestors = yield* resolveAncestors(client, cls)
    const ancestorIds = ancestors.map((ancestor) => ObjectClassName.make(String(ancestor._id)))
    const summaryClassIds = [params.class, ...ancestorIds]
    const attributeClassIds = includeInheritedAttributes ? summaryClassIds : [params.class]
    const rawAttributes = yield* attributesForClasses(client, attributeClassIds)
    const summaryAttributes = includeInheritedAttributes
      ? rawAttributes
      : yield* attributesForClasses(client, summaryClassIds)
    const labels = yield* batchResolveClassLabels(client, attributeClassIds)
    const attributeCounts = countAttributesByClass(summaryAttributes)

    return {
      class: toClassSummary(cls, attributeCounts.get(params.class) ?? 0),
      ancestors: ancestors.map((ancestor) =>
        toClassSummary(
          ancestor,
          attributeCounts.get(ObjectClassName.make(String(ancestor._id))) ?? 0
        )
      ),
      attributes: rawAttributes.map((attr) => {
        const ownerClassId = ObjectClassName.make(String(attr.attributeOf))
        return toAttributeSummary(attr, ownerLabelOrId(labels, ownerClassId), params.class)
      })
    }
  })

export const listHulyAttributes = (
  params: ListHulyAttributesParams
): Effect.Effect<ListHulyAttributesResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit ?? SDK_DISCOVERY_DEFAULT_LIMIT)
    const query = Option.fromNullable(params.query)
    const rawAttributes = yield* fetchAttributes(client, params)
    const ownerClassIds = [...new Set(rawAttributes.map((attr) => ObjectClassName.make(String(attr.attributeOf))))]
    const labels = yield* batchResolveClassLabels(client, ownerClassIds)

    const attributes = rawAttributes
      .map((attr) => {
        const ownerClassId = ObjectClassName.make(String(attr.attributeOf))
        return toAttributeSummary(attr, ownerLabelOrId(labels, ownerClassId), params.class)
      })
      .filter((attr) => includesQuery(attributeSearchText(attr), query))
      .slice(0, limit)

    return { attributes, total: HulyDiscoveryCount.make(attributes.length) }
  })

export const listHulyEnums = (
  params: ListHulyEnumsParams
): Effect.Effect<ListHulyEnumsResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const limit = clampLimit(params.limit ?? SDK_DISCOVERY_DEFAULT_LIMIT)
    const queryText = Option.fromNullable(params.query)
    const query: StrictDocumentQuery<HulyEnum> = {
      ...(params.enum === undefined ? {} : { _id: toRef<HulyEnum>(params.enum) })
    }

    const rawEnums = yield* client.findAll<HulyEnum>(
      core.class.Enum,
      hulyQuery(query),
      { sort: { name: SortingOrder.Ascending } }
    )

    const enums = rawEnums
      .map(toEnumSummary)
      .filter((summary) => includesQuery(enumSearchText(summary), queryText))
      .slice(0, limit)

    return { enums, total: HulyDiscoveryCount.make(enums.length) }
  })
