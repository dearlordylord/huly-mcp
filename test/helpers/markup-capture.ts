import { Schema } from "effect"

const CapturedMarkupMarkSchema = Schema.Struct({
  type: Schema.optional(Schema.String),
  attrs: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
})

const CapturedMarkupChildNodeSchema = Schema.Struct({
  type: Schema.optional(Schema.String),
  text: Schema.optional(Schema.String),
  attrs: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  marks: Schema.optional(Schema.Array(CapturedMarkupMarkSchema))
})

const CapturedMarkupTreeSchema = Schema.Struct({
  content: Schema.optional(Schema.Array(Schema.Struct({
    content: Schema.optional(Schema.Array(CapturedMarkupChildNodeSchema))
  })))
})

type CapturedMarkupChildNode = Schema.Schema.Type<typeof CapturedMarkupChildNodeSchema>

export const capturedMarkupChildNodes = (markup: string | undefined): ReadonlyArray<CapturedMarkupChildNode> => {
  const parsedMarkup = Schema.decodeUnknownSync(CapturedMarkupTreeSchema)(JSON.parse(markup ?? "{}"))
  return parsedMarkup.content?.flatMap((node) => node.content ?? []) ?? []
}

export const capturedMarkupReferenceNodes = (markup: string | undefined): ReadonlyArray<CapturedMarkupChildNode> =>
  capturedMarkupChildNodes(markup).filter((node) => node.type === "reference")
