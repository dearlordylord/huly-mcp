import type {
  AccountUuid as HulyAccountUuid,
  Class,
  Collaborator as HulyCollaborator,
  Doc,
  Ref,
  Space
} from "@hcengineering/core"
import { generateId } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type {
  AddObjectCollaboratorParams,
  AddObjectCollaboratorResult,
  CollaboratorMemberInput,
  ListObjectCollaboratorsParams,
  ObjectCollaborator,
  RemoveObjectCollaboratorParams,
  RemoveObjectCollaboratorResult
} from "../../domain/schemas/collaborators.js"
import { AccountUuid, CollaboratorId, DocId, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type {
  DocumentNotFoundError,
  IssueNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotAnEmployeeError,
  PersonNotFoundError,
  ProjectNotFoundError,
  TeamspaceNotFoundError
} from "../errors.js"
import { HulyError } from "../errors.js"
import { core } from "../huly-plugins.js"
import { resolveEmployeeAccountUuid } from "./contacts-shared.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { findProjectAndIssue } from "./issues-shared.js"
import { clampLimit, hulyQuery } from "./query-helpers.js"
import { toAccountUuid, toClassRef, toRef } from "./sdk-boundary.js"

type ResolveTargetError =
  | HulyClientError
  | ProjectNotFoundError
  | IssueNotFoundError
  | TeamspaceNotFoundError
  | DocumentNotFoundError

type ResolveMemberError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError

type ListObjectCollaboratorsError = ResolveTargetError
type AddObjectCollaboratorError = ResolveTargetError | ResolveMemberError
type RemoveObjectCollaboratorError = ResolveTargetError | ResolveMemberError | HulyError

interface ResolvedObjectTarget {
  readonly client: HulyClient["Type"]
  readonly objectId: Ref<Doc>
  readonly objectClass: Ref<Class<Doc>>
  readonly space: Ref<Space>
}

const resolveRawTarget = (
  params: { readonly objectId: string; readonly objectClass: string }
): Effect.Effect<ResolvedObjectTarget, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const objectClass = toClassRef<Doc>(params.objectClass)
    const doc = yield* client.findOne<Doc>(
      objectClass,
      hulyQuery<Doc>({ _id: toRef<Doc>(params.objectId) })
    )

    return {
      client,
      objectId: toRef<Doc>(params.objectId),
      objectClass,
      space: doc?.space ?? core.space.Workspace
    }
  })

const resolveObjectTarget = (
  params: ListObjectCollaboratorsParams | AddObjectCollaboratorParams | RemoveObjectCollaboratorParams
): Effect.Effect<ResolvedObjectTarget, ResolveTargetError, HulyClient> =>
  Effect.gen(function*() {
    if (params.objectId !== undefined && params.objectClass !== undefined) {
      return yield* resolveRawTarget({ objectId: params.objectId, objectClass: params.objectClass })
    }

    if (params.project !== undefined && params.issueIdentifier !== undefined) {
      const { client, issue, project } = yield* findProjectAndIssue({
        project: params.project,
        identifier: params.issueIdentifier
      })
      return { client, objectId: issue._id, objectClass: toClassRef<Doc>(issue._class), space: project._id }
    }

    if (params.teamspace === undefined || params.document === undefined) {
      return yield* Effect.dieMessage("Invalid collaborator target: document target fields are missing")
    }

    const { client, doc, teamspace } = yield* findTeamspaceAndDocument({
      teamspace: params.teamspace,
      document: params.document
    })
    return { client, objectId: doc._id, objectClass: toClassRef<Doc>(doc._class), space: teamspace._id }
  })

const resolveMember = (
  client: HulyClient["Type"],
  member: CollaboratorMemberInput
): Effect.Effect<HulyAccountUuid, ResolveMemberError> =>
  Schema.is(AccountUuid)(member)
    ? Effect.succeed(toAccountUuid(member))
    : resolveEmployeeAccountUuid(client, member)

const toObjectCollaborator = (
  collaborator: HulyCollaborator,
  target: ResolvedObjectTarget
): ObjectCollaborator => ({
  id: CollaboratorId.make(collaborator._id),
  objectId: DocId.make(target.objectId),
  objectClass: ObjectClassName.make(target.objectClass),
  accountUuid: AccountUuid.make(collaborator.collaborator)
})

export const listObjectCollaborators = (
  params: ListObjectCollaboratorsParams
): Effect.Effect<Array<ObjectCollaborator>, ListObjectCollaboratorsError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveObjectTarget(params)
    const limit = clampLimit(params.limit)
    const collaborators = yield* target.client.findAll<HulyCollaborator>(
      core.class.Collaborator,
      hulyQuery<HulyCollaborator>({
        attachedTo: target.objectId,
        attachedToClass: target.objectClass
      }),
      { limit }
    )
    return collaborators.map(collaborator => toObjectCollaborator(collaborator, target))
  })

export const addObjectCollaborator = (
  params: AddObjectCollaboratorParams
): Effect.Effect<AddObjectCollaboratorResult, AddObjectCollaboratorError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveObjectTarget(params)
    const accountUuid = yield* resolveMember(target.client, params.member)

    const existing = yield* target.client.findOne<HulyCollaborator>(
      core.class.Collaborator,
      hulyQuery<HulyCollaborator>({
        attachedTo: target.objectId,
        attachedToClass: target.objectClass,
        collaborator: accountUuid
      })
    )

    if (existing !== undefined) {
      return {
        collaboratorId: CollaboratorId.make(existing._id),
        objectId: DocId.make(target.objectId),
        objectClass: ObjectClassName.make(target.objectClass),
        accountUuid: AccountUuid.make(accountUuid),
        added: false
      }
    }

    const collaboratorId: Ref<HulyCollaborator> = generateId()
    yield* target.client.addCollection(
      core.class.Collaborator,
      target.space,
      target.objectId,
      target.objectClass,
      "collaborators",
      { collaborator: accountUuid },
      collaboratorId
    )

    return {
      collaboratorId: CollaboratorId.make(collaboratorId),
      objectId: DocId.make(target.objectId),
      objectClass: ObjectClassName.make(target.objectClass),
      accountUuid: AccountUuid.make(accountUuid),
      added: true
    }
  })

export const removeObjectCollaborator = (
  params: RemoveObjectCollaboratorParams
): Effect.Effect<RemoveObjectCollaboratorResult, RemoveObjectCollaboratorError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveObjectTarget(params)
    const accountUuid = yield* resolveMember(target.client, params.member)

    const existing = yield* target.client.findOne<HulyCollaborator>(
      core.class.Collaborator,
      hulyQuery<HulyCollaborator>({
        attachedTo: target.objectId,
        attachedToClass: target.objectClass,
        collaborator: accountUuid
      })
    )

    if (existing === undefined) {
      return {
        objectId: DocId.make(target.objectId),
        objectClass: ObjectClassName.make(target.objectClass),
        accountUuid: AccountUuid.make(accountUuid),
        removed: false
      }
    }

    if (target.client.removeCollection === undefined) {
      return yield* Effect.fail(new HulyError({ message: "Huly client does not support removeCollection" }))
    }

    yield* target.client.removeCollection(
      core.class.Collaborator,
      existing.space,
      existing._id,
      target.objectId,
      target.objectClass,
      "collaborators"
    )

    return {
      objectId: DocId.make(target.objectId),
      objectClass: ObjectClassName.make(target.objectClass),
      accountUuid: AccountUuid.make(accountUuid),
      removed: true
    }
  })
