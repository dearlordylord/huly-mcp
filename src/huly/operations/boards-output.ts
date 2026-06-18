import type { Board as HulyBoard, Card as HulyBoardCard } from "@hcengineering/board"
import type { ProjectType } from "@hcengineering/task"

import type {
  BoardCardCoverInput,
  BoardCardDetail,
  BoardCardSummary,
  BoardDetail,
  Count
} from "../../domain/schemas.js"
import {
  BoardCardId,
  BoardCardSequenceIdentifier,
  BoardCardTitle,
  BoardId,
  BoardName,
  IssueStatusId,
  NonEmptyString,
  ProjectTypeId,
  TaskTypeId
} from "../../domain/schemas.js"
import { PersonName, StatusName } from "../../domain/schemas/shared.js"
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
  urls: HulyClient["Type"]["markupUrlConfig"]
): BoardCardDetail => ({
  ...boardCardSummary(resolvedBoard, card, statusName, taskTypeName, assigneeName),
  description: optionalMarkupToMarkdown(card.description, urls, undefined),
  members: memberNames.map((name) => PersonName.make(name)),
  location: card.location || undefined,
  cover: coverOrUndefined(card.cover),
  startDate: card.startDate ?? undefined,
  createdOn: card.createdOn
})

export const descriptionFromMarkdown = (
  markdown: string | undefined,
  urls: HulyClient["Type"]["markupUrlConfig"]
): HulyBoardCard["description"] => markdownToMarkupString(markdown ?? "", urls)
