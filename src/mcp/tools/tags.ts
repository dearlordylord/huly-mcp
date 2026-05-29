import {
  attachTagParamsJsonSchema,
  createTagParamsJsonSchema,
  deleteTagParamsJsonSchema,
  detachTagParamsJsonSchema,
  listAttachedTagsParamsJsonSchema,
  listTagsParamsJsonSchema,
  parseAttachTagParams,
  parseCreateTagParams,
  parseDeleteTagParams,
  parseDetachTagParams,
  parseListAttachedTagsParams,
  parseListTagsParams,
  parseUpdateTagParams,
  updateTagParamsJsonSchema
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
import { createToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "tags" as const

export const tagTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_tags",
    description:
      "List generic Huly tag definitions for one SDK target class. Use this for SDK-level tags such as recruiting skills or document labels. For Tracker issue labels, prefer list_labels.",
    category: CATEGORY,
    inputSchema: listTagsParamsJsonSchema,
    handler: createToolHandler(
      "list_tags",
      parseListTagsParams,
      listTags
    )
  },
  {
    name: "create_tag",
    description:
      "Create a generic Huly tag definition for one targetClass. Idempotent by targetClass + title. This exposes the SDK tags model; for Tracker issue labels, prefer create_label.",
    category: CATEGORY,
    inputSchema: createTagParamsJsonSchema,
    handler: createToolHandler(
      "create_tag",
      parseCreateTagParams,
      createTag
    )
  },
  {
    name: "update_tag",
    description:
      "Update a generic Huly tag definition. The tag argument accepts a tag ID or exact title, resolved within targetClass.",
    category: CATEGORY,
    inputSchema: updateTagParamsJsonSchema,
    handler: createToolHandler(
      "update_tag",
      parseUpdateTagParams,
      updateTag
    )
  },
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
    handler: createToolHandler(
      "delete_tag",
      parseDeleteTagParams,
      deleteTag
    )
  },
  {
    name: "list_attached_tags",
    description:
      "List generic Huly TagReference rows attached to one raw object collection. Requires objectId, objectClass, space, and collection because this is an SDK-level tool.",
    category: CATEGORY,
    inputSchema: listAttachedTagsParamsJsonSchema,
    handler: createToolHandler(
      "list_attached_tags",
      parseListAttachedTagsParams,
      listAttachedTags
    )
  },
  {
    name: "attach_tag",
    description:
      "Attach a generic Huly tag to one raw object collection. Requires targetClass for the tag definition and objectId/objectClass/space/collection for the TagReference. Idempotent for the same object, collection, and tag.",
    category: CATEGORY,
    inputSchema: attachTagParamsJsonSchema,
    annotations: {
      idempotentHint: true
    },
    handler: createToolHandler(
      "attach_tag",
      parseAttachTagParams,
      attachTag
    )
  },
  {
    name: "detach_tag",
    description:
      "Detach a generic Huly tag from one raw object collection. Requires targetClass and objectId/objectClass/space/collection. Returns detached=false when the tag is not attached.",
    category: CATEGORY,
    inputSchema: detachTagParamsJsonSchema,
    handler: createToolHandler(
      "detach_tag",
      parseDetachTagParams,
      detachTag
    )
  }
]
