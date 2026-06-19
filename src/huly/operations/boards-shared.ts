import type { Board as HulyBoard, Card as HulyBoardCard } from "@hcengineering/board"
import type { Employee } from "@hcengineering/contact"
import { type Doc, type DocumentUpdate, type Ref, type Sequence, type Space, type Status } from "@hcengineering/core"
import type { ProjectType, TaskType } from "@hcengineering/task"
import { Effect, Option, Schema } from "effect"

import type { BoardRef } from "../../domain/schemas/boards.js"
import type { NonEmptyString } from "../../domain/schemas/shared.js"
import { PersonRefInput } from "../../domain/schemas/shared.js"
import { isNonEmpty, isSingle } from "../../utils/assertions.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { Diagnostics } from "../diagnostics.js"
import type {
  BoardArchivedCardDeleteError,
  BoardCardIdentifierAmbiguousError,
  BoardCardNotFoundError,
  NoUpdateFieldsError,
  PersonIdentifierAmbiguousError
} from "../errors.js"
import {
  BoardIdentifierAmbiguousError,
  BoardModelSequenceMissingError,
  BoardMutationUnsupportedError,
  BoardNotFoundError,
  BoardProjectTypeIdentifierAmbiguousError,
  BoardProjectTypeNotFoundError,
  BoardStatusIdentifierAmbiguousError,
  BoardStatusNotFoundError,
  BoardTaskTypeIdentifierAmbiguousError,
  BoardTaskTypeNotFoundError,
  PersonNotAnEmployeeError,
  PersonNotFoundError
} from "../errors.js"
import { board, contact, core, task } from "../huly-plugins.js"
import { findPersonByExactEmailOrName } from "./contacts-shared.js"
import { findStatusDocs, resolveByStatusRef, uniqueStatusRefs, workflowStatusFromRef } from "./issues-shared.js"
import { hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type BoardResolverError =
  | HulyClientError
  | BoardNotFoundError
  | BoardIdentifierAmbiguousError

export type BoardModelError =
  | HulyClientError
  | BoardProjectTypeNotFoundError
  | BoardProjectTypeIdentifierAmbiguousError
  | BoardTaskTypeNotFoundError
  | BoardTaskTypeIdentifierAmbiguousError
  | BoardStatusNotFoundError
  | BoardStatusIdentifierAmbiguousError
  | BoardModelSequenceMissingError

type BoardEmployeeError =
  | HulyClientError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError
  | PersonNotAnEmployeeError

export type BoardCardResolverError =
  | HulyClientError
  | BoardCardNotFoundError
  | BoardCardIdentifierAmbiguousError

type BoardRemoveCollectionError = BoardMutationUnsupportedError

export type BoardReadError = BoardResolverError | BoardModelError
export type BoardWriteError = BoardReadError | NoUpdateFieldsError
export type BoardCardReadError = BoardReadError | BoardCardResolverError
export type BoardCardWriteError =
  | BoardCardReadError
  | BoardEmployeeError
  | BoardModelError
  | NoUpdateFieldsError
  | BoardMutationUnsupportedError
  | BoardArchivedCardDeleteError

interface ResolvedBoard {
  readonly client: HulyClient["Type"]
  readonly board: HulyBoard
}

interface BoardWorkflowStatus {
  readonly id: Ref<Status>
  readonly name: string
}

export const boardSpace: (boardId: Ref<HulyBoard>) => Ref<Space> = toRef

const uniqueRefs = <T extends Doc>(refs: ReadonlyArray<Ref<T>>): Array<Ref<T>> =>
  refs.reduce<Array<Ref<T>>>(
    (unique, ref) => unique.includes(ref) ? unique : [...unique, ref],
    []
  )

export const cardIdentifierFromNumber = (number: number): string => `CARD-${number}`

const isBoardProjectType = (projectType: ProjectType): boolean =>
  projectType.descriptor === board.descriptors.BoardType
  && projectType.targetClass === board.class.Board

const resolveBoard = (
  client: HulyClient["Type"],
  identifier: BoardRef,
  options: { readonly includeArchived?: boolean } = {}
): Effect.Effect<HulyBoard, BoardResolverError> =>
  Effect.gen(function*() {
    const includeArchived = options.includeArchived ?? true
    const baseQuery: StrictDocumentQuery<HulyBoard> = includeArchived ? {} : { archived: false }
    const idMatches = yield* client.findAll<HulyBoard>(
      board.class.Board,
      hulyQuery<HulyBoard>({ ...baseQuery, _id: toRef<HulyBoard>(identifier) })
    )
    if (isNonEmpty(idMatches)) return idMatches[0]

    const nameMatches = yield* client.findAll<HulyBoard>(
      board.class.Board,
      hulyQuery<HulyBoard>({ ...baseQuery, name: identifier })
    )
    if (isSingle(nameMatches)) return nameMatches[0]
    if (nameMatches.length > 1) {
      return yield* new BoardIdentifierAmbiguousError({ identifier, matches: nameMatches.length })
    }
    return yield* new BoardNotFoundError({ identifier })
  })

export const resolveBoardFromContext = (
  identifier: BoardRef,
  options?: { readonly includeArchived?: boolean }
): Effect.Effect<ResolvedBoard, BoardResolverError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const resolved = yield* resolveBoard(client, identifier, options)
    return { board: resolved, client }
  })

export const resolveBoardProjectType = (
  client: HulyClient["Type"],
  projectTypeRef: string | undefined
): Effect.Effect<
  ProjectType,
  HulyClientError | BoardProjectTypeNotFoundError | BoardProjectTypeIdentifierAmbiguousError
> =>
  Effect.gen(function*() {
    const projectTypes = yield* client.findAll<ProjectType>(task.class.ProjectType, hulyQuery<ProjectType>({}))
    const matches = projectTypeRef === undefined
      ? projectTypes.filter(isBoardProjectType)
      : projectTypes.filter((projectType) =>
        isBoardProjectType(projectType) && (projectType._id === projectTypeRef || projectType.name === projectTypeRef)
      )

    if (isSingle(matches)) return matches[0]
    const identifier = projectTypeRef ?? String(board.descriptors.BoardType)
    if (matches.length === 0) return yield* new BoardProjectTypeNotFoundError({ identifier })
    return yield* new BoardProjectTypeIdentifierAmbiguousError({ identifier, matches: matches.length })
  })

export const getBoardProjectType = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard
): Effect.Effect<ProjectType, HulyClientError | BoardProjectTypeNotFoundError> =>
  Effect.gen(function*() {
    const projectType = yield* client.findOne<ProjectType>(
      task.class.ProjectType,
      hulyQuery<ProjectType>({ _id: resolvedBoard.type })
    )
    if (projectType !== undefined) return projectType
    return yield* new BoardProjectTypeNotFoundError({ identifier: String(resolvedBoard.type) })
  })

const mergeTaskTypes = (
  first: ReadonlyArray<TaskType>,
  second: ReadonlyArray<TaskType>
): Array<TaskType> => [...new Map([...first, ...second].map((taskType) => [taskType._id, taskType] as const)).values()]

export const getBoardTaskTypes = (
  client: HulyClient["Type"],
  projectType: ProjectType
): Effect.Effect<ReadonlyArray<TaskType>, HulyClientError> =>
  Effect.gen(function*() {
    const byIds = projectType.tasks.length === 0
      ? []
      : yield* client.findAll<TaskType>(
        task.class.TaskType,
        hulyQuery<TaskType>({ _id: { $in: [...projectType.tasks] } })
      )
    const byParent = yield* client.findAll<TaskType>(
      task.class.TaskType,
      hulyQuery<TaskType>({ parent: projectType._id })
    )
    return mergeTaskTypes(byIds, byParent)
  })

const isBoardCardTaskType = (taskType: TaskType): boolean =>
  taskType._id === board.taskType.Card
  || taskType.ofClass === board.class.Card
  || taskType.targetClass === board.class.Card

export const resolveBoardTaskType = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard,
  projectType: ProjectType,
  taskTypeRef: string | undefined
): Effect.Effect<TaskType, HulyClientError | BoardTaskTypeNotFoundError | BoardTaskTypeIdentifierAmbiguousError> =>
  Effect.gen(function*() {
    const taskTypes = yield* getBoardTaskTypes(client, projectType)
    const matches = taskTypeRef === undefined
      ? taskTypes.filter(isBoardCardTaskType)
      : taskTypes.filter((taskType) => taskType._id === taskTypeRef || taskType.name === taskTypeRef)
    const fallbackMatches = taskTypeRef === undefined && matches.length === 0 && taskTypes.length === 1
      ? taskTypes
      : matches

    if (isSingle(fallbackMatches)) return fallbackMatches[0]
    const identifier = taskTypeRef ?? "default board card task type"
    if (fallbackMatches.length === 0) {
      return yield* new BoardTaskTypeNotFoundError({ identifier, board: resolvedBoard.name })
    }
    return yield* new BoardTaskTypeIdentifierAmbiguousError({
      identifier,
      board: resolvedBoard.name,
      matches: fallbackMatches.length
    })
  })

const orderedStatusIdsForTaskType = (
  projectType: ProjectType,
  taskType: TaskType
): Array<Ref<Status>> => {
  if (taskType.statuses.length > 0) return uniqueStatusRefs(taskType.statuses)
  const scoped = projectType.statuses.filter((status) => status.taskType === taskType._id).map((status) => status._id)
  return uniqueStatusRefs(scoped.length > 0 ? scoped : projectType.statuses.map((status) => status._id))
}

const getBoardWorkflowStatuses = (
  client: HulyClient["Type"],
  projectType: ProjectType,
  taskType: TaskType
): Effect.Effect<ReadonlyArray<BoardWorkflowStatus>, never, Diagnostics> =>
  Effect.gen(function*() {
    const statusIds = orderedStatusIdsForTaskType(projectType, taskType)
    const statusDocs = statusIds.length === 0 ? [] : yield* findStatusDocs(client, statusIds)
    return resolveByStatusRef(
      statusIds,
      statusDocs,
      (status) => ({ id: status._id, name: status.name }),
      (statusRef) => ({ id: statusRef, name: workflowStatusFromRef(statusRef).name })
    )
  })

export const resolveBoardStatus = (
  client: HulyClient["Type"],
  resolvedBoard: HulyBoard,
  projectType: ProjectType,
  taskType: TaskType,
  statusRef: string | undefined
): Effect.Effect<BoardWorkflowStatus, BoardStatusNotFoundError | BoardStatusIdentifierAmbiguousError, Diagnostics> =>
  Effect.gen(function*() {
    const statuses = yield* getBoardWorkflowStatuses(client, projectType, taskType)
    const matches = statusRef === undefined
      ? statuses.slice(0, 1)
      : statuses.filter((status) => status.id === statusRef || status.name === statusRef)

    if (isSingle(matches)) return matches[0]
    const identifier = statusRef ?? "default board card status"
    if (matches.length === 0) return yield* new BoardStatusNotFoundError({ identifier, board: resolvedBoard.name })
    return yield* new BoardStatusIdentifierAmbiguousError({
      identifier,
      board: resolvedBoard.name,
      matches: matches.length
    })
  })

const TxIncResult = Schema.Struct({
  object: Schema.Struct({ sequence: Schema.Number })
})

const extractSequence = (txResult: unknown): number | undefined => {
  const decoded = Schema.decodeUnknownOption(TxIncResult)(txResult)
  return decoded._tag === "Some" ? decoded.value.object.sequence : undefined
}

export const incrementBoardCardSequence = (
  client: HulyClient["Type"]
): Effect.Effect<number, HulyClientError | BoardModelSequenceMissingError> =>
  Effect.gen(function*() {
    const sequence = yield* client.findOne<Sequence>(
      core.class.Sequence,
      hulyQuery<Sequence>({ attachedTo: board.class.Card })
    )
    if (sequence === undefined) {
      return yield* new BoardModelSequenceMissingError({ cardClass: String(board.class.Card) })
    }
    const update: DocumentUpdate<Sequence> = { $inc: { sequence: 1 } }
    const result = yield* client.updateDoc(core.class.Sequence, sequence.space, sequence._id, update, true)
    const number = extractSequence(result)
    if (number === undefined) {
      return yield* new BoardModelSequenceMissingError({ cardClass: String(board.class.Card) })
    }
    return number
  })

export const resolveEmployeeRef = (
  client: HulyClient["Type"],
  identifier: NonEmptyString
): Effect.Effect<Ref<Employee>, BoardEmployeeError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(identifier) })
    )
    if (byId !== undefined) return byId._id

    const personInput = Schema.decodeUnknownOption(PersonRefInput)(identifier)
    if (Option.isNone(personInput)) return yield* new PersonNotFoundError({ identifier })
    const person = yield* findPersonByExactEmailOrName(client, personInput.value)
    if (person === undefined) return yield* new PersonNotFoundError({ identifier })
    const employee = yield* client.findOne<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: toRef<Employee>(person._id) })
    )
    if (employee === undefined) return yield* new PersonNotAnEmployeeError({ identifier })
    return employee._id
  })

export const resolveEmployeeRefs = (
  client: HulyClient["Type"],
  identifiers: ReadonlyArray<NonEmptyString>
): Effect.Effect<ReadonlyArray<Ref<Employee>>, BoardEmployeeError> =>
  Effect.map(Effect.all(identifiers.map((identifier) => resolveEmployeeRef(client, identifier))), uniqueRefs)

export const employeeNamesById = (
  client: HulyClient["Type"],
  employees: ReadonlyArray<Ref<Employee>>
): Effect.Effect<Map<Ref<Employee>, string>, HulyClientError> =>
  Effect.gen(function*() {
    const unique = uniqueRefs(employees)
    if (unique.length === 0) return new Map()
    const docs = yield* client.findAll<Employee>(
      contact.mixin.Employee,
      hulyQuery<Employee>({ _id: { $in: unique } })
    )
    return new Map(docs.map((employee) => [employee._id, employee.name]))
  })

export const requireRemoveCollection = (
  client: HulyClient["Type"]
): Exclude<HulyClient["Type"]["removeCollection"], undefined> | BoardRemoveCollectionError =>
  client.removeCollection === undefined
    ? new BoardMutationUnsupportedError({ message: "Huly client does not support removeCollection" })
    : client.removeCollection

export const boardCardActiveQuery = (
  resolvedBoard: HulyBoard,
  includeArchived: boolean
): StrictDocumentQuery<HulyBoardCard> => ({
  space: boardSpace(resolvedBoard._id),
  ...(includeArchived ? {} : { isArchived: { $ne: true } })
})

export const cardStatusName = (
  statuses: ReadonlyMap<Ref<Status>, string>,
  card: HulyBoardCard
): string => statuses.get(card.status) ?? workflowStatusFromRef(card.status).name

export const taskTypeName = (
  taskTypes: ReadonlyMap<Ref<TaskType>, string>,
  card: HulyBoardCard
): string => taskTypes.get(card.kind) ?? String(card.kind)
