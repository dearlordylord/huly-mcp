import {
  createRelationParamsJsonSchema,
  CreateRelationResultSchema,
  deleteRelationParamsJsonSchema,
  DeleteRelationResultSchema,
  listAssociationsParamsJsonSchema,
  ListAssociationsResultSchema,
  listRelationsParamsJsonSchema,
  ListRelationsResultSchema,
  parseCreateRelationParams,
  parseDeleteRelationParams,
  parseListAssociationsParams,
  parseListRelationsParams
} from "../../domain/schemas/generic-associations.js"
import {
  createRelation,
  deleteRelation,
  listAssociations,
  listRelations
} from "../../huly/operations/generic-associations.js"
import { createEncodedToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "associations" as const

export const genericAssociationTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_associations",
    description:
      "List Huly association definitions: class-level typed links that define which document classes may be related. Use this before create_relation to discover association IDs, source/target classes, and whether relation writes are supported.",
    category: CATEGORY,
    inputSchema: listAssociationsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_associations",
      parseListAssociationsParams,
      listAssociations,
      ListAssociationsResultSchema
    )
  },
  {
    name: "list_relations",
    description:
      "List concrete Huly relation instances under an association, optionally filtered by source and target documents. Requires at least one filter to avoid broad workspace scans.",
    category: CATEGORY,
    inputSchema: listRelationsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_relations",
      parseListRelationsParams,
      listRelations,
      ListRelationsResultSchema
    )
  },
  {
    name: "create_relation",
    description:
      "Idempotently create one concrete relation between two resolved documents. Only succeeds for associations where list_associations reports canCreateRelation=true; otherwise it fails clearly. This build currently reports no generic associations as writable until a write allowlist is live-validated.",
    category: CATEGORY,
    inputSchema: createRelationParamsJsonSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false
    },
    handler: createEncodedToolHandler(
      "create_relation",
      parseCreateRelationParams,
      createRelation,
      CreateRelationResultSchema
    )
  },
  {
    name: "delete_relation",
    description:
      "Idempotently delete one concrete relation by relation ID or by exact association/source/target triple. Only succeeds for associations where list_associations reports canDeleteRelation=true; otherwise it fails clearly. This build currently reports no generic associations as writable until a write allowlist is live-validated.",
    category: CATEGORY,
    inputSchema: deleteRelationParamsJsonSchema,
    handler: createEncodedToolHandler(
      "delete_relation",
      parseDeleteRelationParams,
      deleteRelation,
      DeleteRelationResultSchema
    )
  }
]
