import { describe, it } from "@effect/vitest"
import type { MarkupMark, MarkupNode } from "@hcengineering/text"
import { Effect } from "effect"
import { expect } from "vitest"
import { extractInlineComments } from "../../../src/huly/operations/documents-inline-comments.js"

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

describe("extractInlineComments", () => {
  it.effect("extracts single inline comment thread", () =>
    Effect.gen(function*() {
      const root = makeMarkupDoc(
        makeParagraph(
          makeText("hello ", [{ type: "inline-comment", attrs: { thread: "thread-1" } }]),
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
          makeText("first ", [{ type: "inline-comment", attrs: { thread: "t1" } }]),
          makeText("middle"),
          makeText("second", [{ type: "inline-comment", attrs: { thread: "t1" } }])
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
          makeText("a", [{ type: "inline-comment", attrs: { thread: "t1" } }]),
          makeText("b", [{ type: "inline-comment", attrs: { thread: "t2" } }])
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
          makeText("no thread", [{ type: "inline-comment", attrs: {} }]),
          makeText("empty thread", [{ type: "inline-comment", attrs: { thread: "" } }])
        )
      )

      const result = extractInlineComments(root)

      expect(result).toHaveLength(0)
    }))
})
