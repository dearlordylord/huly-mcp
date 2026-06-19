import { describe, it } from "@effect/vitest"
import type { Card, MasterTag } from "@hcengineering/card"
import type { Class, Doc, DocumentQuery, PersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { IntlString } from "@hcengineering/platform"
import { Effect } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import {
  ProcessCardIdentifier,
  ProcessExecutionId,
  ProcessIdentifier,
  ProcessMasterTagIdentifier
} from "../../../src/domain/schemas.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { cardPlugin, core } from "../../../src/huly/huly-plugins.js"
import {
  cancelExecution,
  getProcess,
  listExecutions,
  listProcesses,
  startProcess
} from "../../../src/huly/operations/processes.js"
import {
  type HulyProcessDefinition,
  type HulyProcessExecution,
  type HulyProcessState,
  type HulyProcessTransition,
  processPlugin
} from "../../../src/huly/process-plugin.js"

const personId = "person-1" as PersonId
const processId = "process-approval" as Ref<HulyProcessDefinition>
const duplicateProcessId = "process-approval-2" as Ref<HulyProcessDefinition>
const masterTagId = "card:class:Document" as Ref<MasterTag>
const otherMasterTagId = "card:class:Proposal" as Ref<MasterTag>
const initStateId = "state-draft" as Ref<HulyProcessState>
const approvedStateId = "state-approved" as Ref<HulyProcessState>
const cardId = "card-1" as Ref<Card>

// Huly SDK refs are phantom-branded strings. Fixture objects use plain runtime
// strings shaped as SDK docs so operation behavior can be tested without Huly.
const asProcess = (value: unknown): HulyProcessDefinition => value as HulyProcessDefinition
const asState = (value: unknown): HulyProcessState => value as HulyProcessState
const asTransition = (value: unknown): HulyProcessTransition => value as HulyProcessTransition
const asExecution = (value: unknown): HulyProcessExecution => value as HulyProcessExecution
const asCard = (value: unknown): Card => value as Card
const asMasterTag = (value: unknown): MasterTag => value as MasterTag
const asIntlString = (value: string): IntlString => value as IntlString

interface CreateDocCall {
  readonly class: unknown
  readonly space: Ref<Space>
  readonly attributes: unknown
  readonly id?: string
}

interface UpdateDocCall {
  readonly class: unknown
  readonly space: Ref<Space>
  readonly objectId: string
  readonly operations: unknown
}

const makeProcess = (overrides?: Partial<HulyProcessDefinition>): HulyProcessDefinition =>
  asProcess({
    _id: processId,
    _class: processPlugin.class.Process,
    space: core.space.Model,
    modifiedOn: 10,
    modifiedBy: personId,
    name: "Approval",
    description: "Approval workflow",
    masterTag: masterTagId,
    autoStart: true,
    automationOnly: false,
    parallelExecutionForbidden: false,
    ...overrides
  })

const makeInitialTransition = (overrides?: Partial<HulyProcessTransition>): HulyProcessTransition =>
  asTransition({
    _id: "transition-start",
    _class: processPlugin.class.Transition,
    space: core.space.Model,
    modifiedOn: 10,
    modifiedBy: personId,
    process: processId,
    from: null,
    to: initStateId,
    trigger: "process:trigger:OnExecutionStart",
    actions: [],
    rank: "0",
    ...overrides
  })

const makeState = (overrides?: Partial<HulyProcessState>): HulyProcessState =>
  asState({
    _id: initStateId,
    _class: processPlugin.class.State,
    space: core.space.Model,
    modifiedOn: 10,
    modifiedBy: personId,
    process: processId,
    title: "Draft",
    rank: "a",
    ...overrides
  })

const makeTransition = (overrides?: Partial<HulyProcessTransition>): HulyProcessTransition =>
  asTransition({
    _id: "transition-submit",
    _class: processPlugin.class.Transition,
    space: core.space.Model,
    modifiedOn: 10,
    modifiedBy: personId,
    process: processId,
    from: initStateId,
    to: approvedStateId,
    trigger: "process:trigger:OnExecutionStart",
    actions: [{ _id: "step-1" }],
    rank: "a",
    ...overrides
  })

const makeExecution = (overrides?: Partial<HulyProcessExecution>): HulyProcessExecution =>
  asExecution({
    _id: "execution-1",
    _class: processPlugin.class.Execution,
    space: core.space.Model,
    modifiedOn: 100,
    modifiedBy: personId,
    process: processId,
    currentState: approvedStateId,
    card: cardId,
    rollback: [],
    context: {},
    status: "active",
    error: null,
    ...overrides
  })

const makeCard = (overrides?: Partial<Card>): Card =>
  asCard({
    _id: cardId,
    _class: masterTagId,
    space: "card-space-1",
    modifiedOn: 100,
    modifiedBy: personId,
    title: "Contract",
    content: "blob-1",
    blobs: {},
    parentInfo: [],
    rank: "a",
    ...overrides
  })

const makeMasterTag = (overrides?: Partial<MasterTag>): MasterTag =>
  asMasterTag({
    _id: masterTagId,
    _class: cardPlugin.class.MasterTag,
    space: core.space.Model,
    modifiedOn: 10,
    modifiedBy: personId,
    label: "Document",
    ...overrides
  })

const createLayer = (config?: {
  readonly processes?: ReadonlyArray<HulyProcessDefinition>
  readonly states?: ReadonlyArray<HulyProcessState>
  readonly transitions?: ReadonlyArray<HulyProcessTransition>
  readonly executions?: ReadonlyArray<HulyProcessExecution>
  readonly cards?: ReadonlyArray<Card>
  readonly masterTags?: ReadonlyArray<MasterTag>
  readonly total?: number
  readonly createDocCalls?: Array<CreateDocCall>
  readonly updateDocCalls?: Array<UpdateDocCall>
}) => {
  const processes = config?.processes ?? [makeProcess()]
  const states = config?.states ?? [
    makeState(),
    makeState({ _id: approvedStateId, title: "Approved" })
  ]
  const transitions = config?.transitions ?? [makeInitialTransition(), makeTransition()]
  const executions = config?.executions ?? [makeExecution()]
  const cards = config?.cards ?? [makeCard()]
  const masterTags = config?.masterTags ?? [
    makeMasterTag(),
    makeMasterTag({ _id: otherMasterTagId, label: asIntlString("Proposal") })
  ]

  const filterByQuery = <D extends { readonly _id: unknown }>(
    items: ReadonlyArray<D>,
    query: Record<string, unknown>
  ): ReadonlyArray<D> =>
    items.filter((item) =>
      Object.entries(query).every(([key, expected]) => {
        const actual = item[key as keyof D]
        return typeof expected === "object" && expected !== null && "$in" in expected
          ? Array.isArray(expected.$in) && expected.$in.includes(actual)
          : actual === expected
      })
    )

  const findResult = <T extends Doc>(items: ReadonlyArray<T>) => {
    // HulyClient.findAll is generic by requested class; this fixture dispatches
    // by class ref and then returns the matching collection through that boundary.

    const result = toFindResult([...items])
    return Effect.succeed(config?.total === undefined ? result : Object.assign(result, { total: config.total }))
  }

  const findAllImpl: HulyClientOperations["findAll"] = (<T extends Doc>(_class: Ref<Class<T>>, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === processPlugin.class.Process) return findResult(filterByQuery(processes, q))
    if (_class === processPlugin.class.State) return findResult(filterByQuery(states, q))
    if (_class === processPlugin.class.Transition) return findResult(filterByQuery(transitions, q))
    if (_class === processPlugin.class.Execution) return findResult(filterByQuery(executions, q))
    if (_class === cardPlugin.class.Card) return findResult(filterByQuery(cards, q))
    if (_class === cardPlugin.class.MasterTag) return findResult(filterByQuery(masterTags, q))
    return findResult([])
  }) as HulyClientOperations["findAll"]

  const findOneImpl: HulyClientOperations["findOne"] = (<T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => findAllImpl<T>(_class, query).pipe(Effect.map((items) => items.at(0)))) as HulyClientOperations["findOne"]

  const createDocImpl: HulyClientOperations["createDoc"] = ((
    _class: unknown,
    space: Ref<Space>,
    attributes: unknown,
    id?: unknown
  ) => {
    config?.createDocCalls?.push(
      id === undefined
        ? {
          class: _class,
          space,
          attributes
        }
        : {
          class: _class,
          space,
          attributes,
          id: String(id)
        }
    )
    return Effect.succeed((id ?? "execution-new") as Ref<Doc>)
  }) as HulyClientOperations["createDoc"]

  const updateDocImpl: HulyClientOperations["updateDoc"] = ((
    _class: unknown,
    space: Ref<Space>,
    objectId: unknown,
    operations: unknown
  ) => {
    config?.updateDocCalls?.push({
      class: _class,
      space,
      objectId: String(objectId),
      operations
    })
    return Effect.succeed({})
  }) as HulyClientOperations["updateDoc"]

  return HulyClient.testLayer({
    findAll: findAllImpl,
    findOne: findOneImpl,
    createDoc: createDocImpl,
    updateDoc: updateDocImpl
  })
}

describe("process operations", () => {
  it.effect("lists processes with master tag names and workflow counts", () =>
    Effect.gen(function*() {
      const result = yield* listProcesses({}).pipe(Effect.provide(createLayer()))

      expect(result).toEqual({
        processes: [{
          id: processId,
          name: "Approval",
          description: "Approval workflow",
          masterTagId,
          masterTagName: "Document",
          autoStart: true,
          automationOnly: false,
          parallelExecutionForbidden: false,
          stateCount: 2,
          transitionCount: 2
        }],
        total: 1
      })
    }))

  it.effect("filters processes by master tag display name", () =>
    Effect.gen(function*() {
      const result = yield* listProcesses({ masterTag: ProcessMasterTagIdentifier.make("Proposal") }).pipe(
        Effect.provide(createLayer({
          processes: [
            makeProcess(),
            makeProcess({ _id: duplicateProcessId, name: "Proposal QA", masterTag: otherMasterTagId })
          ]
        }))
      )

      expect(result.processes.map((process) => process.id)).toEqual([duplicateProcessId])
    }))

  it.effect("filters processes by raw master tag ID even when display lookup is unavailable", () =>
    Effect.gen(function*() {
      const dynamicMasterTag = "card:masterTag:External" as Ref<MasterTag>
      const result = yield* listProcesses({
        masterTag: ProcessMasterTagIdentifier.make(dynamicMasterTag)
      }).pipe(
        Effect.provide(createLayer({
          processes: [
            makeProcess(),
            makeProcess({ _id: duplicateProcessId, name: "External Flow", masterTag: dynamicMasterTag })
          ]
        }))
      )

      expect(result.processes.map((process) => process.id)).toEqual([duplicateProcessId])
    }))

  it.effect("fails unknown master tag display names", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        listProcesses({ masterTag: ProcessMasterTagIdentifier.make("Missing Card Type") }).pipe(
          Effect.provide(createLayer())
        )
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessMasterTagNotFoundError")
      }
    }))

  it.effect("uses returned item count when Huly does not include a process total", () =>
    Effect.gen(function*() {
      const result = yield* listProcesses({}).pipe(Effect.provide(createLayer({ total: -1 })))

      expect(result.total).toBe(1)
    }))

  it.effect("gets process details by name with states and transitions", () =>
    Effect.gen(function*() {
      const result = yield* getProcess({ process: ProcessIdentifier.make("approval") }).pipe(
        Effect.provide(createLayer())
      )

      expect(result.id).toBe(processId)
      expect(result.initialStateId).toBe(initStateId)
      expect(result.states.map((state) => state.title)).toEqual(["Draft", "Approved"])
      expect(result.transitions).toEqual([
        {
          id: "transition-start",
          fromStateId: undefined,
          fromStateTitle: undefined,
          toStateId: initStateId,
          toStateTitle: "Draft",
          triggerId: "process:trigger:OnExecutionStart",
          actionCount: 0
        },
        {
          id: "transition-submit",
          fromStateId: initStateId,
          fromStateTitle: "Draft",
          toStateId: approvedStateId,
          toStateTitle: "Approved",
          triggerId: "process:trigger:OnExecutionStart",
          actionCount: 1
        }
      ])
    }))

  it.effect("fails ambiguous process names with candidates", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        getProcess({ process: ProcessIdentifier.make("Approval") }).pipe(Effect.provide(createLayer({
          processes: [
            makeProcess(),
            makeProcess({ _id: duplicateProcessId, masterTag: otherMasterTagId })
          ]
        })))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessIdentifierAmbiguousError")
        expect(result.left.message).toContain(String(processId))
        expect(result.left.message).toContain(String(duplicateProcessId))
      }
    }))

  it.effect("lists executions enriched with process, card, and state details", () =>
    Effect.gen(function*() {
      const result = yield* listExecutions({ status: "active" }).pipe(Effect.provide(createLayer()))

      expect(result).toEqual({
        executions: [{
          id: "execution-1",
          processId,
          processName: "Approval",
          cardId,
          cardTitle: "Contract",
          currentStateId: approvedStateId,
          currentStateTitle: "Approved",
          status: "active",
          errorCount: 0,
          hasError: false,
          hasParent: false,
          modifiedOn: 100
        }],
        total: 1
      })
    }))

  it.effect("includes execution error and parent details", () =>
    Effect.gen(function*() {
      const parentExecutionId = "execution-parent" as Ref<HulyProcessExecution>
      const result = yield* listExecutions({}).pipe(Effect.provide(createLayer({
        executions: [
          makeExecution({
            error: [{ message: "failed" }],
            parentId: parentExecutionId
          })
        ]
      })))

      expect(assertAt(result.executions, 0).errorCount).toBe(1)
      expect(assertAt(result.executions, 0).hasError).toBe(true)
      expect(assertAt(result.executions, 0).hasParent).toBe(true)
      expect(assertAt(result.executions, 0).parentExecutionId).toBe(parentExecutionId)
    }))

  it.effect("uses returned item count when Huly does not include an execution total", () =>
    Effect.gen(function*() {
      const result = yield* listExecutions({}).pipe(Effect.provide(createLayer({ total: -1 })))

      expect(result.total).toBe(1)
    }))

  it.effect("filters executions by card ID before considering matching titles", () =>
    Effect.gen(function*() {
      const titleCollisionId = "card-title-collision" as Ref<Card>
      const result = yield* listExecutions({
        card: ProcessCardIdentifier.make(titleCollisionId)
      }).pipe(Effect.provide(createLayer({
        cards: [
          makeCard({ _id: titleCollisionId, title: "Actual ID Target" }),
          makeCard({ _id: "card-other" as Ref<Card>, title: titleCollisionId })
        ],
        executions: [
          makeExecution({ _id: "execution-id-target" as Ref<HulyProcessExecution>, card: titleCollisionId }),
          makeExecution({ _id: "execution-title-target" as Ref<HulyProcessExecution>, card: "card-other" as Ref<Card> })
        ]
      })))

      expect(result.executions.map((execution) => execution.id)).toEqual(["execution-id-target"])
    }))

  it.effect("fails ambiguous card title execution filters with candidate IDs", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        listExecutions({ card: ProcessCardIdentifier.make("Contract") }).pipe(Effect.provide(createLayer({
          cards: [
            makeCard(),
            makeCard({ _id: "card-2" as Ref<Card> })
          ]
        })))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessCardIdentifierAmbiguousError")
        expect(result.left.message).toContain("card-1")
        expect(result.left.message).toContain("card-2")
      }
    }))

  it.effect("fails unknown card title execution filters", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        listExecutions({ card: ProcessCardIdentifier.make("Missing Contract") }).pipe(Effect.provide(createLayer()))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessCardNotFoundError")
      }
    }))

  it.effect("starts a process by process ID and card ID", () =>
    Effect.gen(function*() {
      const createDocCalls: Array<CreateDocCall> = []
      const result = yield* startProcess({
        process: ProcessIdentifier.make(processId),
        card: ProcessCardIdentifier.make(cardId)
      }).pipe(Effect.provide(createLayer({ executions: [], createDocCalls })))

      expect(result).toMatchObject({
        processId,
        processName: "Approval",
        cardId,
        cardTitle: "Contract",
        currentStateId: initStateId,
        currentStateTitle: "Draft",
        status: "active"
      })
      const createdExecution = assertAt(createDocCalls, 0)
      expect(result.executionId).toBe(createdExecution.id)
      expect(createdExecution.class).toBe(processPlugin.class.Execution)
      expect(createdExecution.space).toBe(core.space.Workspace)
      expect(createdExecution.attributes).toEqual({
        process: processId,
        card: cardId,
        currentState: initStateId,
        rollback: [],
        context: {},
        status: "active"
      })
    }))

  it.effect("starts a process by process name and card title", () =>
    Effect.gen(function*() {
      const result = yield* startProcess({
        process: ProcessIdentifier.make("approval"),
        card: ProcessCardIdentifier.make("Contract")
      }).pipe(Effect.provide(createLayer({ executions: [] })))

      expect(result.processId).toBe(processId)
      expect(result.cardId).toBe(cardId)
      expect(result.currentStateId).toBe(initStateId)
    }))

  it.effect("uses the lowest-rank null transition as the initial process state", () =>
    Effect.gen(function*() {
      const earliestStateId = "state-earliest" as Ref<HulyProcessState>
      const createDocCalls: Array<CreateDocCall> = []
      const result = yield* startProcess({
        process: ProcessIdentifier.make(processId),
        card: ProcessCardIdentifier.make(cardId)
      }).pipe(Effect.provide(createLayer({
        executions: [],
        states: [
          makeState({ _id: earliestStateId, title: "Earliest", rank: "0" }),
          makeState()
        ],
        transitions: [
          makeInitialTransition({ _id: "transition-late" as Ref<HulyProcessTransition>, to: initStateId, rank: "z" }),
          makeInitialTransition({
            _id: "transition-early" as Ref<HulyProcessTransition>,
            to: earliestStateId,
            rank: "a"
          })
        ],
        createDocCalls
      })))

      expect(result.currentStateId).toBe(earliestStateId)
      expect(result.currentStateTitle).toBe("Earliest")
      expect(assertAt(createDocCalls, 0).attributes).toMatchObject({ currentState: earliestStateId })
    }))

  it.effect("fails start_process when the process has no initial transition", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        startProcess({
          process: ProcessIdentifier.make(processId),
          card: ProcessCardIdentifier.make(cardId)
        }).pipe(Effect.provide(createLayer({
          transitions: [makeTransition()],
          executions: []
        })))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessInitialStateNotFoundError")
      }
    }))

  it.effect("fails start_process when parallel execution is forbidden and an active execution exists", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        startProcess({
          process: ProcessIdentifier.make(processId),
          card: ProcessCardIdentifier.make(cardId)
        }).pipe(Effect.provide(createLayer({
          processes: [makeProcess({ parallelExecutionForbidden: true })],
          executions: [makeExecution({ currentState: initStateId, status: "active" })]
        })))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessParallelExecutionForbiddenError")
        expect(result.left.message).toContain("execution-1")
      }
    }))

  it.effect("fails start_process for ambiguous card titles", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        startProcess({
          process: ProcessIdentifier.make(processId),
          card: ProcessCardIdentifier.make("Contract")
        }).pipe(Effect.provide(createLayer({
          executions: [],
          cards: [
            makeCard(),
            makeCard({ _id: "card-2" as Ref<Card> })
          ]
        })))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessCardIdentifierAmbiguousError")
      }
    }))

  it.effect("fails start_process for missing card titles", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        startProcess({
          process: ProcessIdentifier.make(processId),
          card: ProcessCardIdentifier.make("Missing Contract")
        }).pipe(Effect.provide(createLayer({ executions: [] })))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessCardNotFoundError")
      }
    }))

  it.effect("cancels an active execution", () =>
    Effect.gen(function*() {
      const updateDocCalls: Array<UpdateDocCall> = []
      const result = yield* cancelExecution({
        execution: ProcessExecutionId.make("execution-1")
      }).pipe(Effect.provide(createLayer({ updateDocCalls })))

      expect(result).toEqual({
        executionId: "execution-1",
        status: "cancelled",
        cancelled: true
      })
      const updatedExecution = assertAt(updateDocCalls, 0)
      expect(updatedExecution.class).toBe(processPlugin.class.Execution)
      expect(updatedExecution.objectId).toBe("execution-1")
      expect(updatedExecution.operations).toEqual({ status: "cancelled" })
    }))

  it.effect("returns cancelled=false for already-cancelled executions without updating", () =>
    Effect.gen(function*() {
      const updateDocCalls: Array<UpdateDocCall> = []
      const result = yield* cancelExecution({
        execution: ProcessExecutionId.make("execution-1")
      }).pipe(Effect.provide(createLayer({
        executions: [makeExecution({ status: "cancelled" })],
        updateDocCalls
      })))

      expect(result).toEqual({
        executionId: "execution-1",
        status: "cancelled",
        cancelled: false
      })
      expect(updateDocCalls).toEqual([])
    }))

  it.effect("fails cancel_execution for missing executions", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        cancelExecution({
          execution: ProcessExecutionId.make("execution-missing")
        }).pipe(Effect.provide(createLayer({ executions: [] })))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessExecutionNotFoundError")
      }
    }))

  it.effect("fails cancel_execution for completed executions", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        cancelExecution({
          execution: ProcessExecutionId.make("execution-1")
        }).pipe(Effect.provide(createLayer({
          executions: [makeExecution({ status: "done" })]
        })))
      )

      expect(result._tag).toBe("Left")
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ProcessExecutionNotCancellableError")
      }
    }))
})

describe("process operations branch coverage", () => {
  it.effect("reports a connection error when a process fails output schema validation", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        listProcesses({}).pipe(Effect.provide(createLayer({ processes: [makeProcess({ name: "" })] })))
      )
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left._tag).toBe("HulyConnectionError")
    }))

  it.effect("defaults optional process flags and omits an empty description", () =>
    Effect.gen(function*() {
      const bare = asProcess({
        ...makeProcess(),
        description: undefined,
        autoStart: undefined,
        automationOnly: undefined,
        parallelExecutionForbidden: undefined
      })
      const result = yield* listProcesses({}).pipe(Effect.provide(createLayer({ processes: [bare] })))
      const summary = assertAt(result.processes, 0)
      expect(summary.autoStart).toBe(false)
      expect(summary.automationOnly).toBe(false)
      expect(summary.parallelExecutionForbidden).toBe(false)
      expect(summary.description).toBeUndefined()
    }))

  it.effect("falls back to the master tag id when its label is empty", () =>
    Effect.gen(function*() {
      const result = yield* listProcesses({}).pipe(Effect.provide(createLayer({
        processes: [makeProcess({ masterTag: masterTagId })],
        masterTags: [makeMasterTag({ label: asIntlString("") })]
      })))
      expect(result.processes[0]?.masterTagName).toBe(String(masterTagId))
    }))

  it.effect("lists no processes when none exist", () =>
    Effect.gen(function*() {
      const result = yield* listProcesses({}).pipe(Effect.provide(createLayer({ processes: [] })))
      expect(result).toEqual({ processes: [], total: 0 })
    }))

  it.effect("omits the initial state when no null-origin transition exists", () =>
    Effect.gen(function*() {
      const result = yield* getProcess({ process: ProcessIdentifier.make(processId) }).pipe(
        Effect.provide(createLayer({ transitions: [makeTransition()] }))
      )
      expect(result.initialStateId).toBeUndefined()
    }))

  it.effect("fails get_process when the identifier matches no process", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        getProcess({ process: ProcessIdentifier.make("Nonexistent") }).pipe(
          Effect.provide(createLayer({ processes: [makeProcess()] }))
        )
      )
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left._tag).toBe("ProcessNotFoundError")
    }))

  it.effect("resolves a master tag filter by exact id", () =>
    Effect.gen(function*() {
      const result = yield* listProcesses({ masterTag: ProcessMasterTagIdentifier.make(masterTagId) }).pipe(
        Effect.provide(createLayer())
      )
      expect(result.processes.map((process) => process.id)).toEqual([processId])
    }))

  it.effect("tolerates unlabeled tags while matching a master tag display name", () =>
    Effect.gen(function*() {
      const thirdTagId = "card:class:Blank" as Ref<MasterTag>
      const result = yield* listProcesses({ masterTag: ProcessMasterTagIdentifier.make("Proposal") }).pipe(
        Effect.provide(createLayer({
          processes: [makeProcess({ _id: duplicateProcessId, name: "Proposal QA", masterTag: otherMasterTagId })],
          masterTags: [
            makeMasterTag(),
            makeMasterTag({ _id: otherMasterTagId, label: asIntlString("Proposal") }),
            makeMasterTag({ _id: thirdTagId, label: asIntlString("") })
          ]
        }))
      )
      expect(result.processes.map((process) => process.id)).toEqual([duplicateProcessId])
    }))

  it.effect("fails an ambiguous master tag filter with candidate ids", () =>
    Effect.gen(function*() {
      const dupTagId = "card:class:Dup" as Ref<MasterTag>
      const result = yield* Effect.either(
        listProcesses({ masterTag: ProcessMasterTagIdentifier.make("Document") }).pipe(
          Effect.provide(createLayer({
            masterTags: [makeMasterTag(), makeMasterTag({ _id: dupTagId, label: asIntlString("Document") })]
          }))
        )
      )
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left._tag).toBe("ProcessMasterTagAmbiguousError")
    }))

  it.effect("lists no executions when none exist", () =>
    Effect.gen(function*() {
      const result = yield* listExecutions({}).pipe(Effect.provide(createLayer({ executions: [] })))
      expect(result).toEqual({ executions: [], total: 0 })
    }))

  it.effect("filters executions by a resolved process", () =>
    Effect.gen(function*() {
      const result = yield* listExecutions({ process: ProcessIdentifier.make(processId) }).pipe(
        Effect.provide(createLayer())
      )
      expect(result.executions.every((execution) => String(execution.processId) === String(processId))).toBe(true)
      expect(result.executions.length).toBeGreaterThan(0)
    }))

  it.effect("fails start_process when a synthesized card id resolves to no document", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        startProcess({
          process: ProcessIdentifier.make(processId),
          card: ProcessCardIdentifier.make("card:class:Ghost")
        }).pipe(Effect.provide(createLayer({ executions: [], cards: [] })))
      )
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left._tag).toBe("ProcessCardNotFoundError")
    }))

  it.effect("fails start_process when the initial state document is missing", () =>
    Effect.gen(function*() {
      const result = yield* Effect.either(
        startProcess({
          process: ProcessIdentifier.make(processId),
          card: ProcessCardIdentifier.make(cardId)
        }).pipe(Effect.provide(createLayer({
          executions: [],
          states: [],
          transitions: [makeInitialTransition()]
        })))
      )
      expect(result._tag).toBe("Left")
      if (result._tag === "Left") expect(result.left._tag).toBe("ProcessInitialStateNotFoundError")
    }))

  it.effect("starts a parallel-forbidden process when no active execution exists", () =>
    Effect.gen(function*() {
      const createDocCalls: Array<CreateDocCall> = []
      const result = yield* startProcess({
        process: ProcessIdentifier.make(processId),
        card: ProcessCardIdentifier.make(cardId)
      }).pipe(Effect.provide(createLayer({
        processes: [makeProcess({ parallelExecutionForbidden: true })],
        executions: [],
        createDocCalls
      })))
      expect(result.status).toBe("active")
      expect(createDocCalls).toHaveLength(1)
    }))
})
