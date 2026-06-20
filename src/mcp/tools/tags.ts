import {
  attachTagParamsJsonSchema,
  AttachTagResultSchema,
  createTagParamsJsonSchema,
  CreateTagResultSchema,
  deleteTagParamsJsonSchema,
  DeleteTagResultSchema,
  detachTagParamsJsonSchema,
  DetachTagResultSchema,
  listAttachedTagsParamsJsonSchema,
  ListAttachedTagsResultSchema,
  listTagsParamsJsonSchema,
  ListTagsResultSchema,
  parseAttachTagParams,
  parseCreateTagParams,
  parseDeleteTagParams,
  parseDetachTagParams,
  parseListAttachedTagsParams,
  parseListTagsParams,
  parseUpdateTagParams,
  updateTagParamsJsonSchema,
  UpdateTagResultSchema
} from "../../domain/schemas/tags.js"
import {
  attachTag,
  createTag,
  deleteTag,
  detachTag,
  listAttachedTags,
  listTags,
  updateTag
} from "../../huly/operations/tags.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "tags" as const

export const tagTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_tags",
      description:
        "List generic Huly tag definitions for one SDK target class. Use this for SDK-level tags such as recruiting skills or document labels. For Tracker issue labels, prefer list_labels.",
      category: CATEGORY,
      inputSchema: listTagsParamsJsonSchema,
      resultSchema: ListTagsResultSchema
    },
    parseListTagsParams,
    listTags
  ),
  defineTool(
    {
      name: "create_tag",
      description:
        "Create a generic Huly tag definition for one targetClass. Idempotent by targetClass + title. This exposes the SDK tags model; for Tracker issue labels, prefer create_label.",
      category: CATEGORY,
      inputSchema: createTagParamsJsonSchema,
      resultSchema: CreateTagResultSchema
    },
    parseCreateTagParams,
    createTag
  ),
  defineTool(
    {
      name: "update_tag",
      description:
        "Update a generic Huly tag definition. The tag argument accepts a tag ID or exact title, resolved within targetClass.",
      category: CATEGORY,
      inputSchema: updateTagParamsJsonSchema,
      resultSchema: UpdateTagResultSchema
    },
    parseUpdateTagParams,
    updateTag
  ),
  defineTool(
    {
      name: "delete_tag",
      description:
        "Delete a generic Huly tag definition by ID or exact title, resolved within targetClass. This deletes the tag definition, not only one object's tag reference.",
      category: CATEGORY,
      inputSchema: deleteTagParamsJsonSchema,
      annotations: {
        destructiveHint: true,
        idempotentHint: false
      },
      resultSchema: DeleteTagResultSchema
    },
    parseDeleteTagParams,
    deleteTag
  ),
  defineTool(
    {
      name: "list_attached_tags",
      description:
        "List generic Huly TagReference rows attached to one raw object collection. Requires objectId, objectClass, space, and collection because this is an SDK-level tool.",
      category: CATEGORY,
      inputSchema: listAttachedTagsParamsJsonSchema,
      resultSchema: ListAttachedTagsResultSchema
    },
    parseListAttachedTagsParams,
    listAttachedTags
  ),
  defineTool(
    {
      name: "attach_tag",
      description:
        "Attach a generic Huly tag to one raw object collection. Requires targetClass for the tag definition and objectId/objectClass/space/collection for the TagReference. Idempotent for the same object, collection, and tag.",
      category: CATEGORY,
      inputSchema: attachTagParamsJsonSchema,
      annotations: {
        idempotentHint: true
      },
      resultSchema: AttachTagResultSchema
    },
    parseAttachTagParams,
    attachTag
  ),
  defineTool(
    {
      name: "detach_tag",
      description:
        "Detach a generic Huly tag from one raw object collection. Requires targetClass and objectId/objectClass/space/collection. Returns detached=false when the tag is not attached.",
      category: CATEGORY,
      inputSchema: detachTagParamsJsonSchema,
      resultSchema: DetachTagResultSchema
    },
    parseDetachTagParams,
    detachTag
  )
]
