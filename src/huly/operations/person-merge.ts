import { createHash } from "node:crypto"

import { Effect, type Schema } from "effect"

import {
  type MergePeopleParams,
  type MergePeopleResult,
  type PersonMergeAccountActionSchema,
  type PersonMergeImpact,
  PersonMergePreflightToken,
  type PersonMergeRecord,
  type PersonMergeReferenceCategory,
  type PersonMergeReferenceImpact
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

type AccountAction = Schema.Schema.Type<typeof PersonMergeAccountActionSchema>

const canonicalReferences = (references: ReadonlyArray<PersonMergeReferenceImpact>) =>
  [...references].sort((left, right) =>
    [left.category, left.concreteClass, left.field, left.attributeId, left.kind]
      .join("\u0000")
      .localeCompare([right.category, right.concreteClass, right.field, right.attributeId, right.kind].join("\u0000"))
  )

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

const inspectAccountAction = Effect.fn("PersonMerge.inspectAccountAction")(function* (
  workspace: WorkspaceClient["Service"],
  source: ResolvedPerson,
  survivor: ResolvedPerson
): Effect.fn.Return<AccountAction, WorkspaceClientError | HulyDataInvalidError> {
  if (source.personUuid === undefined || survivor.personUuid === undefined) return "not-needed"
  if (source.personUuid === survivor.personUuid) return "already-unified"
  if (workspace.canMergeSpecifiedPersons === undefined) {
    return yield* new HulyDataInvalidError({ operation: "mergePeople", entity: "account client merge capability" })
  }
  return (yield* workspace.canMergeSpecifiedPersons(
    toAccountUuid(survivor.personUuid),
    toAccountUuid(source.personUuid)
  ))
    ? "ready"
    : "blocked"
})

const preflightToken = (
  source: PersonMergeRecord,
  survivor: PersonMergeRecord,
  impact: PersonMergeImpact,
  accountAction: AccountAction
) =>
  PersonMergePreflightToken.make(
    createHash("sha256")
      .update(JSON.stringify({ source, survivor, references: impact.references, accountAction }))
      .digest("hex")
  )

const unmigratedItems = (accountAction: AccountAction) => [
  {
    subject: "source workspace Person record",
    reason:
      "retained intentionally: Huly's native merge rewires workspace references and, when both global Persons exist, marks the global source as migrated without deleting the workspace document"
  },
  {
    subject: "conflicting scalar Person and Employee fields",
    reason:
      "the explicitly selected survivor wins; source name, avatar, birthday, profile, city, status, position, and other scalar mixin values are not overwritten automatically"
  },
  ...(accountAction === "blocked"
    ? [
        {
          subject: "global Person/social identities",
          reason:
            "Huly rejected this global merge, commonly because the source owns a verified identity; execution is blocked before workspace references change"
        }
      ]
    : [])
]

interface PreparedPersonMerge {
  readonly source: PersonMergeRecord
  readonly survivor: PersonMergeRecord
  readonly impact: PersonMergeImpact
  readonly accountAction: AccountAction
  readonly preflightToken: PersonMergePreflightToken
  readonly baseResult: Omit<MergePeopleResult, "executed" | "accountAction">
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
  const accountAction = yield* inspectAccountAction(workspace, source, survivor)
  const sourceRecord = personRecord(source)
  const survivorRecord = personRecord(survivor)
  const token = preflightToken(sourceRecord, survivorRecord, impact, accountAction)
  return {
    source: sourceRecord,
    survivor: survivorRecord,
    impact,
    accountAction,
    preflightToken: token,
    migrateReferences: client.migratePersonReferences,
    baseResult: {
      source: sourceRecord,
      survivor: survivorRecord,
      impact,
      preflightToken: token,
      sourceRecordRetained: true,
      unmigrated: unmigratedItems(accountAction)
    }
  }
})

const prepareGlobalMerge = Effect.fn("PersonMerge.prepareGlobalMerge")(function* (
  workspace: WorkspaceClient["Service"],
  prepared: PreparedPersonMerge
) {
  if (prepared.accountAction === "blocked") {
    return yield* new PersonMergeAccountBlockedError({
      sourceId: prepared.source.id,
      survivorId: prepared.survivor.id,
      reason: "the account service reported that the source global Person cannot be merged safely"
    })
  }
  if (prepared.accountAction !== "ready") return undefined
  if (workspace.mergeSpecifiedPersons === undefined) {
    return yield* new HulyDataInvalidError({ operation: "mergePeople", entity: "account merge capability" })
  }
  if (prepared.source.personUuid === undefined || prepared.survivor.personUuid === undefined) {
    return yield* new HulyDataInvalidError({ operation: "mergePeople", entity: "global Person identifiers" })
  }
  const mergeSpecifiedPersons = workspace.mergeSpecifiedPersons
  const sourceUuid = toAccountUuid(prepared.source.personUuid)
  const survivorUuid = toAccountUuid(prepared.survivor.personUuid)
  return () => mergeSpecifiedPersons(survivorUuid, sourceUuid)
})

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
  const mergeGlobal = yield* prepareGlobalMerge(workspace, prepared)
  yield* prepared.migrateReferences(prepared.impact.references, prepared.source.id, prepared.survivor.id)
  if (mergeGlobal !== undefined) yield* mergeGlobal()
  return {
    ...prepared.baseResult,
    executed: true,
    accountAction: prepared.accountAction === "ready" ? "merged" : prepared.accountAction
  }
})

export const mergeResolvedPeople = Effect.fn("PersonMerge.mergeResolvedPeople")(function* (
  params: MergePeopleParams,
  source: ResolvedPerson,
  survivor: ResolvedPerson
): Effect.fn.Return<MergePeopleResult, PersonMergeError, HulyClient | WorkspaceClient> {
  const prepared = yield* preparePersonMerge(source, survivor)
  return params.execute === true
    ? yield* executePreparedMerge(params, prepared)
    : { ...prepared.baseResult, executed: false, accountAction: prepared.accountAction }
})

export const mergePeople = Effect.fn("PersonMerge.mergePeople")(function* (
  params: MergePeopleParams
): Effect.fn.Return<MergePeopleResult, PersonMergeError, HulyClient | WorkspaceClient> {
  const client = yield* HulyClient
  const [source, survivor] = yield* Effect.all([
    resolvePersonAdministrationTarget(client, params.source),
    resolvePersonAdministrationTarget(client, params.survivor)
  ])
  return yield* mergeResolvedPeople(params, source, survivor)
})
