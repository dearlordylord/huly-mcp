import { gunzipSync } from "node:zlib"
import { Schema } from "effect"
import catalogData from "./catalog.json" with { type: "json" }
import type { McpToolName } from "./eager.js"
import { toolGroupLoaders, type ToolGroupName } from "./group-loaders.js"
import { ToolCategory, ToolDescription } from "./registry.js"

const CatalogEnvelopeSchema = Schema.Struct({ encoding: Schema.Literal("gzip-base64"), data: Schema.String })
const envelope = Schema.decodeUnknownSync(CatalogEnvelopeSchema)(catalogData)
const decoded: unknown = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(
  gunzipSync(Buffer.from(envelope.data, "base64")).toString("utf8")
)
const catalogNames = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ name: Schema.String })))(decoded)

// The generated catalog and the authoring registry share the same verified names.
const names: ReadonlySet<string> = new Set(catalogNames.map((entry) => entry.name))
const NameSchema = Schema.declare((value): value is McpToolName => typeof value === "string" && names.has(value))
const GroupSchema = Schema.declare(
  (value): value is ToolGroupName => typeof value === "string" && Object.hasOwn(toolGroupLoaders, value)
)
const JsonObject = Schema.Record(Schema.String, Schema.Unknown)
const OutputSchema = Schema.StructWithRest(
  Schema.Struct({
    type: Schema.Literal("object"),
    properties: Schema.optionalKey(JsonObject),
    required: Schema.optionalKey(Schema.Array(Schema.String))
  }),
  [JsonObject]
)
const AnnotationsSchema = Schema.Struct({
  title: Schema.optionalKey(Schema.String),
  readOnlyHint: Schema.optionalKey(Schema.Boolean),
  destructiveHint: Schema.optionalKey(Schema.Boolean),
  idempotentHint: Schema.optionalKey(Schema.Boolean),
  openWorldHint: Schema.optionalKey(Schema.Boolean)
})
export const ToolCatalogSchema = Schema.Array(
  Schema.Struct({
    group: GroupSchema,
    name: NameSchema,
    description: ToolDescription,
    category: ToolCategory,
    inputSchema: JsonObject,
    outputSchema: OutputSchema,
    annotations: Schema.optionalKey(AnnotationsSchema)
  })
)
export const toolCatalog = Schema.decodeUnknownSync(ToolCatalogSchema)(decoded)
