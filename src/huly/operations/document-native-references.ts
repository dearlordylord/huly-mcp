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
import { renderMarkdownWithNativeReferencesForWrite } from "./native-reference-markup.js"

interface RenderedDocumentContent {
  readonly markup: string
  readonly format: MarkupFormat
}

export const renderDocumentContentForWrite = (content: string): Effect.Effect<
  RenderedDocumentContent,
  DocumentReferenceError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const rendered = renderMarkdownWithNativeReferencesForWrite(content, client.markupUrlConfig, "content")
    if (rendered._tag === "malformed") {
      return yield* new DocumentReferenceError({ reason: rendered.reason })
    }

    return rendered.rendered
  })
