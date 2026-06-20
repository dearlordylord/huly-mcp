import {
  cancelExecutionParamsJsonSchema,
  getProcessParamsJsonSchema,
  listExecutionsParamsJsonSchema,
  listProcessesParamsJsonSchema,
  parseCancelExecutionParams,
  parseGetProcessParams,
  parseListExecutionsParams,
  parseListProcessesParams,
  parseStartProcessParams,
  ProcessDetailSchema,
  startProcessParamsJsonSchema
} from "../../domain/schemas.js"
import {
  CancelExecutionResultSchema,
  ListExecutionsResultSchema,
  ListProcessesResultSchema,
  StartProcessResultSchema
} from "../../domain/schemas/processes.js"
import {
  cancelExecution,
  getProcess,
  listExecutions,
  listProcesses,
  startProcess
} from "../../huly/operations/processes.js"
import { defineTool, type RegisteredTool } from "./registry.js"
const CATEGORY = "processes" as const
export const processTools: ReadonlyArray<RegisteredTool> = [
  defineTool(
    {
      name: "list_processes",
      description:
        "List read-only Huly Process workflow definitions. Optionally filter by the master tag/card type that workflows attach to. Returns process IDs, names, attached card type, automation flags, and state/transition counts.",
      category: CATEGORY,
      inputSchema: listProcessesParamsJsonSchema,
      resultSchema: ListProcessesResultSchema
    },
    parseListProcessesParams,
    listProcesses
  ),
  defineTool(
    {
      name: "get_process",
      description:
        "Get one Huly Process workflow definition by process ID or exact display name. If a name is ambiguous, the tool returns a typed error with candidate IDs instead of guessing.",
      category: CATEGORY,
      inputSchema: getProcessParamsJsonSchema,
      resultSchema: ProcessDetailSchema
    },
    parseGetProcessParams,
    getProcess
  ),
  defineTool(
    {
      name: "list_process_executions",
      description:
        "List read-only Huly Process workflow executions. Supports filters by process ID/name, card/document ID/title, and status. Rows are enriched with process name, card title, and current state title when available.",
      category: CATEGORY,
      inputSchema: listExecutionsParamsJsonSchema,
      resultSchema: ListExecutionsResultSchema
    },
    parseListExecutionsParams,
    listExecutions
  ),
  defineTool(
    {
      name: "start_process",
      description:
        "Start a new active Huly Process workflow execution on a card/document. Accepts process ID or exact process name, and card/document ID or exact title; ambiguous names or titles fail with candidate IDs. This is not idempotent: each successful call creates a new execution unless the process forbids parallel active executions for the same card, in which case the existing active execution ID is returned in a typed error.",
      category: CATEGORY,
      inputSchema: startProcessParamsJsonSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false
      },
      resultSchema: StartProcessResultSchema
    },
    parseStartProcessParams,
    startProcess
  ),
  defineTool(
    {
      name: "cancel_execution",
      description:
        "Idempotently cancel one Huly Process execution by execution ID. Active executions are marked cancelled; already-cancelled executions succeed with cancelled=false; completed executions fail without changing history.",
      category: CATEGORY,
      inputSchema: cancelExecutionParamsJsonSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      resultSchema: CancelExecutionResultSchema
    },
    parseCancelExecutionParams,
    cancelExecution
  )
]
