import { JSONSchema, Schema } from "effect"

import {
  AccountUuid,
  CollaboratorId,
  DEFAULT_LIMIT,
  DocId,
  DocumentIdentifier,
  hasAllDefined,
  IssueIdentifier,
  LimitParam,
  ObjectClassName,
  PersonRefInput,
  ProjectIdentifier,
  TeamspaceIdentifier
} from "./shared.js"

const ObjectTargetFields = {
  objectId: Schema.optional(DocId.annotations({
    description:
      "Advanced: internal Huly object ID. Use with objectClass. Prefer project+issueIdentifier, teamspace+document, or channel when available."
  })),
  objectClass: Schema.optional(ObjectClassName.annotations({
    description: "Advanced: internal Huly object class for objectId, such as 'tracker:class:Issue'. Use with objectId."
  })),
  project: Schema.optional(ProjectIdentifier.annotations({
    description: "Project identifier for issue target, e.g. 'HULY'. Use with issueIdentifier."
  })),
  issueIdentifier: Schema.optional(IssueIdentifier.annotations({
    description: "Issue identifier for issue target, e.g. 'HULY-123' or '123'. Use with project."
  })),
  teamspace: Schema.optional(TeamspaceIdentifier.annotations({
    description: "Teamspace name or ID for document target. Use with document."
  })),
  document: Schema.optional(DocumentIdentifier.annotations({
    description: "Document title or ID for document target. Use with teamspace."
  }))
}

const targetModeMessage =
  "Choose exactly one target mode: objectId+objectClass, project+issueIdentifier, or teamspace+document."

const validateObjectTarget = (params: {
  readonly objectId?: DocId | undefined
  readonly objectClass?: ObjectClassName | undefined
  readonly project?: ProjectIdentifier | undefined
  readonly issueIdentifier?: IssueIdentifier | undefined
  readonly teamspace?: TeamspaceIdentifier | undefined
  readonly document?: DocumentIdentifier | undefined
}) => {
  const rawObjectMode = hasAllDefined(params.objectId, params.objectClass)
  const issueMode = hasAllDefined(params.project, params.issueIdentifier)
  const documentMode = hasAllDefined(params.teamspace, params.document)
  const modeCount = [rawObjectMode, issueMode, documentMode].filter(Boolean).length

  if ((params.objectId !== undefined) !== (params.objectClass !== undefined)) {
    return "Provide both objectId and objectClass for raw object targeting."
  }
  if ((params.project !== undefined) !== (params.issueIdentifier !== undefined)) {
    return "Provide both project and issueIdentifier for issue targeting."
  }
  if ((params.teamspace !== undefined) !== (params.document !== undefined)) {
    return "Provide both teamspace and document for document targeting."
  }
  if (modeCount !== 1) return targetModeMessage
  return undefined
}

const CollaboratorMemberInputSchema = Schema.Union(
  AccountUuid.annotations({
    description: "Workspace account UUID to add/remove as collaborator."
  }),
  PersonRefInput.annotations({
    description: "Exact person/employee display name or email. Resolved to the employee account UUID."
  })
)

export type CollaboratorMemberInput = Schema.Schema.Type<typeof CollaboratorMemberInputSchema>

const ObjectCollaboratorsBaseSchema = Schema.Struct({
  ...ObjectTargetFields
}).pipe(Schema.filter(validateObjectTarget))

export const ListObjectCollaboratorsParamsSchema = Schema.Struct({
  ...ObjectTargetFields,
  limit: Schema.optional(
    LimitParam.annotations({
      description: `Maximum number of collaborators to return (default: ${DEFAULT_LIMIT})`
    })
  )
}).pipe(Schema.filter(validateObjectTarget)).annotations({
  title: "ListObjectCollaboratorsParams",
  description: `Parameters for listing collaborators on an object. ${targetModeMessage}`
})

export type ListObjectCollaboratorsParams = Schema.Schema.Type<typeof ListObjectCollaboratorsParamsSchema>

export const AddObjectCollaboratorParamsSchema = Schema.Struct({
  ...ObjectTargetFields,
  member: CollaboratorMemberInputSchema
}).pipe(Schema.filter(validateObjectTarget)).annotations({
  title: "AddObjectCollaboratorParams",
  description: `Parameters for adding a collaborator to an object. ${targetModeMessage}`
})

export type AddObjectCollaboratorParams = Schema.Schema.Type<typeof AddObjectCollaboratorParamsSchema>

export const RemoveObjectCollaboratorParamsSchema = AddObjectCollaboratorParamsSchema.annotations({
  title: "RemoveObjectCollaboratorParams",
  description: `Parameters for removing a collaborator from an object. ${targetModeMessage}`
})

export type RemoveObjectCollaboratorParams = Schema.Schema.Type<typeof RemoveObjectCollaboratorParamsSchema>

export const objectCollaboratorTargetJsonSchema = JSONSchema.make(ObjectCollaboratorsBaseSchema)
export const listObjectCollaboratorsParamsJsonSchema = JSONSchema.make(ListObjectCollaboratorsParamsSchema)
export const addObjectCollaboratorParamsJsonSchema = JSONSchema.make(AddObjectCollaboratorParamsSchema)
export const removeObjectCollaboratorParamsJsonSchema = JSONSchema.make(RemoveObjectCollaboratorParamsSchema)

export const parseListObjectCollaboratorsParams = Schema.decodeUnknown(ListObjectCollaboratorsParamsSchema)
export const parseAddObjectCollaboratorParams = Schema.decodeUnknown(AddObjectCollaboratorParamsSchema)
export const parseRemoveObjectCollaboratorParams = Schema.decodeUnknown(RemoveObjectCollaboratorParamsSchema)

export const ObjectCollaboratorSchema = Schema.Struct({
  id: CollaboratorId,
  objectId: DocId,
  objectClass: ObjectClassName,
  accountUuid: AccountUuid
})
export type ObjectCollaborator = Schema.Schema.Type<typeof ObjectCollaboratorSchema>

export const AddObjectCollaboratorResultSchema = Schema.Struct({
  collaboratorId: CollaboratorId,
  objectId: DocId,
  objectClass: ObjectClassName,
  accountUuid: AccountUuid,
  added: Schema.Boolean
})
export type AddObjectCollaboratorResult = Schema.Schema.Type<typeof AddObjectCollaboratorResultSchema>

export const RemoveObjectCollaboratorResultSchema = Schema.Struct({
  objectId: DocId,
  objectClass: ObjectClassName,
  accountUuid: AccountUuid,
  removed: Schema.Boolean
})
export type RemoveObjectCollaboratorResult = Schema.Schema.Type<typeof RemoveObjectCollaboratorResultSchema>

export const ListObjectCollaboratorsResultSchema = Schema.Array(ObjectCollaboratorSchema)
