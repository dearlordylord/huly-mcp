/**
 * Native reference support for markdown writes.
 *
 * MCP callers write canonical Huly browse links in markdown. This functional
 * core turns current-workspace browse links into native reference nodes before
 * saving through collaborator markup APIs.
 *
 * @module
 */
import type { MarkupFormat } from "@hcengineering/api-client"

import { markdownToMarkupStringWithHulyLinks, type MarkupUrlConfig } from "./markup.js"

interface RenderedNativeReferenceMarkup {
  readonly markup: string
  readonly format: MarkupFormat
}

type NativeReferenceMarkupResult =
  | { readonly _tag: "success"; readonly rendered: RenderedNativeReferenceMarkup }
  | { readonly _tag: "malformed"; readonly reason: string }

const malformedReferenceList = (entries: ReadonlyArray<string>): string =>
  entries.map((entry) => `'${entry}'`).join(", ")

export const renderMarkdownWithNativeReferencesForWrite = (
  content: string,
  urls: MarkupUrlConfig,
  fieldName: string
): NativeReferenceMarkupResult => {
  const rendered = markdownToMarkupStringWithHulyLinks(content, urls)
  if (rendered.malformedReferences.length > 0) {
    return {
      _tag: "malformed",
      reason: `malformed Huly native reference links in ${fieldName}: ${
        malformedReferenceList(rendered.malformedReferences)
      }`
    }
  }

  return {
    _tag: "success",
    rendered: { markup: rendered.markup, format: "markup" }
  }
}
