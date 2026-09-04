import { createHash } from "node:crypto"

import { Effect } from "effect"

import {
  type MergePeopleParams,
  type MergePeopleResult,
  type PersonMergeBaseUnmigrated,
  type PersonMergeBlockedUnmigrated,
  type PersonMergeFinalAccountAction,
  type PersonMergeImpact,
  type PersonMergePreflightAccountAction,
  PersonMergePreflightToken,
  type PersonMergeRecord,
  type PersonMergeReferenceCategory,
  type PersonMergeReferenceImpact,
  PersonMergeUnmigratedSchema
} from "../../domain/schemas/person-merge.js"
import { Count, PersonId, PersonName, SpaceId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  HulyDataInvalidError,
  type PersonIdentifierAmbiguousError,
  PersonMergeAccountBlockedError,
  PersonMergePreflightMismatchError,
  PersonMergeSelfError,
  type PersonMergeSnapshotStaleError,
  type PersonNotFoundError
} from "../errors.js"
import { WorkspaceClient, type WorkspaceClientError } from "../workspace-client.js"
import type { ResolvedPerson } from "./person-administration-boundaries.js"
import { resolvePersonAdministrationTarget } from "./person-administration-shared.js"
import { toAccountUuid } from "./sdk-boundary.js"

type PersonMergeError =
  | HulyClientError
  | HulyDataInvalidError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonMergeSelfError
  | PersonMergePreflightMismatchError
  | PersonMergeAccountBlockedError
  | PersonMergeSnapshotStaleError

const TUPLE_KEY_BEFORE = -1
const TUPLE_KEYS_EQUAL = 0
const referenceTupleKey = (reference: PersonMergeReferenceImpact): string =>
  JSON.stringify([reference.category, reference.concreteClass, reference.field, reference.attributeId, reference.kind])
const canonicalReferences = (references: ReadonlyArray<PersonMergeReferenceImpact>) =>
  [...references].sort((left, right) => {
    const leftKey = referenceTupleKey(left)
    const rightKey = referenceTupleKey(right)
    return leftKey === rightKey ? TUPLE_KEYS_EQUAL : leftKey < rightKey ? TUPLE_KEY_BEFORE : 1
  })

export const personMergeImpact = (references: ReadonlyArray<PersonMergeReferenceImpact>): PersonMergeImpact => {
  const canonical = canonicalReferences(references)
  const categoryCount = (category: PersonMergeReferenceCategory) =>
    Count.make(
      canonical.reduce((total, reference) => total + (reference.category === category ? reference.count : 0), 0)
    )
  return {
    identities: categoryCount("identity"),
    channels: categoryCount("channel"),
    memberships: categoryCount("membership"),
    comments: categoryCount("comment"),
    attachments: categoryCount("attachment"),
    otherReferences: categoryCount("other"),
    totalReferences: Count.make(canonical.reduce((total, reference) => total + reference.count, 0)),
    references: canonical
  }
}

const personRecord = (person: ResolvedPerson): PersonMergeRecord => ({
  id: PersonId.make(person._id),
  name: PersonName.make(person.name),
  space: SpaceId.make(person.space),
  ...(person.personUuid === undefined ? {} : { personUuid: person.personUuid })
})

type AccountPreflightPlan =
  | { readonly accountAction: Exclude<PersonMergePreflightAccountAction, "ready"> }
  | {
      readonly accountAction: "ready"
      readonly sourceUuid: ReturnType<typeof toAccountUuid>
      readonly survivorUuid: ReturnType<typeof toAccountUuid>
    }

const inspectAccountAction = Effect.fn("PersonMerge.inspectAccountAction")(function* (
  workspace: WorkspaceClient["Service"],
  source: ResolvedPerson,
  survivor: ResolvedPerson
): Effect.fn.Return<AccountPreflightPlan, WorkspaceClientError | HulyDataInvalidError> {
  if (source.personUuid === undefined || survivor.personUuid === undefined) return { accountAction: "not-needed" }
  if (source.personUuid === survivor.personUuid) return { accountAction: "already-unified" }
  if (workspace.canMergeSpecifiedPersons === undefined) {
    return yield* new HulyDataInvalidError({ operation: "mergePeople", entity: "account client merge capability" })
  }
  const sourceUuid = toAccountUuid(source.personUuid)
  const survivorUuid = toAccountUuid(survivor.personUuid)
  return (yield* workspace.canMergeSpecifiedPersons(survivorUuid, sourceUuid))
    ? { accountAction: "ready", sourceUuid, survivorUuid }
    : { accountAction: "blocked" }
})

const preflightToken = (
  source: PersonMergeRecord,
  survivor: PersonMergeRecord,
  impact: PersonMergeImpact,
  accountAction: PersonMergePreflightAccountAction
) =>
  PersonMergePreflightToken.make(
    createHash("sha256")
      .update(JSON.stringify({ source, survivor, references: impact.references, accountAction }))
      .digest("hex")
  )

const retainedSourceItem = PersonMergeUnmigratedSchema.make({
  subject: "source workspace Person record",
  reason:
    "retained intentionally: Huly's native merge rewires workspace references and, when both global Persons exist, marks the global source as migrated without deleting the workspace document"
})

const conflictingScalarItem = PersonMergeUnmigratedSchema.make({
  subject: "conflicting scalar Person and Employee fields",
  reason:
    "the explicitly selected survivor wins; source name, avatar, birthday, profile, city, status, position, and other scalar mixin values are not overwritten automatically"
})

const blockedGlobalItem = PersonMergeUnmigratedSchema.make({
  subject: "global Person/social identities",
  reason:
    "Huly rejected this global merge, commonly because the source owns a verified identity; execution is blocked before workspace references change"
})

const baseUnmigratedItems = (): PersonMergeBaseUnmigrated => [retainedSourceItem, conflictingScalarItem]

const blockedUnmigratedItems = (): PersonMergeBlockedUnmigrated => [
  retainedSourceItem,
  conflictingScalarItem,
  blockedGlobalItem
]

interface PreparedPersonMerge {
  readonly source: PersonMergeRecord
  readonly survivor: PersonMergeRecord
  readonly impact: PersonMergeImpact
  readonly accountPlan: AccountPreflightPlan
  readonly preflightToken: PersonMergePreflightToken
  readonly migrateReferences: NonNullable<HulyClient["Service"]["migratePersonReferences"]>
}

const preparePersonMerge = Effect.fn("PersonMerge.prepare")(function* (
  source: ResolvedPerson,
  survivor: ResolvedPerson
): Effect.fn.Return<PreparedPersonMerge, PersonMergeError, HulyClient | WorkspaceClient> {
  const client = yield* HulyClient
  const workspace = yield* WorkspaceClient
  if (source._id === survivor._id) return yield* new PersonMergeSelfError({ personId: PersonId.make(source._id) })
  if (client.inspectPersonReferences === undefined || client.migratePersonReferences === undefined) {
    return yield* new HulyDataInvalidError({
      operation: "mergePeople",
      entity: "native person reference migration capability"
    })
  }
  const impact = personMergeImpact(yield* client.inspectPersonReferences(PersonId.make(source._id)))
  const accountPlan = yield* inspectAccountAction(workspace, source, survivor)
  const sourceRecord = personRecord(source)
  const survivorRecord = personRecord(survivor)
  const token = preflightToken(sourceRecord, survivorRecord, impact, accountPlan.accountAction)
  return {
    source: sourceRecord,
    survivor: survivorRecord,
    impact,
    accountPlan,
    preflightToken: token,
    migrateReferences: client.migratePersonReferences
  }
})

interface PreparedGlobalMerge {
  readonly accountAction: PersonMergeFinalAccountAction
  readonly merge: Effect.Effect<void, WorkspaceClientError> | undefined
}

const prepareGlobalMerge = Effect.fn("PersonMerge.prepareGlobalMerge")(function* (
  workspace: WorkspaceClient["Service"],
  prepared: PreparedPersonMerge
): Effect.fn.Return<PreparedGlobalMerge, PersonMergeAccountBlockedError | HulyDataInvalidError> {
  if (prepared.accountPlan.accountAction === "blocked") {
    return yield* new PersonMergeAccountBlockedError({
      sourceId: prepared.source.id,
      survivorId: prepared.survivor.id,
      reason: "the account service reported that the source global Person cannot be merged safely"
    })
  }
  if (prepared.accountPlan.accountAction !== "ready") {
    return { accountAction: prepared.accountPlan.accountAction, merge: undefined }
  }
  if (workspace.mergeSpecifiedPersons === undefined) {
    return yield* new HulyDataInvalidError({ operation: "mergePeople", entity: "account merge capability" })
  }
  const mergeSpecifiedPersons = workspace.mergeSpecifiedPersons
  return {
    accountAction: "merged",
    merge: mergeSpecifiedPersons(prepared.accountPlan.survivorUuid, prepared.accountPlan.sourceUuid)
  }
})

interface ResultCommon {
  readonly source: PersonMergeRecord
  readonly survivor: PersonMergeRecord
  readonly impact: PersonMergeImpact
  readonly preflightToken: PersonMergePreflightToken
  readonly sourceRecordRetained: true
}

const resultCommon = (prepared: PreparedPersonMerge): ResultCommon => ({
  source: prepared.source,
  survivor: prepared.survivor,
  impact: prepared.impact,
  preflightToken: prepared.preflightToken,
  sourceRecordRetained: true
})

const previewResult = (prepared: PreparedPersonMerge): MergePeopleResult =>
  prepared.accountPlan.accountAction === "blocked"
    ? { ...resultCommon(prepared), executed: false, accountAction: "blocked", unmigrated: blockedUnmigratedItems() }
    : {
        ...resultCommon(prepared),
        executed: false,
        accountAction: prepared.accountPlan.accountAction,
        unmigrated: baseUnmigratedItems()
      }

const executePreparedMerge = Effect.fn("PersonMerge.executePrepared")(function* (
  params: Extract<MergePeopleParams, { readonly execute: true }>,
  prepared: PreparedPersonMerge
): Effect.fn.Return<MergePeopleResult, PersonMergeError, HulyClient | WorkspaceClient> {
  if (params.expectedPreflightToken !== prepared.preflightToken) {
    return yield* new PersonMergePreflightMismatchError({
      expected: params.expectedPreflightToken,
      actual: prepared.preflightToken
    })
  }
  const workspace = yield* WorkspaceClient
  const global = yield* prepareGlobalMerge(workspace, prepared)
  yield* prepared.migrateReferences(prepared.impact.references, prepared.source.id, prepared.survivor.id)
  if (global.merge !== undefined) yield* global.merge
  return {
    ...resultCommon(prepared),
    executed: true,
    accountAction: global.accountAction,
    unmigrated: baseUnmigratedItems()
  }
})

const mergeResolvedPeople = Effect.fn("PersonMerge.mergeResolvedPeople")(function* (
  params: MergePeopleParams,
  source: ResolvedPerson,
  survivor: ResolvedPerson
): Effect.fn.Return<MergePeopleResult, PersonMergeError, HulyClient | WorkspaceClient> {
  const prepared = yield* preparePersonMerge(source, survivor)
  return params.execute === true ? yield* executePreparedMerge(params, prepared) : previewResult(prepared)
})

export const mergePeople = Effect.fn("PersonMerge.mergePeople")(function* (
  params: MergePeopleParams
): Effect.fn.Return<MergePeopleResult, PersonMergeError, HulyClient | WorkspaceClient> {
  const client = yield* HulyClient
  const resolve =
    client.resolvePersonAdministrationTarget ?? ((locator) => resolvePersonAdministrationTarget(client, locator))
  const [source, survivor] = yield* Effect.all([resolve(params.source), resolve(params.survivor)])
  return yield* mergeResolvedPeople(params, source, survivor)
})
