import {
  addObjectCollaboratorParamsJsonSchema,
  AddObjectCollaboratorResultSchema,
  listObjectCollaboratorsParamsJsonSchema,
  ListObjectCollaboratorsResultSchema,
  parseAddObjectCollaboratorParams,
  parseListObjectCollaboratorsParams,
  parseRemoveObjectCollaboratorParams,
  removeObjectCollaboratorParamsJsonSchema,
  RemoveObjectCollaboratorResultSchema
} from "../../domain/schemas/collaborators.js"
import {
  addObjectCollaborator,
  listObjectCollaborators,
  removeObjectCollaborator
} from "../../huly/operations/collaborators.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "collaborators" as const
export const collaboratorTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_object_collaborators",
      description:
        "List notification collaborators on a Huly issue, document, or raw object. Prefer friendly targets: project+issueIdentifier for issues or teamspace+document for documents. Advanced callers may pass objectId+objectClass directly.",
      category: CATEGORY,
      inputSchema: listObjectCollaboratorsParamsJsonSchema,
      resultSchema: ListObjectCollaboratorsResultSchema
    },
    parseListObjectCollaboratorsParams,
    listObjectCollaborators
  ),
  defineTool(
    {
      name: "add_object_collaborator",
      description:
        "Subscribe a workspace member to object notifications by adding a core collaborator row. Member can be an account UUID, exact employee/person name, or email. Idempotent when already subscribed.",
      category: CATEGORY,
      inputSchema: addObjectCollaboratorParamsJsonSchema,
      resultSchema: AddObjectCollaboratorResultSchema
    },
    parseAddObjectCollaboratorParams,
    addObjectCollaborator
  ),
  defineTool(
    {
      name: "remove_object_collaborator",
      description:
        "Unsubscribe a workspace member from object notifications by removing its collaborator row. Member can be an account UUID, exact employee/person name, or email. Idempotent when already absent.",
      category: CATEGORY,
      inputSchema: removeObjectCollaboratorParamsJsonSchema,
      resultSchema: RemoveObjectCollaboratorResultSchema
    },
    parseRemoveObjectCollaboratorParams,
    removeObjectCollaborator
  )
]
