import {
  createAssociationParamsJsonSchema,
  CreateAssociationResultSchema,
  createRelationParamsJsonSchema,
  CreateRelationResultSchema,
  deleteAssociationParamsJsonSchema,
  DeleteAssociationResultSchema,
  deleteRelationParamsJsonSchema,
  DeleteRelationResultSchema,
  listAssociationsParamsJsonSchema,
  ListAssociationsResultSchema,
  listRelationsParamsJsonSchema,
  ListRelationsResultSchema,
  parseCreateAssociationParams,
  parseCreateRelationParams,
  parseDeleteAssociationParams,
  parseDeleteRelationParams,
  parseListAssociationsParams,
  parseListRelationsParams
} from "../../domain/schemas/generic-associations.js"
import {
  createAssociation,
  createRelation,
  deleteAssociation,
  deleteRelation,
  listAssociations,
  listRelations
} from "../../huly/operations/generic-associations.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "associations" as const
export const genericAssociationTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_associations",
      description:
        "List Huly association definitions: class-level typed links that define which document classes may be related. Use this before create_relation to discover association IDs, source/target classes, and whether relation writes are supported.",
      category: CATEGORY,
      inputSchema: listAssociationsParamsJsonSchema,
      resultSchema: ListAssociationsResultSchema
    },
    parseListAssociationsParams,
    listAssociations
  ),
  defineTool(
    {
      name: "create_association",
      description:
        "Idempotently create one Huly association definition between two non-system classes. Use sourceClass/targetClass with sourceRole/targetRole and cardinality; returns an existing identical association by default.",
      category: CATEGORY,
      inputSchema: createAssociationParamsJsonSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      resultSchema: CreateAssociationResultSchema
    },
    parseCreateAssociationParams,
    createAssociation
  ),
  defineTool(
    {
      name: "delete_association",
      description:
        "Idempotently delete one Huly association definition only when no concrete relations reference it. If relations exist, delete_relation must clean them up first; deleting an already-missing association is a successful no-op.",
      category: CATEGORY,
      inputSchema: deleteAssociationParamsJsonSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      },
      resultSchema: DeleteAssociationResultSchema
    },
    parseDeleteAssociationParams,
    deleteAssociation
  ),
  defineTool(
    {
      name: "list_relations",
      description:
        "List concrete Huly relation instances under an association, optionally filtered by source and target documents. Endpoint locators support raw, issue, document, and card. Requires at least one filter to avoid broad workspace scans.",
      category: CATEGORY,
      inputSchema: listRelationsParamsJsonSchema,
      resultSchema: ListRelationsResultSchema
    },
    parseListRelationsParams,
    listRelations
  ),
  defineTool(
    {
      name: "create_relation",
      description:
        "Idempotently create one concrete relation between two resolved documents for a writable association. Endpoint locators support raw, issue, document, and card. Enforces association endpoint classes, direction, duplicate handling, automation-only restrictions, and cardinality.",
      category: CATEGORY,
      inputSchema: createRelationParamsJsonSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      resultSchema: CreateRelationResultSchema
    },
    parseCreateRelationParams,
    createRelation
  ),
  defineTool(
    {
      name: "delete_relation",
      description:
        "Idempotently delete one concrete relation by relation ID or by exact association/source/target triple. Triple endpoint locators support raw, issue, document, and card. Triple deletes use the same direction semantics as create_relation and fail if the selector is ambiguous.",
      category: CATEGORY,
      inputSchema: deleteRelationParamsJsonSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false
      },
      resultSchema: DeleteRelationResultSchema
    },
    parseDeleteRelationParams,
    deleteRelation
  )
]
