import { describe, it } from "@effect/vitest"
import { MarkupMarkType, MarkupNodeType, markupToJSON } from "@hcengineering/text"
import { Effect } from "effect"
import { expect } from "vitest"

import { INLINE_COMMENT_MARK_TYPE } from "../../../src/huly/operations/inline-comment-mark.js"
import {
  markdownToMarkupString,
  markdownToMarkupStringWithHulyLinks,
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

  it.effect("converts matching Huly browse URLs to native reference nodes when using real Huly links", () =>
    Effect.gen(function*() {
      const markdown =
        "I meant [Test Document](https://test.invalid/browse?workspace=test&_class=document%3Aclass%3ADocument&_id=doc-1&label=Test%20Document) like this"

      const rendered = markdownToMarkupStringWithHulyLinks(markdown, testMarkupUrlConfig)
      const root = markupToJSON(rendered.markup)
      const paragraph = root.content?.[0]
      const content = paragraph?.content ?? []
      const reference = content.find((node) => node.type === MarkupNodeType.reference)

      expect(rendered.malformedReferences).toEqual([])
      expect(reference).toMatchObject({
        type: MarkupNodeType.reference,
        attrs: {
          id: "doc-1",
          objectclass: "document:class:Document",
          label: "Test Document"
        }
      })
      expect(reference?.content).toBeUndefined()
    }))

  it.effect("converts supported Huly browse URL classes without caller-side reference schemas", () =>
    Effect.gen(function*() {
      const markdown = [
        "[HULY](https://test.invalid/browse?workspace=test&_class=tracker%3Aclass%3AProject&_id=project-1&label=HULY)",
        "[Alice](https://test.invalid/browse?workspace=test&_class=contact%3Aclass%3APerson&_id=person-1&label=Alice)",
        "[GAME-4](https://test.invalid/browse?workspace=test&_class=tracker%3Aclass%3AIssue&_id=issue-1&label=GAME-4)"
      ].join(" ")

      const rendered = markdownToMarkupStringWithHulyLinks(markdown, testMarkupUrlConfig)
      const root = markupToJSON(rendered.markup)
      const references = root.content?.[0]?.content?.filter((node) => node.type === MarkupNodeType.reference) ?? []

      expect(rendered.malformedReferences).toEqual([])
      expect(references.every((node) => node.content === undefined)).toBe(true)
      expect(references.map((node) => node.attrs)).toEqual([
        {
          id: "project-1",
          objectclass: "tracker:class:Project",
          label: "HULY"
        },
        {
          id: "person-1",
          objectclass: "contact:class:Person",
          label: "Alice"
        },
        {
          id: "issue-1",
          objectclass: "tracker:class:Issue",
          label: "GAME-4"
        }
      ])
    }))

  it.effect("keeps native-looking browse URLs for other workspaces as plain links", () =>
    Effect.gen(function*() {
      const markdown =
        "[GAME-4](https://test.invalid/browse?workspace=test-workspace&_class=tracker%3Aclass%3AIssue&_id=issue-1&label=GAME-4)"

      const rendered = markdownToMarkupStringWithHulyLinks(markdown, testMarkupUrlConfig)
      const root = markupToJSON(rendered.markup)
      const content = root.content?.[0]?.content ?? []

      expect(rendered.malformedReferences).toEqual([])
      expect(content.some((node) => node.type === MarkupNodeType.reference)).toBe(false)
      expect(content.find((node) => node.type === MarkupNodeType.text && node.text === "GAME-4")?.marks)
        .toContainEqual({
          type: MarkupMarkType.link,
          attrs: {
            href:
              "https://test.invalid/browse?workspace=test-workspace&_class=tracker%3Aclass%3AIssue&_id=issue-1&label=GAME-4"
          }
        })
    }))

  it.effect("keeps Huly browse URLs without native reference fields as plain links", () =>
    Effect.gen(function*() {
      const markdown = "[Browse](https://test.invalid/browse?workspace=test)"

      const rendered = markdownToMarkupStringWithHulyLinks(markdown, testMarkupUrlConfig)
      const root = markupToJSON(rendered.markup)
      const content = root.content?.[0]?.content ?? []

      expect(rendered.malformedReferences).toEqual([])
      expect(content.some((node) => node.type === MarkupNodeType.reference)).toBe(false)
      expect(content.find((node) => node.type === MarkupNodeType.text && node.text === "Browse")?.marks)
        .toContainEqual({
          type: MarkupMarkType.link,
          attrs: { href: "https://test.invalid/browse?workspace=test" }
        })
    }))

  it.effect("keeps invalid markdown link URLs as plain links", () =>
    Effect.gen(function*() {
      const markdown = "[Invalid](not-a-url)"

      const rendered = markdownToMarkupStringWithHulyLinks(markdown, testMarkupUrlConfig)
      const root = markupToJSON(rendered.markup)
      const content = root.content?.[0]?.content ?? []

      expect(rendered.malformedReferences).toEqual([])
      expect(content.some((node) => node.type === MarkupNodeType.reference)).toBe(false)
    }))

  it.effect("reports malformed auto-converted Huly browse URLs", () =>
    Effect.gen(function*() {
      const markdown = "Broken [Doc](https://test.invalid/browse?workspace=test&_id=doc-1)."

      const rendered = markdownToMarkupStringWithHulyLinks(markdown, testMarkupUrlConfig)

      expect(rendered.malformedReferences).toEqual(["reference missing objectclass, label"])
    }))

  it.effect("reports blank and missing native reference fields precisely", () =>
    Effect.gen(function*() {
      const missingId =
        "Broken [Doc](https://test.invalid/browse?workspace=test&_class=document%3Aclass%3ADocument&label=Doc)."
      const blankId =
        "Broken [Doc](https://test.invalid/browse?workspace=test&_id=%20%20&_class=document%3Aclass%3ADocument&label=Doc)."

      const missingIdRendered = markdownToMarkupStringWithHulyLinks(missingId, testMarkupUrlConfig)
      const blankIdRendered = markdownToMarkupStringWithHulyLinks(blankId, testMarkupUrlConfig)

      expect(missingIdRendered.malformedReferences).toEqual(["reference missing id"])
      expect(blankIdRendered.malformedReferences).toEqual(["reference missing id"])
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
