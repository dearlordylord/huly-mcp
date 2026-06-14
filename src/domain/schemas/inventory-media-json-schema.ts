import type { Schema } from "effect"
import { JSONSchema } from "effect"

import { DEFAULT_LIMIT } from "./shared.js"

export const INVENTORY_MEDIA_FILE_SOURCE_FIELDS = ["filePath", "fileUrl", "data"] as const

export const inventoryMediaExactlyOneFileSourceMessage = `Provide exactly one of ${
  INVENTORY_MEDIA_FILE_SOURCE_FIELDS.join(", ")
}.`

const INVENTORY_MEDIA_FIELD_DESCRIPTIONS: Readonly<Partial<Record<string, string>>> = {
  product: "Inventory product ID or exact product name. Pass category when duplicate product names may exist.",
  category: "Optional category ID or exact category name used to disambiguate duplicate product names.",
  limit: `Maximum number of matching rows to return (default: ${DEFAULT_LIMIT}).`,
  attachmentId: "Product attachment ID. Must belong directly to the resolved inventory product.",
  photoId: "Product photo ID. Must belong directly to the resolved inventory product.",
  filename: "Name of the file to attach to the inventory product.",
  contentType: "MIME type of the file, such as image/png or application/pdf.",
  filePath: "Local file path to upload. Mutually exclusive with fileUrl and data.",
  fileUrl: "Remote URL to fetch and upload. Mutually exclusive with filePath and data.",
  data: "Base64-encoded file data for small files. Mutually exclusive with filePath and fileUrl.",
  description: "Optional media description. Use null on update to clear it.",
  pinned: "Whether the media item should be pinned.",
  commentId: "Product comment ID. Must belong directly to the resolved inventory product.",
  body: "Comment body. Markdown is supported."
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const withInventoryMediaFieldDescriptions = (schema: object): object => {
  const properties = isRecord(schema) ? schema.properties : undefined
  if (!isRecord(properties)) return schema
  return {
    ...schema,
    properties: Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        const description = INVENTORY_MEDIA_FIELD_DESCRIPTIONS[key]
        return [
          key,
          description === undefined || !isRecord(value) ? value : { ...value, description }
        ]
      })
    )
  }
}

export const inventoryMediaJsonSchema = <A, I, R>(schema: Schema.Schema<A, I, R>): object =>
  withInventoryMediaFieldDescriptions(JSONSchema.make(schema))

export const withExactlyOneInventoryMediaFileSource = (schema: object): object => ({
  ...schema,
  oneOf: INVENTORY_MEDIA_FILE_SOURCE_FIELDS.map((field) => ({ required: [field] }))
})
