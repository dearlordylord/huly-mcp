import type { Card, MasterTag, Tag } from "@hcengineering/card"
import type { Class, Doc, Rank, Ref, Tx } from "@hcengineering/core"
import { type Plugin, plugin } from "@hcengineering/platform"

type ProcessExecutionStatusValue = "active" | "done" | "cancelled"

export interface HulyProcessDefinition extends Doc {
  readonly masterTag: Ref<MasterTag | Tag>
  readonly name: string
  readonly description: string
  readonly parallelExecutionForbidden?: boolean
  readonly autoStart?: boolean
  readonly automationOnly?: boolean
}

export interface HulyProcessState extends Doc {
  readonly process: Ref<HulyProcessDefinition>
  readonly title: string
  readonly rank: Rank
}

export interface HulyProcessTransition extends Doc {
  readonly process: Ref<HulyProcessDefinition>
  readonly from: Ref<HulyProcessState> | null
  readonly to: Ref<HulyProcessState>
  readonly trigger: Ref<Doc>
  readonly actions: ReadonlyArray<unknown>
  readonly rank: Rank
}

export interface HulyProcessExecution extends Doc {
  readonly process: Ref<HulyProcessDefinition>
  readonly currentState: Ref<HulyProcessState>
  readonly card: Ref<Card>
  readonly rollback: ReadonlyArray<ReadonlyArray<Tx>>
  readonly error?: ReadonlyArray<unknown> | null
  readonly parentId?: Ref<HulyProcessExecution>
  readonly context: Record<string, unknown>
  readonly result?: unknown
  readonly status: ProcessExecutionStatusValue
}

// @hcengineering/process is present in upstream Huly Platform but not published
// on npm for this dependency set. These refs mirror the upstream process plugin
// class names from plugins/process/src/index.ts and follow platform.plugin's id
// scheme. Replace this shim with the official package types once Huly publishes
// them for the SDK baseline used here.
/* eslint-disable no-restricted-syntax -- local upstream type shim: Plugin and Ref are phantom-branded strings erased at runtime */
const processId = "process" as Plugin

export const processPlugin = plugin(processId, {
  class: {
    Process: "" as Ref<Class<HulyProcessDefinition>>,
    Execution: "" as Ref<Class<HulyProcessExecution>>,
    State: "" as Ref<Class<HulyProcessState>>,
    Transition: "" as Ref<Class<HulyProcessTransition>>
  }
})
/* eslint-enable no-restricted-syntax */
