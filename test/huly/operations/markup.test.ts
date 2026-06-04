import { describe, it } from "@effect/vitest"
import { MarkupMarkType, MarkupNodeType, markupToJSON } from "@hcengineering/text"
import { Effect } from "effect"
import { expect } from "vitest"

import { INLINE_COMMENT_MARK_TYPE } from "../../../src/huly/operations/inline-comment-mark.js"
import {
  markdownToMarkupString,
  markupToMarkdownString,
  optionalMarkupToMarkdown,
  sanitizeNodeForMarkdown,
  testMarkupUrlConfig
} from "../../../src/huly/operations/markup.js"

const markupWithInlineComment = JSON.stringify({
  type: "doc",
  content: [{
    type: "paragraph",
    content: [{
      type: "text",
      text: "highlighted text",
      marks: [{ type: INLINE_COMMENT_MARK_TYPE, attrs: { thread: "thread-1" } }]
    }]
  }]
})

describe("markupToMarkdownString", () => {
  it.effect("serializes text with inline-comment marks without exposing thread metadata", () =>
    Effect.gen(function*() {
      const markdown = markupToMarkdownString(markupWithInlineComment, testMarkupUrlConfig)

      expect(markdown.trim()).toBe("highlighted text")
      expect(markdown).not.toContain(INLINE_COMMENT_MARK_TYPE)
      expect(markdown).not.toContain("thread-1")
    }))

  it.effect("serializes existing Huly reference nodes as browse links", () =>
    Effect.gen(function*() {
      const referenceMarkup = JSON.stringify({
        type: MarkupNodeType.doc,
        content: [{
          type: MarkupNodeType.paragraph,
          content: [
            { type: MarkupNodeType.text, text: "I meant " },
            {
              type: MarkupNodeType.reference,
              attrs: {
                id: "doc-1",
                label: "Test Document",
                objectclass: "document:class:Document"
              }
            },
            { type: MarkupNodeType.text, text: " like this" }
          ]
        }]
      })

      const markdown = markupToMarkdownString(referenceMarkup, testMarkupUrlConfig)

      expect(markdown).toContain("[Test Document](")
      expect(markdown).toContain("_class=document%3Aclass%3ADocument")
      expect(markdown).toContain("_id=doc-1")
    }))
})

describe("markdownToMarkupString", () => {
  it.effect("keeps matching Huly browse URLs as markdown links instead of editor reference nodes", () =>
    Effect.gen(function*() {
      const markdown =
        "I meant [Test Document](https://test.invalid/browse?workspace=test&_class=document%3Aclass%3ADocument&_id=doc-1&label=Test%20Document) like this"

      const markup = markdownToMarkupString(markdown, testMarkupUrlConfig)
      const root = markupToJSON(markup)
      const paragraph = root.content?.[0]
      const content = paragraph?.content ?? []
      const linkedText = content.find((node) => node.type === MarkupNodeType.text && node.text === "Test Document")

      expect(content.some((node) => node.type === MarkupNodeType.reference)).toBe(false)
      expect(linkedText).toBeDefined()
      expect(linkedText?.marks).toContainEqual({
        type: MarkupMarkType.link,
        attrs: {
          href:
            "https://test.invalid/browse?workspace=test&_class=document%3Aclass%3ADocument&_id=doc-1&label=Test%20Document"
        }
      })
    }))
})

describe("optionalMarkupToMarkdown", () => {
  it.effect("returns the fallback when markup is null", () =>
    Effect.gen(function*() {
      // A `fallback` of undefined is coerced to "" by the default parameter.
      expect(optionalMarkupToMarkdown(null, testMarkupUrlConfig)).toBe("")
      expect(optionalMarkupToMarkdown(null, testMarkupUrlConfig, undefined)).toBe("")
    }))

  it.effect("returns the fallback when markup is undefined", () =>
    Effect.gen(function*() {
      expect(optionalMarkupToMarkdown(undefined, testMarkupUrlConfig, "none")).toBe("none")
    }))

  it.effect("serializes the markup when present", () =>
    Effect.gen(function*() {
      expect(optionalMarkupToMarkdown(markupWithInlineComment, testMarkupUrlConfig).trim())
        .toBe("highlighted text")
    }))
})

describe("sanitizeNodeForMarkdown", () => {
  it.effect("returns markdown-safe markup without mutating inline comment metadata on the source tree", () =>
    Effect.gen(function*() {
      const root = markupToJSON(markupWithInlineComment)

      const sanitized = sanitizeNodeForMarkdown(root)

      expect(sanitized).not.toBe(root)
      expect(JSON.stringify(root)).toContain(INLINE_COMMENT_MARK_TYPE)
      expect(JSON.stringify(root)).toContain("thread-1")
      expect(JSON.stringify(sanitized)).not.toContain(INLINE_COMMENT_MARK_TYPE)
      expect(JSON.stringify(sanitized)).not.toContain("thread-1")
    }))
})
