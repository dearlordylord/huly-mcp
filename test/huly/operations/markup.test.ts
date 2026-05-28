import { describe, it } from "@effect/vitest"
import type { MarkupMark, MarkupNode } from "@hcengineering/text"
import { jsonToMarkup } from "@hcengineering/text"
import { Effect } from "effect"
import { expect } from "vitest"

import {
  markupToMarkdownString,
  stripInlineCommentMarks,
  testMarkupUrlConfig
} from "../../../src/huly/operations/markup.js"

const makeMarkupDoc = (...content: Array<MarkupNode>): MarkupNode => ({
  type: "doc" as MarkupNode["type"],
  content
})

const makeParagraph = (...content: Array<MarkupNode>): MarkupNode => ({
  type: "paragraph" as MarkupNode["type"],
  content
})

const makeText = (text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>): MarkupNode => {
  const node: MarkupNode = { type: "text" as MarkupNode["type"], text }
  if (marks !== undefined) {
    node.marks = marks as Array<MarkupMark>
  }
  return node
}

describe("stripInlineCommentMarks", () => {
  it.effect("removes inline-comment marks while preserving text", () =>
    Effect.gen(function*() {
      const root = makeMarkupDoc(
        makeParagraph(
          makeText("highlighted ", [{ type: "inline-comment", attrs: { thread: "thread-1" } }]),
          makeText("plain")
        )
      )

      stripInlineCommentMarks(root)

      const paragraph = root.content?.[0]
      const highlighted = paragraph?.content?.[0]
      const plain = paragraph?.content?.[1]

      expect(highlighted?.text).toBe("highlighted ")
      expect(highlighted?.marks ?? []).toEqual([])
      expect(plain?.text).toBe("plain")
    }))
})

describe("markupToMarkdownString", () => {
  it.effect("serializes text with inline-comment marks without error", () =>
    Effect.gen(function*() {
      const root = makeMarkupDoc(
        makeParagraph(
          makeText("Tiêu chí 6: Thông báo lỗi", [{ type: "inline-comment", attrs: { thread: "thread-1" } }])
        )
      )
      const markup = jsonToMarkup(root)

      const markdown = markupToMarkdownString(markup, testMarkupUrlConfig)

      expect(markdown).toContain("Tiêu chí 6: Thông báo lỗi")
    }))
})
