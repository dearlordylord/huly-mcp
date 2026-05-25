import {
  getProcessParamsJsonSchema,
  listExecutionsParamsJsonSchema,
  ListExecutionsResultSchema,
  listProcessesParamsJsonSchema,
  ListProcessesResultSchema,
  parseGetProcessParams,
  parseListExecutionsParams,
  parseListProcessesParams,
  ProcessDetailSchema
} from "../../domain/schemas.js"
import { getProcess, listExecutions, listProcesses } from "../../huly/operations/processes.js"
import { createEncodedToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "processes" as const

export const processTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_processes",
    description:
      "List read-only Huly Process workflow definitions. Optionally filter by the master tag/card type that workflows attach to. Returns process IDs, names, attached card type, automation flags, and state/transition counts.",
    category: CATEGORY,
    inputSchema: listProcessesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_processes",
      parseListProcessesParams,
      listProcesses,
      ListProcessesResultSchema
    )
  },
  {
    name: "get_process",
    description:
      "Get one Huly Process workflow definition by process ID or exact display name. If a name is ambiguous, the tool returns a typed error with candidate IDs instead of guessing.",
    category: CATEGORY,
    inputSchema: getProcessParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_process",
      parseGetProcessParams,
      getProcess,
      ProcessDetailSchema
    )
  },
  {
    name: "list_process_executions",
    description:
      "List read-only Huly Process workflow executions. Supports filters by process ID/name, card/document ID/title, and status. Rows are enriched with process name, card title, and current state title when available.",
    category: CATEGORY,
    inputSchema: listExecutionsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_process_executions",
      parseListExecutionsParams,
      listExecutions,
      ListExecutionsResultSchema
    )
  }
]
