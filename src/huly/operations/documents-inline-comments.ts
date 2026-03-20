/**
 * Inline comment extraction for Huly documents.
 *
 * Inline comments are stored as ProseMirror marks (type "inline-comment")
 * in document content. Each mark has a `thread` attr referencing a thread ID.
 * This module extracts those marks and optionally fetches thread replies.
 *
 * @module
 */
import type { ChatMessage, ThreadMessage as HulyThreadMessage } from "@hcengineering/chunter"
import type { PersonId } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import type { MarkupMark, MarkupNode } from "@hcengineering/text"
import { markupToJSON, traverseAllMarks } from "@hcengineering/text"
import { Effect } from "effect"

import type { ListInlineCommentsParams } from "../../domain/schemas.js"
import type {
  InlineCommentReply,
  InlineCommentThread,
  ListInlineCommentsResult
} from "../../domain/schemas/documents.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { DocumentNotFoundError, TeamspaceNotFoundError } from "../errors.js"
import { chunter } from "../huly-plugins.js"
import { buildSocialIdToPersonNameMap, markupToMarkdownString } from "./channels.js"
import { findTeamspaceAndDocument } from "./documents.js"
import { toRef } from "./shared.js"

const INLINE_COMMENT_MARK_TYPE = "inline-comment"

interface ExtractedComment {
  readonly threadId: string
  readonly textFragments: Array<string>
}

/**
 * Extract inline comment threads from a parsed markup tree.
 * Groups text fragments by thread ID, preserving insertion order (Map guarantees).
 */
export const extractInlineComments = (root: MarkupNode): ReadonlyArray<ExtractedComment> => {
  const threadMap = new Map<string, Array<string>>()

  traverseAllMarks(root, (textNode: MarkupNode, mark: MarkupMark) => {
    if (String(mark.type) !== INLINE_COMMENT_MARK_TYPE) return
    // MarkupMark.attrs is Record<string, any> | undefined per SDK types
    const threadId = mark.attrs?.thread
    if (typeof threadId !== "string" || threadId === "") return

    const text = textNode.text ?? ""
    if (!threadMap.has(threadId)) {
      threadMap.set(threadId, [])
    }
    threadMap.get(threadId)?.push(text)
  })

  return [...threadMap.entries()].map(([threadId, textFragments]) => ({
    threadId,
    textFragments
  }))
}

type ListInlineCommentsError =
  | HulyClientError
  | TeamspaceNotFoundError
  | DocumentNotFoundError

export const listInlineComments = (
  params: ListInlineCommentsParams
): Effect.Effect<ListInlineCommentsResult, ListInlineCommentsError, HulyClient> =>
  Effect.gen(function*() {
    const { client, doc } = yield* findTeamspaceAndDocument({
      teamspace: params.teamspace,
      document: params.document
    })

    if (!doc.content) {
      return { comments: [], total: 0 }
    }

    const rawMarkup: string = yield* client.fetchMarkup(
      doc._class,
      doc._id,
      "content",
      doc.content,
      "markup"
    )

    const root = markupToJSON(rawMarkup)
    const extracted = extractInlineComments(root)

    if (extracted.length === 0) {
      return { comments: [], total: 0 }
    }

    // Fetch replies in one batch if requested
    let nameMap = new Map<string, string>()
    const threadRepliesMap = new Map<string, Array<HulyThreadMessage>>()

    if (params.includeReplies) {
      const threadIds = extracted.map(c => toRef<ChatMessage>(c.threadId))
      const allReplies = yield* client.findAll<HulyThreadMessage>(
        chunter.class.ThreadMessage,
        { attachedTo: { $in: threadIds } },
        { sort: { createdOn: SortingOrder.Ascending } }
      )

      // Group replies by thread
      for (const r of allReplies) {
        const key = r.attachedTo
        if (!threadRepliesMap.has(key)) {
          threadRepliesMap.set(key, [])
        }
        threadRepliesMap.get(key)?.push(r)
      }

      // Resolve sender names in one batch
      const senderIds = [
        ...new Set(
          allReplies.map(r => r.createdBy).filter((id): id is PersonId => id !== undefined)
        )
      ]
      nameMap = yield* buildSocialIdToPersonNameMap(client, senderIds)
    }

    const comments: Array<InlineCommentThread> = extracted.map(comment => {
      const thread: InlineCommentThread = {
        threadId: comment.threadId,
        text: comment.textFragments.join("")
      }

      if (params.includeReplies) {
        const threadReplies = threadRepliesMap.get(comment.threadId) ?? []
        const replies: Array<InlineCommentReply> = threadReplies.map(r => ({
          id: r._id,
          body: r.message ? markupToMarkdownString(r.message) : "",
          sender: r.createdBy !== undefined ? nameMap.get(r.createdBy) : undefined,
          createdOn: r.createdOn
        }))
        return { ...thread, replies }
      }

      return thread
    })

    return { comments, total: comments.length }
  })
