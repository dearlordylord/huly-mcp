/**
 * Shared Markup ↔ Markdown conversion helpers.
 *
 * Huly stores rich text as ProseMirror Markup. MCP tools exchange plain markdown
 * with the LLM. These two functions bridge the gap.
 *
 * @module
 */
import type { Markup } from "@hcengineering/core"
import { jsonToMarkup, markupToJSON } from "@hcengineering/text"
import { markdownToMarkup, markupToMarkdown } from "@hcengineering/text-markdown"

// SDK: jsonToMarkup return type doesn't match Markup; cast contained here.
const jsonAsMarkup: (json: ReturnType<typeof markdownToMarkup>) => Markup = jsonToMarkup

interface MarkupUrlConfig {
  readonly refUrl: string
  readonly imageUrl: string
}

const emptyUrlConfig: MarkupUrlConfig = { refUrl: "", imageUrl: "" }

// Exported for test assertions; production code should prefer client.toMarkdown/toMarkup.
// eslint-disable-next-line import-x/no-unused-modules
export const markupToMarkdownString = (markup: Markup, urls?: MarkupUrlConfig): string => {
  const json = markupToJSON(markup)
  return markupToMarkdown(json, urls ?? emptyUrlConfig)
}

export const markdownToMarkupString = (markdown: string, urls?: MarkupUrlConfig): Markup => {
  const json = markdownToMarkup(markdown, urls ?? emptyUrlConfig)
  return jsonAsMarkup(json)
}

export const optionalMarkdownToMarkup = (
  md: string | undefined | null,
  fallback: Markup | "" = "",
  urls?: MarkupUrlConfig
): Markup | "" => md && md.trim() !== "" ? markdownToMarkupString(md, urls) : fallback

export function optionalMarkupToMarkdown(
  markup: Markup | undefined | null,
  fallback: undefined,
  urls?: MarkupUrlConfig
): string | undefined
export function optionalMarkupToMarkdown(
  markup: Markup | undefined | null,
  fallback?: string,
  urls?: MarkupUrlConfig
): string
export function optionalMarkupToMarkdown(
  markup: Markup | undefined | null,
  fallback: string | undefined = "",
  urls?: MarkupUrlConfig
): string | undefined {
  return markup ? markupToMarkdownString(markup, urls) : fallback
}
