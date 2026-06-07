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
import type { MarkupNode } from "@hcengineering/text"
import { markupToJSON } from "@hcengineering/text"
import { Effect } from "effect"

import type { ListInlineCommentsParams } from "../../domain/schemas.js"
import type {
  InlineCommentReply,
  InlineCommentThread,
  ListInlineCommentsResult
} from "../../domain/schemas/documents.js"
import type { PersonName } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { DocumentContentCorruptedError, DocumentNotFoundError, TeamspaceNotFoundError } from "../errors.js"
import { chunter } from "../huly-plugins.js"
import { buildSocialIdToPersonNameMap } from "./channels.js"
import { listTotal } from "./counts.js"
import { fetchReadableDocumentContent, findTeamspaceAndDocument } from "./documents-shared.js"
import { isInlineCommentMark } from "./inline-comment-mark.js"
import { traverseAllMarks } from "./markup-traversal.js"
import { optionalMarkupToMarkdown } from "./markup.js"
import { toRef } from "./sdk-boundary.js"

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

  traverseAllMarks(root, (textNode, mark) => {
    if (!isInlineCommentMark(mark)) return
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
  | DocumentContentCorruptedError

export const listInlineComments = (
  params: ListInlineCommentsParams
): Effect.Effect<ListInlineCommentsResult, ListInlineCommentsError, HulyClient> =>
  Effect.gen(function*() {
    const { client, doc } = yield* findTeamspaceAndDocument({
      teamspace: params.teamspace,
      document: params.document
    })
    const markupUrlConfig = client.markupUrlConfig

    const rawMarkup = yield* fetchReadableDocumentContent({
      client,
      doc,
      format: "markup",
      identifier: params.document
    })

    if (rawMarkup === undefined) {
      return { comments: [], total: listTotal(0) }
    }

    const root = markupToJSON(rawMarkup)
    const extracted = extractInlineComments(root)

    if (extracted.length === 0) {
      return { comments: [], total: listTotal(0) }
    }

    // Fetch replies in one batch if requested
    let nameMap: ReadonlyMap<PersonId, PersonName> = new Map<PersonId, PersonName>()
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
          allReplies.map(r => r.createdBy).filter((id) => id !== undefined)
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
          body: optionalMarkupToMarkdown(r.message, markupUrlConfig, ""),
          sender: r.createdBy !== undefined ? nameMap.get(r.createdBy) : undefined,
          createdOn: r.createdOn
        }))
        return { ...thread, replies }
      }

      return thread
    })

    return { comments, total: listTotal(comments.length) }
  })
