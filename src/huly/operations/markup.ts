/**
 * Shared Markup ↔ Markdown conversion helpers.
 *
 * Huly stores rich text as ProseMirror Markup. MCP tools exchange plain markdown
 * with the LLM. These two functions bridge the gap.
 *
 * @module
 */
import type { Markup } from "@hcengineering/core"
import { jsonToMarkup, type MarkupMark, type MarkupNode, MarkupNodeType, markupToJSON } from "@hcengineering/text"
import { markdownToMarkup, markupToMarkdown } from "@hcengineering/text-markdown"

import {
  DocId,
  type DocId as DocIdType,
  NonEmptyString,
  type NonEmptyString as NonEmptyStringType,
  ObjectClassName,
  type ObjectClassName as ObjectClassNameType,
  type UrlString,
  UrlString as UrlStringSchema
} from "../../domain/schemas/shared.js"
import { isMarkdownSerializableMark } from "./inline-comment-mark.js"

// SDK: jsonToMarkup return type doesn't match Markup; cast contained here.
const jsonAsMarkup: (json: ReturnType<typeof markdownToMarkup>) => Markup = jsonToMarkup

export interface MarkupUrlConfig {
  readonly refUrl: UrlString
  readonly imageUrl: UrlString
}

interface MarkdownWithHulyLinksResult {
  readonly markup: Markup
  readonly malformedReferences: ReadonlyArray<string>
}

interface ParsedBrowseReference {
  readonly id: DocIdType
  readonly objectClass: ObjectClassNameType
  readonly label: NonEmptyStringType
}

type BrowseReferenceParseResult =
  | { readonly _tag: "notReference" }
  | { readonly _tag: "reference"; readonly reference: ParsedBrowseReference }
  | { readonly _tag: "malformed"; readonly reason: string }

interface NativeLinkTransformResult {
  readonly node: MarkupNode
  readonly malformedReferences: ReadonlyArray<string>
  readonly changed: boolean
}

interface ParsedUrlPair {
  readonly candidateUrl: URL
  readonly refUrl: URL
}

// Sent to markdownToMarkup as a fake "home" URL so Huly browse links in MCP
// markdown input stay plain links instead of auto-converting to reference nodes.
// This URL is not used for read serialization or image handling.
export const MARKDOWN_INPUT_REF_URL = "https://huly-mcp.invalid/no-reference-conversion"

const markdownInputRefUrl = UrlStringSchema.make(MARKDOWN_INPUT_REF_URL)

const markdownInputUrlConfig = (urls: MarkupUrlConfig): MarkupUrlConfig => ({
  refUrl: markdownInputRefUrl,
  imageUrl: urls.imageUrl
})

// Mirrors @hcengineering/text-markdown's serializer options; callers use branded MarkupUrlConfig.
interface MarkupMarkdownOptions {
  readonly refUrl: string
  readonly imageUrl: string
}

// Test-only fixture for callers that need deterministic conversion without a real Huly workspace.
export const testMarkupUrlConfig: MarkupUrlConfig = {
  refUrl: UrlStringSchema.make("https://test.invalid/browse?workspace=test"),
  imageUrl: UrlStringSchema.make("https://test.invalid/files?workspace=test&file=")
}

interface SanitizedMarks {
  // MarkupNode.marks is optional in Huly's JSON shape; preserve absence instead of normalizing to [].
  readonly marks: Array<MarkupMark> | undefined
  readonly changed: boolean
}

const removeMarkdownUnsupportedMarks = (
  // MarkupNode.marks is optional in Huly's JSON shape; preserve absence instead of normalizing to [].
  marks: Array<MarkupMark> | undefined
): SanitizedMarks => {
  if (marks === undefined) {
    return { marks: undefined, changed: false }
  }

  // Compatibility shim until @hcengineering/text-markdown includes https://github.com/hcengineering/huly.core/pull/19.
  const filtered = marks.filter(isMarkdownSerializableMark)
  return { marks: filtered, changed: filtered.length !== marks.length }
}

interface SanitizedContent {
  readonly content: Array<MarkupNode> | undefined
  readonly changed: boolean
}

const sanitizeContentForMarkdown = (content: Array<MarkupNode> | undefined): SanitizedContent => {
  if (content === undefined) {
    return { content: undefined, changed: false }
  }

  const sanitized = content.map(sanitizeNodeForMarkdown)
  return {
    content: sanitized,
    changed: sanitized.some((node, index) => node !== content[index])
  }
}

export const sanitizeNodeForMarkdown = (node: MarkupNode): MarkupNode => {
  const content = sanitizeContentForMarkdown(node.content)
  const marks = removeMarkdownUnsupportedMarks(node.marks)

  if (!content.changed && !marks.changed) {
    return node
  }

  return {
    ...node,
    ...(content.content === undefined ? {} : { content: content.content }),
    ...(marks.marks === undefined ? {} : { marks: marks.marks })
  }
}

type MarkupNodeToMarkdown = (node: MarkupNode, urls: MarkupMarkdownOptions) => string

export const markupNodeToMarkdownString = (
  node: MarkupNode,
  urls: MarkupMarkdownOptions,
  serialize: MarkupNodeToMarkdown = markupToMarkdown
): string => serialize(sanitizeNodeForMarkdown(node), urls)

export const markupToMarkdownString = (markup: Markup, urls: MarkupUrlConfig): string => {
  const json = markupToJSON(markup)
  return markupNodeToMarkdownString(json, urls)
}

export const markdownToMarkupString = (markdown: string, urls: MarkupUrlConfig): Markup => {
  const json = markdownToMarkup(markdown, markdownInputUrlConfig(urls))
  return jsonAsMarkup(json)
}

const trimmedQueryValue = (query: URLSearchParams, name: string): string | undefined => {
  const value = query.get(name)
  if (value === null) {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed === "" ? undefined : trimmed
}

const hasAnyNativeReferenceQueryField = (query: URLSearchParams): boolean =>
  ["_id", "_class", "label"].some((name) => query.has(name))

const parseUrlPair = (href: string, refUrl: UrlString): ParsedUrlPair | undefined => {
  try {
    return {
      candidateUrl: new URL(href),
      refUrl: new URL(refUrl)
    }
  } catch {
    return undefined
  }
}

const parseNativeReferenceQuery = (
  query: URLSearchParams
): { readonly _tag: "missing"; readonly missing: ReadonlyArray<string> } | {
  readonly _tag: "reference"
  readonly reference: ParsedBrowseReference
} => {
  const id = trimmedQueryValue(query, "_id")
  const objectClass = trimmedQueryValue(query, "_class")
  const label = trimmedQueryValue(query, "label")

  if (id === undefined || objectClass === undefined || label === undefined) {
    const missing = [
      id === undefined ? "id" : undefined,
      objectClass === undefined ? "objectclass" : undefined,
      label === undefined ? "label" : undefined
    ].filter((name) => name !== undefined)

    return { _tag: "missing", missing }
  }

  return {
    _tag: "reference",
    reference: {
      id: DocId.make(id),
      objectClass: ObjectClassName.make(objectClass),
      label: NonEmptyString.make(label)
    }
  }
}

const parseNativeBrowseReferenceHref = (href: string, urls: MarkupUrlConfig): BrowseReferenceParseResult => {
  const parsedUrlPair = parseUrlPair(href, urls.refUrl)
  if (parsedUrlPair === undefined) {
    return { _tag: "notReference" }
  }
  const { candidateUrl, refUrl } = parsedUrlPair

  if (candidateUrl.origin !== refUrl.origin || candidateUrl.pathname !== refUrl.pathname) {
    return { _tag: "notReference" }
  }

  if (candidateUrl.searchParams.get("workspace") !== refUrl.searchParams.get("workspace")) {
    return { _tag: "notReference" }
  }

  if (!hasAnyNativeReferenceQueryField(candidateUrl.searchParams)) {
    return { _tag: "notReference" }
  }

  const parsedQuery = parseNativeReferenceQuery(candidateUrl.searchParams)
  if (parsedQuery._tag === "missing") {
    return { _tag: "malformed", reason: `reference missing ${parsedQuery.missing.join(", ")}` }
  }

  return {
    _tag: "reference",
    reference: parsedQuery.reference
  }
}

const linkHref = (node: MarkupNode): string | undefined => {
  const linkMark = node.marks?.find((mark) => mark.type === "link" && typeof mark.attrs?.href === "string")
  const href = linkMark?.attrs?.href
  return typeof href === "string" ? href : undefined
}

const referenceNodeFromTextNode = (
  node: MarkupNode,
  reference: ParsedBrowseReference
): MarkupNode => ({
  type: MarkupNodeType.reference,
  attrs: {
    id: reference.id,
    objectclass: reference.objectClass,
    label: reference.label
  },
  content: [{
    type: MarkupNodeType.text,
    text: typeof node.text === "string" && node.text !== "" ? node.text : reference.label,
    marks: []
  }]
})

const transformNativeReferenceLinks = (node: MarkupNode, urls: MarkupUrlConfig): NativeLinkTransformResult => {
  const href = node.type === MarkupNodeType.text ? linkHref(node) : undefined
  if (href !== undefined) {
    const parsed = parseNativeBrowseReferenceHref(href, urls)
    if (parsed._tag === "malformed") {
      return { node, malformedReferences: [parsed.reason], changed: false }
    }
    if (parsed._tag === "reference") {
      return {
        node: referenceNodeFromTextNode(node, parsed.reference),
        malformedReferences: [],
        changed: true
      }
    }
  }

  if (node.content === undefined) {
    return { node, malformedReferences: [], changed: false }
  }

  const transformed = node.content.map((child) => transformNativeReferenceLinks(child, urls))
  const changed = transformed.some((entry) => entry.changed)
  return {
    node: changed ? { ...node, content: transformed.map((entry) => entry.node) } : node,
    malformedReferences: transformed.flatMap((entry) => entry.malformedReferences),
    changed
  }
}

export const markdownToMarkupStringWithHulyLinks = (
  markdown: string,
  urls: MarkupUrlConfig
): MarkdownWithHulyLinksResult => {
  const json = markdownToMarkup(markdown, markdownInputUrlConfig(urls))
  const transformed = transformNativeReferenceLinks(json, urls)
  return {
    markup: jsonAsMarkup(transformed.node),
    malformedReferences: transformed.malformedReferences
  }
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
