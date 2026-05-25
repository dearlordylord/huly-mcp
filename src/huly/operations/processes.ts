import type { Card, MasterTag, Tag } from "@hcengineering/card"
import type { DocumentQuery, Ref } from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type {
  GetProcessParams,
  ListExecutionsParams,
  ListExecutionsResult,
  ListProcessesParams,
  ListProcessesResult,
  ProcessCandidate,
  ProcessDetail,
  ProcessExecutionSummary,
  ProcessSummary,
  ProcessTransitionSummary
} from "../../domain/schemas.js"
import {
  ListExecutionsResultSchema,
  ListProcessesResultSchema,
  ProcessDetailSchema,
  ProcessExecutionId,
  ProcessId,
  ProcessStateId
} from "../../domain/schemas.js"
import { CardId, MasterTagId } from "../../domain/schemas/shared.js"
import { normalizeForComparison } from "../../utils/normalize.js"
import { HulyClient, type HulyClientError, type HulyClientOperations } from "../client.js"
import {
  HulyConnectionError,
  ProcessCardIdentifierAmbiguousError,
  ProcessCardNotFoundError,
  ProcessIdentifierAmbiguousError,
  ProcessMasterTagAmbiguousError,
  ProcessMasterTagNotFoundError,
  ProcessNotFoundError
} from "../errors.js"
import { cardPlugin } from "../huly-plugins.js"
import {
  type HulyProcessDefinition,
  type HulyProcessExecution,
  type HulyProcessState,
  type HulyProcessTransition,
  processPlugin
} from "../process-plugin.js"
import { clampLimit } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type ProcessOperationError =
  | HulyClientError
  | HulyConnectionError
  | ProcessNotFoundError
  | ProcessIdentifierAmbiguousError
  | ProcessMasterTagNotFoundError
  | ProcessMasterTagAmbiguousError
  | ProcessCardIdentifierAmbiguousError
  | ProcessCardNotFoundError

interface MasterTagDisplay {
  readonly id: Ref<MasterTag | Tag>
  readonly name: string
}

interface ProcessDefinitionData {
  readonly process: HulyProcessDefinition
  readonly masterTagName: string | undefined
  readonly stateCount: number
  readonly transitionCount: number
}

interface ProcessDetailData extends ProcessDefinitionData {
  readonly states: ReadonlyArray<HulyProcessState>
  readonly transitions: ReadonlyArray<HulyProcessTransition>
}

const encodeOrConnectionError = <A, I, R>(
  schema: Schema.Schema<A, I, R>,
  value: A,
  operation: string
): Effect.Effect<A, HulyConnectionError, R> =>
  Schema.encode(schema)(value).pipe(
    Effect.as(value),
    Effect.mapError((parseError) =>
      new HulyConnectionError({
        message: `${operation} response failed schema validation: ${parseError.message}`,
        cause: parseError
      })
    )
  )

const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value.trim() === "" ? undefined : value

const looksLikeMasterTagId = (identifier: string): boolean => identifier.startsWith("card:")

const looksLikeCardId = (identifier: string): boolean =>
  identifier.startsWith("card:") || identifier.startsWith("card-") || /^[0-9a-f]{24}$/i.test(identifier)

const masterTagLabel = (tag: MasterTag | Tag): string | undefined => nonEmpty(tag.label)

const masterTagDisplay = (tag: MasterTag | Tag): MasterTagDisplay => ({
  id: tag._id,
  name: masterTagLabel(tag) ?? String(tag._id)
})

const findMasterTagsByIds = (
  client: HulyClientOperations,
  ids: ReadonlyArray<Ref<MasterTag | Tag>>
): Effect.Effect<ReadonlyMap<Ref<MasterTag | Tag>, MasterTagDisplay>, HulyClientError> =>
  ids.length === 0
    ? Effect.succeed(new Map<Ref<MasterTag | Tag>, MasterTagDisplay>())
    : Effect.gen(function*() {
      const uniqueIds = Array.from(new Set(ids))
      const [masterTags, tags] = yield* Effect.all([
        client.findAll<MasterTag>(cardPlugin.class.MasterTag, { _id: { $in: uniqueIds } }),
        client.findAll<Tag>(cardPlugin.class.Tag, { _id: { $in: uniqueIds } })
      ])
      const entries = [...masterTags, ...tags].map((tag) => {
        const display = masterTagDisplay(tag)
        return [display.id, display] as const
      })
      return new Map(entries)
    })

const loadProcessDefinitionData = (
  client: HulyClientOperations,
  processes: ReadonlyArray<HulyProcessDefinition>
): Effect.Effect<ReadonlyArray<ProcessDefinitionData>, HulyClientError> =>
  Effect.gen(function*() {
    if (processes.length === 0) return []

    const processIds = processes.map((process) => process._id)
    const [masterTags, states, transitions] = yield* Effect.all([
      findMasterTagsByIds(client, processes.map((process) => process.masterTag)),
      client.findAll<HulyProcessState>(processPlugin.class.State, { process: { $in: processIds } }),
      client.findAll<HulyProcessTransition>(processPlugin.class.Transition, { process: { $in: processIds } })
    ])

    return processes.map((process) => ({
      process,
      masterTagName: masterTags.get(process.masterTag)?.name,
      stateCount: states.filter((state) => state.process === process._id).length,
      transitionCount: transitions.filter((transition) => transition.process === process._id).length
    }))
  })

const processCandidate = (data: ProcessDefinitionData): ProcessCandidate => ({
  id: ProcessId.make(data.process._id),
  name: data.process.name,
  masterTagId: MasterTagId.make(data.process.masterTag),
  masterTagName: data.masterTagName
})

const processSummary = (data: ProcessDefinitionData): ProcessSummary => ({
  ...processCandidate(data),
  description: nonEmpty(data.process.description),
  autoStart: data.process.autoStart ?? false,
  automationOnly: data.process.automationOnly ?? false,
  parallelExecutionForbidden: data.process.parallelExecutionForbidden ?? false,
  stateCount: data.stateCount,
  transitionCount: data.transitionCount
})

const stateTitleMap = (
  states: ReadonlyArray<HulyProcessState>
): ReadonlyMap<Ref<HulyProcessState>, string> => new Map(states.map((state) => [state._id, state.title]))

const transitionSummary = (
  transition: HulyProcessTransition,
  titles: ReadonlyMap<Ref<HulyProcessState>, string>
): ProcessTransitionSummary => ({
  id: transition._id,
  fromStateId: transition.from === null ? undefined : ProcessStateId.make(transition.from),
  fromStateTitle: transition.from === null ? undefined : titles.get(transition.from),
  toStateId: ProcessStateId.make(transition.to),
  toStateTitle: titles.get(transition.to),
  triggerId: transition.trigger,
  actionCount: transition.actions.length
})

const initialStateId = (
  transitions: ReadonlyArray<HulyProcessTransition>
): ProcessStateId | undefined => {
  const initialTransition = transitions.find((transition) => transition.from === null)
  return initialTransition === undefined ? undefined : ProcessStateId.make(initialTransition.to)
}

const processDetail = (data: ProcessDetailData): ProcessDetail => {
  const titles = stateTitleMap(data.states)
  return {
    ...processSummary(data),
    initialStateId: initialStateId(data.transitions),
    states: data.states.map((state) => ({
      id: ProcessStateId.make(state._id),
      title: state.title
    })),
    transitions: data.transitions.map((transition) => transitionSummary(transition, titles))
  }
}

const resolveProcess = (
  client: HulyClientOperations,
  identifier: string
): Effect.Effect<HulyProcessDefinition, ProcessOperationError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulyProcessDefinition>(
      processPlugin.class.Process,
      { _id: toRef<HulyProcessDefinition>(identifier) }
    )
    if (byId !== undefined) return byId

    const allProcesses = yield* client.findAll<HulyProcessDefinition>(
      processPlugin.class.Process,
      {},
      { sort: { name: SortingOrder.Ascending } }
    )
    const matches = [...allProcesses].filter((process) =>
      normalizeForComparison(process.name) === normalizeForComparison(identifier)
    )

    if (matches.length === 1) return matches[0]

    const data = yield* loadProcessDefinitionData(client, matches.length === 0 ? [...allProcesses] : matches)
    const candidates = data.map(processCandidate)
    return yield* (matches.length === 0
      ? Effect.fail(new ProcessNotFoundError({ identifier, candidates }))
      : Effect.fail(new ProcessIdentifierAmbiguousError({ identifier, candidates })))
  })

const resolveMasterTag = (
  client: HulyClientOperations,
  identifier: string
): Effect.Effect<Ref<MasterTag | Tag>, ProcessOperationError> =>
  Effect.gen(function*() {
    const [masterTags, tags] = yield* Effect.all([
      client.findAll<MasterTag>(cardPlugin.class.MasterTag, {}),
      client.findAll<Tag>(cardPlugin.class.Tag, {})
    ])
    const allTags = [...masterTags, ...tags]
    const byId = allTags.find((tag) => tag._id === identifier)
    if (byId !== undefined) return byId._id

    const matches = allTags.filter((tag) =>
      normalizeForComparison(masterTagLabel(tag) ?? "") === normalizeForComparison(identifier)
    )
    if (matches.length === 1) return matches[0]._id

    if (matches.length === 0) {
      return yield* (looksLikeMasterTagId(identifier)
        ? Effect.succeed(toRef<MasterTag | Tag>(identifier))
        : Effect.fail(new ProcessMasterTagNotFoundError({ identifier })))
    }

    return yield* Effect.fail(
      new ProcessMasterTagAmbiguousError({
        identifier,
        candidates: matches.map((tag) => ({
          id: MasterTagId.make(tag._id),
          name: masterTagLabel(tag) ?? String(tag._id)
        }))
      })
    )
  })

const resolveCardFilter = (
  client: HulyClientOperations,
  identifier: string
): Effect.Effect<Ref<Card>, HulyClientError | ProcessCardIdentifierAmbiguousError | ProcessCardNotFoundError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<Card>(cardPlugin.class.Card, { _id: toRef<Card>(identifier) })
    if (byId !== undefined) return byId._id

    const byTitle = yield* client.findAll<Card>(cardPlugin.class.Card, { title: identifier })
    if (byTitle.length === 1) return byTitle[0]._id
    if (byTitle.length > 1) {
      return yield* Effect.fail(
        new ProcessCardIdentifierAmbiguousError({
          identifier,
          candidates: byTitle.map((card) => ({
            id: CardId.make(card._id),
            title: card.title
          }))
        })
      )
    }
    return yield* (looksLikeCardId(identifier)
      ? Effect.succeed(toRef<Card>(identifier))
      : Effect.fail(new ProcessCardNotFoundError({ identifier })))
  })

const findCardsByIds = (
  client: HulyClientOperations,
  ids: ReadonlyArray<Ref<Card>>
): Effect.Effect<ReadonlyMap<Ref<Card>, Card>, HulyClientError> =>
  ids.length === 0
    ? Effect.succeed(new Map<Ref<Card>, Card>())
    : client.findAll<Card>(cardPlugin.class.Card, { _id: { $in: Array.from(new Set(ids)) } }).pipe(
      Effect.map((cards) => new Map(cards.map((card) => [card._id, card])))
    )

const findStatesByIds = (
  client: HulyClientOperations,
  ids: ReadonlyArray<Ref<HulyProcessState>>
): Effect.Effect<ReadonlyMap<Ref<HulyProcessState>, HulyProcessState>, HulyClientError> =>
  ids.length === 0
    ? Effect.succeed(new Map<Ref<HulyProcessState>, HulyProcessState>())
    : client.findAll<HulyProcessState>(
      processPlugin.class.State,
      { _id: { $in: Array.from(new Set(ids)) } }
    ).pipe(Effect.map((states) => new Map(states.map((state) => [state._id, state]))))

const executionSummary = (
  execution: HulyProcessExecution,
  processes: ReadonlyMap<Ref<HulyProcessDefinition>, HulyProcessDefinition>,
  states: ReadonlyMap<Ref<HulyProcessState>, HulyProcessState>,
  cards: ReadonlyMap<Ref<Card>, Card>
): ProcessExecutionSummary => ({
  id: ProcessExecutionId.make(execution._id),
  processId: ProcessId.make(execution.process),
  processName: processes.get(execution.process)?.name,
  cardId: CardId.make(execution.card),
  cardTitle: cards.get(execution.card)?.title,
  currentStateId: ProcessStateId.make(execution.currentState),
  currentStateTitle: states.get(execution.currentState)?.title,
  status: execution.status,
  errorCount: execution.error?.length ?? 0,
  hasError: (execution.error?.length ?? 0) > 0,
  hasParent: execution.parentId !== undefined,
  parentExecutionId: execution.parentId === undefined ? undefined : ProcessExecutionId.make(execution.parentId),
  modifiedOn: execution.modifiedOn
})

export const listProcesses = (
  params: ListProcessesParams
): Effect.Effect<ListProcessesResult, ProcessOperationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const masterTag = params.masterTag === undefined ? undefined : yield* resolveMasterTag(client, params.masterTag)
    const query: DocumentQuery<HulyProcessDefinition> = masterTag === undefined ? {} : { masterTag }
    const processes = yield* client.findAll<HulyProcessDefinition>(
      processPlugin.class.Process,
      query,
      { limit: clampLimit(params.limit), sort: { name: SortingOrder.Ascending } }
    )
    const data = yield* loadProcessDefinitionData(client, [...processes])
    const result = {
      processes: data.map(processSummary),
      total: data.length
    }
    return yield* encodeOrConnectionError(ListProcessesResultSchema, result, "listProcesses")
  })

export const getProcess = (
  params: GetProcessParams
): Effect.Effect<ProcessDetail, ProcessOperationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const process = yield* resolveProcess(client, params.process)
    const [data] = yield* loadProcessDefinitionData(client, [process])
    const [states, transitions] = yield* Effect.all([
      client.findAll<HulyProcessState>(
        processPlugin.class.State,
        { process: process._id },
        { sort: { rank: SortingOrder.Ascending } }
      ),
      client.findAll<HulyProcessTransition>(
        processPlugin.class.Transition,
        { process: process._id },
        { sort: { rank: SortingOrder.Ascending } }
      )
    ])

    const result = processDetail({ ...data, states: [...states], transitions: [...transitions] })
    return yield* encodeOrConnectionError(ProcessDetailSchema, result, "getProcess")
  })

export const listExecutions = (
  params: ListExecutionsParams
): Effect.Effect<ListExecutionsResult, ProcessOperationError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const process = params.process === undefined ? undefined : yield* resolveProcess(client, params.process)
    const card = params.card === undefined ? undefined : yield* resolveCardFilter(client, params.card)
    const query: DocumentQuery<HulyProcessExecution> = {
      ...(process === undefined ? {} : { process: process._id }),
      ...(card === undefined ? {} : { card }),
      ...(params.status === undefined ? {} : { status: params.status })
    }
    const executions = yield* client.findAll<HulyProcessExecution>(
      processPlugin.class.Execution,
      query,
      { limit: clampLimit(params.limit), sort: { modifiedOn: SortingOrder.Descending } }
    )

    const processIds = executions.map((execution) => execution.process)
    const processLookup = processIds.length === 0
      ? Effect.succeed(new Map<Ref<HulyProcessDefinition>, HulyProcessDefinition>())
      : client.findAll<HulyProcessDefinition>(
        processPlugin.class.Process,
        { _id: { $in: Array.from(new Set(processIds)) } }
      ).pipe(Effect.map((items) => new Map(items.map((item) => [item._id, item]))))
    const [processes, states, cards] = yield* Effect.all([
      processLookup,
      findStatesByIds(client, executions.map((execution) => execution.currentState)),
      findCardsByIds(client, executions.map((execution) => execution.card))
    ])

    const result = {
      executions: executions.map((execution) => executionSummary(execution, processes, states, cards)),
      total: executions.length
    }
    return yield* encodeOrConnectionError(ListExecutionsResultSchema, result, "listExecutions")
  })
