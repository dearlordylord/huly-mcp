import { describe, it } from "@effect/vitest"
import type { MarkupNode } from "@hcengineering/text"
import { markupToJSON } from "@hcengineering/text"
import { Effect } from "effect"
import { expect } from "vitest"
import { extractInlineComments } from "../../../src/huly/operations/documents-inline-comments.js"
import { INLINE_COMMENT_MARK_TYPE } from "../../../src/huly/operations/inline-comment-mark.js"

interface TestMark {
  readonly type: string
  readonly attrs?: Record<string, unknown>
}

interface TestNode {
  readonly type: string
  readonly content?: ReadonlyArray<TestNode>
  readonly marks?: ReadonlyArray<TestMark>
  readonly text?: string
}

const makeMarkupDoc = (...content: Array<TestNode>): MarkupNode =>
  markupToJSON(JSON.stringify({
    type: "doc",
    content
  }))

const makeParagraph = (...content: Array<TestNode>): TestNode => ({
  type: "paragraph",
  content
})

const makeText = (text: string, marks?: Array<TestMark>): TestNode => ({
  type: "text",
  text,
  ...(marks === undefined ? {} : { marks })
})

describe("extractInlineComments", () => {
  it.effect("extracts single inline comment thread", () =>
    Effect.gen(function*() {
      const root = makeMarkupDoc(
        makeParagraph(
          makeText("hello ", [{ type: INLINE_COMMENT_MARK_TYPE, attrs: { thread: "thread-1" } }]),
          makeText("world")
        )
      )

      const result = extractInlineComments(root)

      expect(result).toHaveLength(1)
      expect(result[0]?.threadId).toBe("thread-1")
      expect(result[0]?.textFragments).toEqual(["hello "])
    }))

  it.effect("groups fragments by thread ID", () =>
    Effect.gen(function*() {
      const root = makeMarkupDoc(
        makeParagraph(
          makeText("first ", [{ type: INLINE_COMMENT_MARK_TYPE, attrs: { thread: "t1" } }]),
          makeText("middle"),
          makeText("second", [{ type: INLINE_COMMENT_MARK_TYPE, attrs: { thread: "t1" } }])
        )
      )

      const result = extractInlineComments(root)

      expect(result).toHaveLength(1)
      expect(result[0]?.threadId).toBe("t1")
      expect(result[0]?.textFragments).toEqual(["first ", "second"])
    }))

  it.effect("extracts multiple distinct threads in order", () =>
    Effect.gen(function*() {
      const root = makeMarkupDoc(
        makeParagraph(
          makeText("a", [{ type: INLINE_COMMENT_MARK_TYPE, attrs: { thread: "t1" } }]),
          makeText("b", [{ type: INLINE_COMMENT_MARK_TYPE, attrs: { thread: "t2" } }])
        )
      )

      const result = extractInlineComments(root)

      expect(result).toHaveLength(2)
      expect(result[0]?.threadId).toBe("t1")
      expect(result[1]?.threadId).toBe("t2")
    }))

  it.effect("returns empty array when no inline comments", () =>
    Effect.gen(function*() {
      const root = makeMarkupDoc(
        makeParagraph(
          makeText("plain text"),
          makeText("bold text", [{ type: "bold" }])
        )
      )

      const result = extractInlineComments(root)

      expect(result).toHaveLength(0)
    }))

  it.effect("handles empty document", () =>
    Effect.gen(function*() {
      const root = makeMarkupDoc()

      const result = extractInlineComments(root)

      expect(result).toHaveLength(0)
    }))

  it.effect("ignores marks with missing thread attr", () =>
    Effect.gen(function*() {
      const root = makeMarkupDoc(
        makeParagraph(
          makeText("no thread", [{ type: INLINE_COMMENT_MARK_TYPE, attrs: {} }]),
          makeText("empty thread", [{ type: INLINE_COMMENT_MARK_TYPE, attrs: { thread: "" } }])
        )
      )

      const result = extractInlineComments(root)

      expect(result).toHaveLength(0)
    }))
})
