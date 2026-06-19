import type { Board as HulyBoard, Card as HulyBoardCard } from "@hcengineering/board"
import type { Employee } from "@hcengineering/contact"
import type { Ref, Status } from "@hcengineering/core"
import type { ProjectType, TaskType } from "@hcengineering/task"
import { Effect } from "effect"

import type { BoardCardDetail, BoardCardRef } from "../../domain/schemas.js"
import { isNonEmpty, isSingle } from "../../utils/assertions.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import { BoardCardIdentifierAmbiguousError, BoardCardNotFoundError } from "../errors.js"
import { board } from "../huly-plugins.js"
import { boardCardDetail, boardCardSummary } from "./boards-output.js"
import {
  type BoardCardResolverError,
  type BoardModelError,
  boardSpace,
  cardStatusName,
  employeeNamesById,
  getBoardProjectType,
  getBoardTaskTypes,
  taskTypeName
} from "./boards-shared.js"
import { findStatusDocs, resolveByStatusRef, uniqueStatusRefs, workflowStatusFromRef } from "./issues-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

interface BoardCardMetadata {
  readonly statusNames: ReadonlyMap<Ref<Status>, string>
  readonly taskTypeNames: ReadonlyMap<Ref<TaskType>, string>
  readonly employeeNames: ReadonlyMap<Ref<Employee>, string>
}

const boardCardNumber = (identifier: string): number | undefined => {
  const bare = /^\d+$/.exec(identifier)
  if (bare !== null) return Number(identifier)
  const prefixed = /^CARD-(\d+)$/i.exec(identifier)
  return prefixed?.[1] === undefined ? undefined : Number(prefixed[1])
}

export const resolveBoardCard = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard,
  identifier: BoardCardRef
): Effect.Effect<HulyBoardCard, BoardCardResolverError> =>
  Effect.gen(function*() {
    const space = boardSpace(resolvedBoard._id)
    const idMatches = yield* client.findAll<HulyBoardCard>(
      board.class.Card,
      hulyQuery<HulyBoardCard>({ space, _id: toRef<HulyBoardCard>(identifier) })
    )
    if (isNonEmpty(idMatches)) return idMatches[0]

    const number = boardCardNumber(identifier)
    if (number !== undefined) {
      const numberMatches = yield* client.findAll<HulyBoardCard>(
        board.class.Card,
        hulyQuery<HulyBoardCard>({ space, number })
      )
      if (isSingle(numberMatches)) return numberMatches[0]
      if (numberMatches.length > 1) {
        return yield* new BoardCardIdentifierAmbiguousError({
          identifier,
          board: resolvedBoard.name,
          matches: numberMatches.length
        })
      }
    }

    const titleMatches = yield* client.findAll<HulyBoardCard>(
      board.class.Card,
      hulyQuery<HulyBoardCard>({ space, title: identifier })
    )
    if (isSingle(titleMatches)) return titleMatches[0]
    if (titleMatches.length > 1) {
      return yield* new BoardCardIdentifierAmbiguousError({
        identifier,
        board: resolvedBoard.name,
        matches: titleMatches.length
      })
    }
    return yield* new BoardCardNotFoundError({ identifier, board: resolvedBoard.name })
  })

const allStatusIds = (projectType: ProjectType, taskTypes: ReadonlyArray<TaskType>): Array<Ref<Status>> =>
  uniqueStatusRefs([
    ...projectType.statuses.map((status) => status._id),
    ...taskTypes.flatMap((taskType) => taskType.statuses)
  ])

export const loadBoardCardMetadata = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard,
  cards: ReadonlyArray<HulyBoardCard>
): Effect.Effect<BoardCardMetadata, HulyClientError | BoardModelError, Diagnostics> =>
  Effect.gen(function*() {
    const projectType = yield* getBoardProjectType(client, resolvedBoard)
    const taskTypes = yield* getBoardTaskTypes(client, projectType)
    const statusIds = allStatusIds(projectType, taskTypes)
    const statusDocs = statusIds.length === 0 ? [] : yield* findStatusDocs(client, statusIds)
    const statusNames = new Map(
      resolveByStatusRef(
        statusIds,
        statusDocs,
        (status) => ({ id: status._id, name: status.name }),
        (statusRef) => ({ id: statusRef, name: workflowStatusFromRef(statusRef).name })
      ).map((status) => [status.id, status.name])
    )
    const taskTypeNames = new Map(taskTypes.map((taskType) => [taskType._id, taskType.name]))
    const assignees = cards.flatMap((card) => card.assignee === null ? [] : [toRef<Employee>(card.assignee)])
    const members = cards.flatMap((card) => card.members ?? [])
    const employeeNames = yield* employeeNamesById(client, [...assignees, ...members])
    return { employeeNames, statusNames, taskTypeNames }
  })

export const cardSummaryWithMetadata = (
  resolvedBoard: HulyBoard,
  metadata: BoardCardMetadata,
  card: HulyBoardCard
) =>
  boardCardSummary(
    resolvedBoard,
    card,
    cardStatusName(metadata.statusNames, card),
    taskTypeName(metadata.taskTypeNames, card),
    card.assignee === null ? undefined : metadata.employeeNames.get(toRef<Employee>(card.assignee))
  )

export const cardDetailWithMetadata = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard,
  metadata: BoardCardMetadata,
  card: HulyBoardCard
): BoardCardDetail =>
  boardCardDetail(
    resolvedBoard,
    card,
    cardStatusName(metadata.statusNames, card),
    taskTypeName(metadata.taskTypeNames, card),
    card.assignee === null ? undefined : metadata.employeeNames.get(toRef<Employee>(card.assignee)),
    (card.members ?? []).map((member) => metadata.employeeNames.get(member) ?? String(member)),
    client.markupUrlConfig
  )
