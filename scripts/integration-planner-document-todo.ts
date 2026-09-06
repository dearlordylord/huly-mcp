import type { Document as HulyDocument, Teamspace as HulyTeamspace } from "@hcengineering/document"
import type { TxOperations } from "@hcengineering/core"
import type { ToDo as HulyToDo } from "@hcengineering/time"
import { Schema } from "effect"
import { setTimeout } from "node:timers/promises"
import { parseArgs } from "node:util"

import { DocumentId, NonEmptyString, ObjectClassName, TeamspaceId, TodoId } from "../src/domain/schemas/shared.js"
import { documentPlugin, time } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const CliArgsSchema = Schema.Struct({ teamspace: TeamspaceId, document: DocumentId, todo: TodoId })
const DocumentTodoStateSchema = Schema.Struct({
  todoId: TodoId,
  todoClass: ObjectClassName,
  attachedTo: DocumentId,
  attachedToClass: ObjectClassName,
  attachedSpace: TeamspaceId,
  documentId: DocumentId,
  documentTitle: NonEmptyString,
  teamspaceId: TeamspaceId,
  teamspaceName: NonEmptyString
})
const decodeCliArgs = Schema.decodeUnknownSync(CliArgsSchema)
const decodeDocumentTodoState = Schema.decodeUnknownSync(DocumentTodoStateSchema)

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>
type DocumentTodoState = Schema.Schema.Type<typeof DocumentTodoStateSchema>

const NODE_ARGV_OFFSET = 2
const MAX_POLL_ATTEMPTS = 30
const POLL_INTERVAL_MS = 250

const parseCliArgs = (): CliArgs =>
  decodeCliArgs(
    parseArgs({
      args: process.argv.slice(NODE_ARGV_OFFSET),
      options: { teamspace: { type: "string" }, document: { type: "string" }, todo: { type: "string" } }
    }).values
  )

const requireEqual = (field: string, actual: unknown, expected: unknown): void => {
  if (actual !== expected) {
    throw new Error(`Document ToDo ${field} mismatch: expected ${String(expected)}, received ${String(actual)}.`)
  }
}

const readDocumentTodo = async (client: TxOperations, args: CliArgs): Promise<DocumentTodoState | undefined> => {
  const teamspace = await client.findOne<HulyTeamspace>(
    documentPlugin.class.Teamspace,
    hulyQuery<HulyTeamspace>({ _id: toRef<HulyTeamspace>(args.teamspace) })
  )
  if (teamspace === undefined) return undefined

  const document = await client.findOne<HulyDocument>(
    documentPlugin.class.Document,
    hulyQuery<HulyDocument>({ _id: toRef<HulyDocument>(args.document) })
  )
  if (document === undefined) return undefined

  const todo = await client.findOne<HulyToDo>(time.class.ToDo, hulyQuery<HulyToDo>({ _id: toRef<HulyToDo>(args.todo) }))
  if (todo === undefined) return undefined

  requireEqual("document teamspace", document.space, teamspace._id)
  requireEqual("todo class", todo._class, time.class.ToDo)
  requireEqual("attached document", todo.attachedTo, document._id)
  requireEqual("attached document class", todo.attachedToClass, documentPlugin.class.Document)
  requireEqual("attached teamspace", todo.attachedSpace, teamspace._id)

  return decodeDocumentTodoState({
    todoId: todo._id,
    todoClass: todo._class,
    attachedTo: todo.attachedTo,
    attachedToClass: todo.attachedToClass,
    attachedSpace: todo.attachedSpace,
    documentId: document._id,
    documentTitle: document.title,
    teamspaceId: teamspace._id,
    teamspaceName: teamspace.name
  })
}

const waitForDocumentTodo = async (args: CliArgs): Promise<DocumentTodoState> => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const { client } = await connectIntegrationHuly()
    try {
      const state = await readDocumentTodo(client, args)
      if (state !== undefined) return state
    } finally {
      await client.close()
    }
    await setTimeout(POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for document ToDo '${args.todo}'.`)
}

const main = async (): Promise<void> => {
  const state = await waitForDocumentTodo(parseCliArgs())
  // eslint-disable-next-line no-console -- JSON stdout is this integration helper's result boundary.
  console.log(JSON.stringify(state))
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console -- stderr is this integration helper's failure boundary.
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exit(1)
})
