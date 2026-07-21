/**
 * Card comment operations: list, add, update, delete.
 *
 * Card comments are chunter ChatMessages attached to the card's `comments`
 * collection, matching how the Huly UI stores them for issues and drive files.
 * The attachedToClass is the card's concrete class (its master tag), not the
 * base card:class:Card, so targets are built from the resolved card document.
 *
 * @module
 */
import { Effect } from "effect"

import type {
  AddCardCommentParams,
  AddCardCommentResult,
  DeleteCardCommentParams,
  DeleteCardCommentResult,
  ListCardCommentsParams,
  ListCardCommentsResult,
  UpdateCardCommentParams,
  UpdateCardCommentResult
} from "../../domain/schemas/card-comments.js"
import { CardId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import {
  CardCommentNotFoundError,
  type CardNotFoundError,
  type CardSpaceNotFoundError,
  type HulyConnectionError
} from "../errors.js"
import {
  addAttachedComment,
  type AttachedCommentTarget,
  deleteAttachedComment,
  listAttachedCommentsPage,
  updateAttachedComment
} from "./attached-comments.js"
import { findCardSpaceAndCard } from "./cards.js"

type CardCommentError =
  | HulyClientError
  | CardSpaceNotFoundError
  | CardNotFoundError

type CardCommentTarget = AttachedCommentTarget & {
  readonly cardId: CardId
}

const resolveCardCommentTarget = (
  params: { card: string; cardSpace: string }
): Effect.Effect<CardCommentTarget, CardCommentError, HulyClient> =>
  Effect.gen(function*() {
    const { card, client } = yield* findCardSpaceAndCard(params)
    return {
      client,
      space: card.space,
      attachedTo: card._id,
      attachedToClass: card._class,
      collection: "comments",
      cardId: CardId.make(card._id)
    }
  })

export const listCardComments = (
  params: ListCardCommentsParams
): Effect.Effect<ListCardCommentsResult, CardCommentError | HulyConnectionError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveCardCommentTarget(params)
    const page = yield* listAttachedCommentsPage(target, params.limit, "Card")
    return {
      cardId: target.cardId,
      comments: page.comments,
      total: page.total
    }
  })

export const addCardComment = (
  params: AddCardCommentParams
): Effect.Effect<AddCardCommentResult, CardCommentError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveCardCommentTarget(params)
    const commentId = yield* addAttachedComment(target, params.body)
    return { cardId: target.cardId, commentId }
  })

const cardCommentNotFound = (
  params: { card: string; cardSpace: string; commentId: string }
) =>
() =>
  new CardCommentNotFoundError({
    commentId: params.commentId,
    card: params.card,
    cardSpace: params.cardSpace
  })

export const updateCardComment = (
  params: UpdateCardCommentParams
): Effect.Effect<UpdateCardCommentResult, CardCommentError | CardCommentNotFoundError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveCardCommentTarget(params)
    const updated = yield* updateAttachedComment(
      target,
      params.commentId,
      params.body,
      cardCommentNotFound(params)
    )
    return { cardId: target.cardId, commentId: params.commentId, updated }
  })

export const deleteCardComment = (
  params: DeleteCardCommentParams
): Effect.Effect<DeleteCardCommentResult, CardCommentError | CardCommentNotFoundError, HulyClient> =>
  Effect.gen(function*() {
    const target = yield* resolveCardCommentTarget(params)
    yield* deleteAttachedComment(target, params.commentId, cardCommentNotFound(params))
    return { cardId: target.cardId, commentId: params.commentId, deleted: true }
  })
