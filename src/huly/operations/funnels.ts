import type { Data, DocumentUpdate, Ref } from "@hcengineering/core"
import { generateId, SortingOrder } from "@hcengineering/core"
import type { ProjectType } from "@hcengineering/task"
import { Effect } from "effect"

import {
  UPDATE_FUNNEL_FIELDS,
  type CreateFunnelParams,
  type CreateFunnelResult,
  type DeleteFunnelParams,
  type DeleteFunnelResult,
  type FunnelDetail,
  type FunnelImpact,
  type FunnelMutationParams,
  type FunnelMutationResult,
  type GetFunnelParams,
  type UpdateFunnelParams
} from "../../domain/schemas/funnels.js"
import {
  FunnelIdentifier,
  FunnelReference,
  type FunnelSummary,
  type ListFunnelsParams,
  type ListFunnelsResult
} from "../../domain/schemas/leads.js"
import { AccountUuid, Count, NonEmptyString, Timestamp, UNKNOWN_TOTAL } from "../../domain/schemas/shared.js"
import { ProjectTypeRefSchema } from "../../domain/schemas/task-management.js"
import { AccountRoleSchema } from "../../domain/schemas/workspace.js"
import { isSingle } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import {
  FunnelDeleteConflictError,
  FunnelIdentifierAmbiguousError,
  FunnelWorkflowInvalidError,
  HulyDataInvalidError,
  type NoUpdateFieldsError
} from "../errors.js"
import { FunnelAccountNotFoundError } from "../errors-leads.js"
import { core } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { listTotal } from "./counts.js"
import {
  type FunnelModelError,
  type FunnelResolverError,
  type FunnelWorkflowTaskType,
  funnelSpace,
  getFunnelProjectType,
  type HulyFunnel,
  resolveFunnelFromContext,
  resolveFunnelProjectType,
  resolveFunnelWorkflow
} from "./funnels-shared.js"
import { markupToMarkdownString } from "./markup.js"
import { renderMarkdownWithNativeReferencesForWrite } from "./native-reference-markup.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toAccountUuid, toMixinRef } from "./sdk-boundary.js"
import { requireUpdateFields } from "./update-guards.js"
import { WorkspaceClient, type WorkspaceClientError } from "../workspace-client.js"

type FunnelReadError = FunnelResolverError | FunnelModelError | HulyDataInvalidError
type FunnelWriteError =
  | FunnelReadError
  | NoUpdateFieldsError
  | FunnelDeleteConflictError
  | FunnelAccountNotFoundError
  | WorkspaceClientError

const totalAffected = (impact: Omit<FunnelImpact, "totalAffected">): FunnelImpact["totalAffected"] =>
  impact.leads === UNKNOWN_TOTAL ? UNKNOWN_TOTAL : Count.make(impact.leads + impact.comments + impact.attachments)

const funnelImpact = (
  client: HulyClient["Service"],
  funnel: HulyFunnel
): Effect.Effect<FunnelImpact, HulyClientError> =>
  Effect.gen(function* () {
    const leads = yield* client.findAll(leadClassIds.class.Lead, hulyQuery({ space: funnelSpace(funnel) }), {
      limit: 1,
      total: true
    })
    const impact = {
      leads: listTotal(leads.total),
      comments: Count.make(funnel.comments ?? 0),
      attachments: Count.make(funnel.attachments ?? 0)
    }
    return { ...impact, totalAffected: totalAffected(impact) }
  })

const validatedWorkflow = (client: HulyClient["Service"], projectType: ProjectType) =>
  resolveFunnelWorkflow(client, projectType)

const fullDescriptionForWrite = (
  client: HulyClient["Service"],
  fullDescription: string | null | undefined
): Effect.Effect<string | undefined, HulyDataInvalidError> => {
  if (fullDescription === undefined) return Effect.succeed(undefined)
  if (fullDescription === null || fullDescription.trim() === "") return Effect.succeed("")
  const rendered = renderMarkdownWithNativeReferencesForWrite(
    fullDescription,
    client.markupUrlConfig,
    "fullDescription"
  )
  return rendered._tag === "success"
    ? Effect.succeed(rendered.rendered.markup)
    : Effect.fail(
        new HulyDataInvalidError({ operation: "writeFunnel", entity: "funnel fullDescription", cause: rendered.reason })
      )
}

const fullDescriptionForRead = (
  client: HulyClient["Service"],
  fullDescription: string | undefined
): Effect.Effect<string | undefined, HulyDataInvalidError> =>
  fullDescription === undefined || fullDescription === ""
    ? Effect.succeed(undefined)
    : markupToMarkdownString(fullDescription, client.markupUrlConfig, {
        operation: "getFunnel",
        entity: "funnel fullDescription"
      })

const ensureMembership = (
  members: ReadonlyArray<AccountUuid>,
  owners: ReadonlyArray<AccountUuid>,
  projectType: ProjectType
): Effect.Effect<void, FunnelWorkflowInvalidError> =>
  members.length > 0 && owners.length > 0 && owners.every((owner) => members.includes(owner))
    ? Effect.void
    : Effect.fail(
        new FunnelWorkflowInvalidError({
          projectType: ProjectTypeRefSchema.make(projectType._id),
          reason: NonEmptyString.make("members and owners must be non-empty, and every owner must be a member")
        })
      )

const toFunnelDetail = (
  client: HulyClient["Service"],
  funnel: HulyFunnel,
  projectType: ProjectType,
  workflow: ReadonlyArray<FunnelWorkflowTaskType>,
  impact: FunnelImpact
): Effect.Effect<FunnelDetail, HulyDataInvalidError> =>
  Effect.gen(function* () {
    const fullDescription = yield* fullDescriptionForRead(client, funnel.fullDescription)
    return {
      identifier: FunnelIdentifier.make(funnel._id),
      name: NonEmptyString.make(funnel.name),
      description: funnel.description,
      ...(fullDescription === undefined ? {} : { fullDescription }),
      archived: funnel.archived,
      private: funnel.private,
      members: funnel.members.map((member) => AccountUuid.make(member)),
      owners: (funnel.owners ?? []).map((owner) => AccountUuid.make(owner)),
      autoJoin: funnel.autoJoin ?? false,
      autoJoinForRoles: (funnel.autoJoinForRoles ?? []).map((role) => AccountRoleSchema.make(role)),
      restricted: funnel.restricted ?? false,
      projectType: { id: NonEmptyString.make(projectType._id), name: NonEmptyString.make(projectType.name) },
      workflow: workflow.map(({ statuses, taskType }) => ({
        id: NonEmptyString.make(taskType._id),
        name: NonEmptyString.make(taskType.name),
        statuses: statuses.map((status) => ({
          id: NonEmptyString.make(status.id),
          name: NonEmptyString.make(status.name)
        }))
      })),
      impact,
      ...(funnel.createdOn === undefined ? {} : { createdOn: Timestamp.make(funnel.createdOn) }),
      ...(funnel.createdBy === undefined ? {} : { createdBy: NonEmptyString.make(funnel.createdBy) }),
      modifiedOn: Timestamp.make(funnel.modifiedOn),
      modifiedBy: NonEmptyString.make(funnel.modifiedBy),
      unsupportedFields: [
        {
          field: NonEmptyString.make("roleAssignments"),
          reason: NonEmptyString.make(
            "Role assignment keys are dynamic project-type mixin attributes; the published SDK has no stable typed funnel projection for them."
          )
        }
      ]
    }
  })

const findExistingFunnelForCreate = (
  client: HulyClient["Service"],
  name: NonEmptyString
): Effect.Effect<HulyFunnel | undefined, HulyClientError | FunnelIdentifierAmbiguousError> =>
  Effect.gen(function* () {
    const existing = yield* client.findAll<HulyFunnel>(leadClassIds.class.Funnel, hulyQuery<HulyFunnel>({ name }))
    if (isSingle(existing)) return existing[0]
    if (existing.length > 1) {
      return yield* new FunnelIdentifierAmbiguousError({
        identifier: FunnelReference.make(name),
        matches: Count.make(existing.length)
      })
    }
    return undefined
  })

const createFunnelData = (
  params: CreateFunnelParams,
  projectType: ProjectType,
  members: ReadonlyArray<AccountUuid>,
  owners: ReadonlyArray<AccountUuid>,
  fullDescription: string | undefined
): Data<HulyFunnel> => ({
  name: params.name,
  description: params.description ?? "",
  ...(fullDescription === undefined ? {} : { fullDescription }),
  private: params.private ?? false,
  members: members.map(toAccountUuid),
  owners: owners.map(toAccountUuid),
  archived: false,
  autoJoin: params.autoJoin ?? projectType.autoJoin ?? false,
  type: projectType._id
})

export const listFunnels = (params: ListFunnelsParams): Effect.Effect<ListFunnelsResult, HulyClientError, HulyClient> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const query: StrictDocumentQuery<HulyFunnel> = params.includeArchived === true ? {} : { archived: false }
    const funnels = yield* client.findAll<HulyFunnel>(leadClassIds.class.Funnel, hulyQuery(query), {
      limit: clampLimit(params.limit),
      sort: { name: SortingOrder.Ascending }
    })
    const summaries: ReadonlyArray<FunnelSummary> = funnels.map((funnel) => ({
      identifier: FunnelIdentifier.make(funnel._id),
      name: funnel.name,
      description: funnel.description || undefined,
      archived: funnel.archived
    }))
    return { funnels: summaries, total: listTotal(funnels.total) }
  })

export const getFunnel = (
  params: GetFunnelParams
): Effect.Effect<FunnelDetail, FunnelReadError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const { client, funnel } = yield* resolveFunnelFromContext(params.funnel)
    const projectType = yield* getFunnelProjectType(client, funnel)
    const workflow = yield* validatedWorkflow(client, projectType)
    return yield* toFunnelDetail(client, funnel, projectType, workflow, yield* funnelImpact(client, funnel))
  })

export const createFunnel = (
  params: CreateFunnelParams
): Effect.Effect<
  CreateFunnelResult,
  | FunnelModelError
  | FunnelIdentifierAmbiguousError
  | HulyDataInvalidError
  | FunnelAccountNotFoundError
  | WorkspaceClientError,
  HulyClient | WorkspaceClient | Diagnostics
> =>
  Effect.gen(function* () {
    const client = yield* HulyClient
    const existing = yield* findExistingFunnelForCreate(client, params.name)
    if (existing !== undefined) {
      return {
        identifier: FunnelIdentifier.make(existing._id),
        name: NonEmptyString.make(existing.name),
        created: false,
        archived: existing.archived
      }
    }
    const projectType = yield* resolveFunnelProjectType(client, params.projectType)
    yield* validatedWorkflow(client, projectType)
    const account = AccountUuid.make(client.getAccountUuid())
    const members = params.members ?? [account]
    const owners = params.owners ?? [account]
    yield* ensureMembership(members, owners, projectType)
    yield* ensureWorkspaceAccounts([...members, ...owners])
    const fullDescription = yield* fullDescriptionForWrite(client, params.fullDescription)
    const id: Ref<HulyFunnel> = generateId()
    const data = createFunnelData(params, projectType, members, owners, fullDescription)
    yield* client.createDoc(leadClassIds.class.Funnel, core.space.Space, data, id)
    yield* client.createMixin<HulyFunnel, HulyFunnel>(
      id,
      leadClassIds.class.Funnel,
      core.space.Space,
      toMixinRef<HulyFunnel>(projectType.targetClass),
      {}
    )
    return { identifier: FunnelIdentifier.make(id), name: params.name, created: true, archived: false }
  })

const rejectFunnelNameCollision = (
  client: HulyClient["Service"],
  funnel: HulyFunnel,
  name: NonEmptyString | undefined
): Effect.Effect<void, HulyClientError | FunnelIdentifierAmbiguousError> => {
  if (name === undefined || name === funnel.name) return Effect.void
  return Effect.gen(function* () {
    const collisions = yield* client.findAll<HulyFunnel>(leadClassIds.class.Funnel, hulyQuery<HulyFunnel>({ name }))
    if (collisions.some((candidate) => candidate._id !== funnel._id)) {
      return yield* new FunnelIdentifierAmbiguousError({
        identifier: FunnelReference.make(name),
        matches: Count.make(collisions.filter((candidate) => candidate._id !== funnel._id).length)
      })
    }
  })
}

const funnelUpdate = (params: UpdateFunnelParams, fullDescription: string | undefined): DocumentUpdate<HulyFunnel> => ({
  ...(params.name === undefined ? {} : { name: params.name }),
  ...(params.description === undefined ? {} : { description: params.description ?? "" }),
  ...(fullDescription === undefined ? {} : { fullDescription }),
  ...(params.private === undefined ? {} : { private: params.private }),
  ...(params.autoJoin === undefined ? {} : { autoJoin: params.autoJoin }),
  ...funnelMembershipUpdate(params)
})

const funnelMembershipUpdate = (params: UpdateFunnelParams): DocumentUpdate<HulyFunnel> => ({
  ...(params.members === undefined ? {} : { members: params.members.map(toAccountUuid) }),
  ...(params.owners === undefined ? {} : { owners: params.owners.map(toAccountUuid) })
})

export const updateFunnel = (
  params: UpdateFunnelParams
): Effect.Effect<FunnelMutationResult, FunnelWriteError, HulyClient | WorkspaceClient | Diagnostics> =>
  Effect.gen(function* () {
    yield* requireUpdateFields("update_funnel", params, UPDATE_FUNNEL_FIELDS)
    const { client, funnel } = yield* resolveFunnelFromContext(params.funnel)
    const projectType = yield* getFunnelProjectType(client, funnel)
    yield* validatedWorkflow(client, projectType)
    yield* rejectFunnelNameCollision(client, funnel, params.name)
    const members = params.members ?? funnel.members.map((member) => AccountUuid.make(member))
    const owners = params.owners ?? (funnel.owners ?? []).map((owner) => AccountUuid.make(owner))
    yield* ensureMembership(members, owners, projectType)
    yield* ensureWorkspaceAccounts([...members, ...owners])
    const fullDescription = yield* fullDescriptionForWrite(client, params.fullDescription)
    const update = funnelUpdate(params, fullDescription)
    yield* client.updateDoc(leadClassIds.class.Funnel, core.space.Space, funnel._id, update)
    return { identifier: FunnelIdentifier.make(funnel._id), updated: true, impact: yield* funnelImpact(client, funnel) }
  })

export const archiveFunnel = (
  params: FunnelMutationParams
): Effect.Effect<FunnelMutationResult, FunnelReadError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const { client, funnel } = yield* resolveFunnelFromContext(params.funnel)
    const projectType = yield* getFunnelProjectType(client, funnel)
    yield* validatedWorkflow(client, projectType)
    const impact = yield* funnelImpact(client, funnel)
    const updated = !funnel.archived
    if (updated) {
      yield* client.updateDoc<HulyFunnel>(leadClassIds.class.Funnel, core.space.Space, funnel._id, { archived: true })
    }
    return { identifier: FunnelIdentifier.make(funnel._id), updated, impact }
  })

export const deleteFunnel = (
  params: DeleteFunnelParams
): Effect.Effect<DeleteFunnelResult, FunnelWriteError, HulyClient | Diagnostics> =>
  Effect.gen(function* () {
    const { client, funnel } = yield* resolveFunnelFromContext(params.funnel)
    const projectType = yield* getFunnelProjectType(client, funnel)
    yield* validatedWorkflow(client, projectType)
    const impact = yield* funnelImpact(client, funnel)
    if (
      impact.leads !== params.expectedLeads ||
      impact.comments !== params.expectedComments ||
      impact.attachments !== params.expectedAttachments
    ) {
      return yield* new FunnelDeleteConflictError({
        identifier: params.funnel,
        reason: NonEmptyString.make(
          `impact changed since preflight; expected ${params.expectedLeads} leads, ${params.expectedComments} comments, ${params.expectedAttachments} attachments but found ${impact.leads}, ${impact.comments}, ${impact.attachments}`
        )
      })
    }
    if (!funnel.archived) {
      return yield* new FunnelDeleteConflictError({
        identifier: params.funnel,
        reason: NonEmptyString.make("archive it first with archive_funnel")
      })
    }
    if (impact.totalAffected !== 0) {
      return yield* new FunnelDeleteConflictError({
        identifier: params.funnel,
        reason: NonEmptyString.make(
          `impact is not empty (${impact.leads} leads, ${impact.comments} comments, ${impact.attachments} attachments)`
        )
      })
    }
    yield* client.removeDoc(leadClassIds.class.Funnel, core.space.Space, funnel._id)
    return { identifier: FunnelIdentifier.make(funnel._id), deleted: true, impact }
  })

const ensureWorkspaceAccounts = (
  requested: ReadonlyArray<AccountUuid>
): Effect.Effect<void, WorkspaceClientError | FunnelAccountNotFoundError, WorkspaceClient> =>
  Effect.gen(function* () {
    const workspace = yield* WorkspaceClient
    const existing = new Set((yield* workspace.getWorkspaceMembers()).map((member) => AccountUuid.make(member.person)))
    const missing = requested.find((account) => !existing.has(account))
    if (missing !== undefined) return yield* new FunnelAccountNotFoundError({ account: missing })
  })
