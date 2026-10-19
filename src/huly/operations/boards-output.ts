import type { Board as HulyBoard, Card as HulyBoardCard } from "@hcengineering/board"
import type { ProjectType } from "@hcengineering/task"
import { Effect } from "effect"

import {
  type BoardCardCoverInput,
  BoardCardId,
  BoardCardSequenceIdentifier,
  BoardCardTitle,
  BoardId,
  BoardName
} from "../../domain/schemas/boards.js"
import type { BoardCardDetail, BoardCardSummary, BoardDetail } from "../../domain/schemas/boards-results.js"
import {
  type Count,
  IssueStatusId,
  NonEmptyString,
  ProjectTypeId,
  TaskTypeId,
  PersonName,
  StatusName
} from "../../domain/schemas/shared.js"

import type { HulyClient } from "../client.js"
import { markdownToMarkupString, optionalMarkupToMarkdown } from "./markup.js"

const coverOrUndefined = (cover: HulyBoardCard["cover"]): BoardCardCoverInput | undefined =>
  cover === null || cover === undefined ? undefined : { color: cover.color, size: cover.size }

export const toBoardDetail = (
  resolvedBoard: HulyBoard,
  projectType: ProjectType | undefined,
  cardCount: Count
): BoardDetail => ({
  id: BoardId.make(resolvedBoard._id),
  name: BoardName.make(resolvedBoard.name),
  description: resolvedBoard.description || undefined,
  archived: resolvedBoard.archived,
  private: resolvedBoard.private,
  cards: cardCount,
  projectTypeId: ProjectTypeId.make(resolvedBoard.type),
  projectTypeName: projectType === undefined ? undefined : NonEmptyString.make(projectType.name),
  color: resolvedBoard.color,
  background: resolvedBoard.background
})

export const boardCardSummary = (
  resolvedBoard: HulyBoard,
  card: HulyBoardCard,
  statusName: string,
  taskTypeName: string,
  assigneeName: string | undefined
): BoardCardSummary => ({
  id: BoardCardId.make(card._id),
  identifier: BoardCardSequenceIdentifier.make(card.identifier),
  number: card.number,
  title: BoardCardTitle.make(card.title),
  board: BoardName.make(resolvedBoard.name),
  status: StatusName.make(statusName),
  statusId: IssueStatusId.make(card.status),
  kind: NonEmptyString.make(taskTypeName),
  kindId: TaskTypeId.make(card.kind),
  archived: card.isArchived === true,
  assignee: assigneeName === undefined ? undefined : PersonName.make(assigneeName),
  modifiedOn: card.modifiedOn,
  dueDate: card.dueDate ?? undefined
})

export const boardCardDetail = (
  resolvedBoard: HulyBoard,
  card: HulyBoardCard,
  statusName: string,
  taskTypeName: string,
  assigneeName: string | undefined,
  memberNames: ReadonlyArray<string>,
  urls: HulyClient["Service"]["markupUrlConfig"]
) =>
  optionalMarkupToMarkdown(card.description, urls, undefined, {
    operation: "getBoardCard",
    entity: "board card description"
  }).pipe(
    Effect.map(
      (description): BoardCardDetail => ({
        ...boardCardSummary(resolvedBoard, card, statusName, taskTypeName, assigneeName),
        description,
        members: memberNames.map((name) => PersonName.make(name)),
        location: card.location || undefined,
        cover: coverOrUndefined(card.cover),
        startDate: card.startDate ?? undefined,
        createdOn: card.createdOn
      })
    )
  )

export const descriptionFromMarkdown = (
  markdown: string | undefined,
  urls: HulyClient["Service"]["markupUrlConfig"]
): HulyBoardCard["description"] => markdownToMarkupString(markdown ?? "", urls)
