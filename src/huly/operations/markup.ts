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

import { type UrlString, UrlString as UrlStringSchema } from "../../domain/schemas/shared.js"

// SDK: jsonToMarkup return type doesn't match Markup; cast contained here.
const jsonAsMarkup: (json: ReturnType<typeof markdownToMarkup>) => Markup = jsonToMarkup

export interface MarkupUrlConfig {
  readonly refUrl: UrlString
  readonly imageUrl: UrlString
}

// Test-only fixture for callers that need deterministic conversion without a real Huly workspace.
export const testMarkupUrlConfig: MarkupUrlConfig = {
  refUrl: UrlStringSchema.make("https://test.invalid/browse?workspace=test"),
  imageUrl: UrlStringSchema.make("https://test.invalid/files?workspace=test&file=")
}

export const markupToMarkdownString = (markup: Markup, urls: MarkupUrlConfig): string => {
  const json = markupToJSON(markup)
  return markupToMarkdown(json, urls)
}

export const markdownToMarkupString = (markdown: string, urls: MarkupUrlConfig): Markup => {
  const json = markdownToMarkup(markdown, urls)
  return jsonAsMarkup(json)
}

export const optionalMarkdownToMarkup = (
  md: string | undefined | null,
  urls: MarkupUrlConfig,
  fallback: Markup | "" = ""
): Markup | "" => md && md.trim() !== "" ? markdownToMarkupString(md, urls) : fallback

export function optionalMarkupToMarkdown(
  markup: Markup | undefined | null,
  urls: MarkupUrlConfig,
  fallback: undefined
): string | undefined
export function optionalMarkupToMarkdown(
  markup: Markup | undefined | null,
  urls: MarkupUrlConfig,
  fallback?: string
): string
export function optionalMarkupToMarkdown(
  markup: Markup | undefined | null,
  urls: MarkupUrlConfig,
  fallback: string | undefined = ""
): string | undefined {
  return markup === null || markup === undefined ? fallback : markupToMarkdownString(markup, urls)
}
