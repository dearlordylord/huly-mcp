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

export const markupToMarkdownString = (markup: Markup): string => {
  const json = markupToJSON(markup)
  return markupToMarkdown(json, { refUrl: "", imageUrl: "" })
}

export const markdownToMarkupString = (markdown: string): Markup => {
  const json = markdownToMarkup(markdown, { refUrl: "", imageUrl: "" })
  return jsonAsMarkup(json)
}

export const optionalMarkdownToMarkup = (md: string | undefined | null, fallback: Markup | "" = ""): Markup | "" =>
  md && md.trim() !== "" ? markdownToMarkupString(md) : fallback

export function optionalMarkupToMarkdown(markup: Markup | undefined | null, fallback: undefined): string | undefined
export function optionalMarkupToMarkdown(markup: Markup | undefined | null, fallback?: string): string
export function optionalMarkupToMarkdown(
  markup: Markup | undefined | null,
  fallback: string | undefined = ""
): string | undefined {
  return markup ? markupToMarkdownString(markup) : fallback
}
