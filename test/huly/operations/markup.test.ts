import { describe, it } from "@effect/vitest"
import { markupToJSON } from "@hcengineering/text"
import { Effect } from "effect"
import { expect } from "vitest"

import { INLINE_COMMENT_MARK_TYPE } from "../../../src/huly/operations/inline-comment-mark.js"
import {
  markupToMarkdownString,
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
