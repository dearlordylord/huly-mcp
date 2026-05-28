import type { MarkupMark } from "@hcengineering/text"

export const INLINE_COMMENT_MARK_TYPE = "inline-comment"

// Huly extension marks can appear in runtime markup before the SDK's MarkupMarkType union exposes them.
interface MarkupMarkLike {
  readonly type: unknown
  readonly attrs?: Readonly<Record<string, unknown>>
}

interface InlineCommentMark {
  readonly type: typeof INLINE_COMMENT_MARK_TYPE
  readonly attrs?: Readonly<Record<string, unknown>>
}

export const isInlineCommentMark = (mark: MarkupMarkLike): mark is InlineCommentMark =>
  mark.type === INLINE_COMMENT_MARK_TYPE

export const isMarkdownSerializableMark = (mark: MarkupMark): boolean => !isInlineCommentMark(mark)
