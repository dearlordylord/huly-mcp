import { Schema } from "effect"
import { boundModelWait } from "../../helpers/model-wait-parent.js"
import {
  ACTIVE_FIRST_ID,
  type ActiveQueryCommand,
  ActiveQueryEvent,
  type AdapterExit
} from "../active-query-contract.js"

const ADMISSION_FAILURE = "Stdio request admission limit reached or request id already active"
// Internal owned-process ports; command/event schemas own all IPC payloads.
export const makeActiveQueryBurst = (ports: {
  readonly send: (
    id: number,
    project: Schema.Schema.Type<typeof ActiveQueryCommand.cases.read>["project"]
  ) => Promise<void>
  readonly closed: Promise<Schema.Schema.Type<typeof AdapterExit>>
  readonly diagnostics: () => string
  readonly emit: (event: ActiveQueryEvent) => unknown
}) => {
  let phase: "fresh" | "filled" | "terminated" = "fresh"
  let nextId = ACTIVE_FIRST_ID
  return {
    occupied: () => phase !== "fresh",
    handle: async (command: Extract<ActiveQueryCommand, { readonly _tag: "fill" | "overflow" }>) => {
      if (command._tag === "fill") {
        if (phase !== "fresh") throw new Error("Burst fixture already used")
        phase = "filled"
        const ids: Array<number> = []
        for (const project of command.projects) {
          const id = nextId++
          await ports.send(id, project)
          ids.push(id)
        }
        ports.emit({ _tag: "filled", ids })
      } else {
        if (phase !== "filled") throw new Error("Burst fixture must fill before overflow")
        phase = "terminated"
        const rejectedId = nextId++
        await ports.send(rejectedId, command.project)
        const exit = await boundModelWait(ports.closed)
        ports.emit(
          Schema.decodeUnknownSync(ActiveQueryEvent.cases.limitExit)({
            _tag: "limitExit",
            ...exit,
            rejectedId,
            admissionFailure: ports.diagnostics().includes(ADMISSION_FAILURE)
          })
        )
      }
    }
  }
}
