/**
 * Native reference support for document markdown writes.
 *
 * MCP callers write canonical Huly browse links in markdown. This layer turns
 * current-workspace browse links into native reference nodes before saving.
 *
 * @module
 */
import type { MarkupFormat } from "@hcengineering/api-client"
import { Effect } from "effect"

import { HulyClient } from "../client.js"
import { DocumentReferenceError } from "../errors.js"
import { markdownToMarkupStringWithHulyLinks } from "./markup.js"

interface RenderedDocumentContent {
  readonly markup: string
  readonly format: MarkupFormat
}

const malformedReferenceList = (entries: ReadonlyArray<string>): string =>
  entries.map((entry) => `'${entry}'`).join(", ")

export const renderDocumentContentForWrite = (content: string): Effect.Effect<
  RenderedDocumentContent,
  DocumentReferenceError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const rendered = markdownToMarkupStringWithHulyLinks(content, client.markupUrlConfig)
    if (rendered.malformedReferences.length > 0) {
      return yield* new DocumentReferenceError({
        reason: `malformed Huly native reference links in content: ${
          malformedReferenceList(rendered.malformedReferences)
        }`
      })
    }

    return { markup: rendered.markup, format: "markup" }
  })
