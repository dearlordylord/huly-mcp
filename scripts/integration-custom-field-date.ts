import { type AnyAttribute, type Attribute, type Doc, type TxOperations } from "@hcengineering/core"
import { Console, Effect, Schema } from "effect"
import { randomUUID } from "node:crypto"
import { parseArgs } from "node:util"

import { CustomFieldDateTimestamp } from "../src/domain/schemas/custom-field-date.js"
import { CustomFieldId, DocId } from "../src/domain/schemas/shared.js"
import { core, tracker } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const CommonCliFields = { issueId: DocId }
const CliArgsSchema = Schema.Union([
  Schema.Struct({ ...CommonCliFields, mode: Schema.Literal("setup") }),
  Schema.Struct({ ...CommonCliFields, mode: Schema.Literal("read"), fieldName: Schema.String }),
  Schema.Struct({
    ...CommonCliFields,
    mode: Schema.Literal("cleanup"),
    fieldId: CustomFieldId,
    fieldName: Schema.String
  })
])
const SetupResultSchema = Schema.Struct({ fieldId: CustomFieldId, fieldName: Schema.String })
const ReadResultSchema = Schema.Struct({ value: Schema.NullOr(CustomFieldDateTimestamp) })
const CleanupResultSchema = Schema.Struct({ cleaned: Schema.Literal(true) })
const DynamicDocumentSchema = Schema.Record(Schema.String, Schema.Unknown)

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>
const parseCliArgsInput = Schema.decodeUnknownSync(CliArgsSchema)
const parseDynamicDocument = Schema.decodeUnknownSync(DynamicDocumentSchema)
const parseCustomFieldDateTimestamp = Schema.decodeUnknownSync(CustomFieldDateTimestamp)
const encodeSetupResult = Schema.encodeUnknownSync(SetupResultSchema)
const encodeReadResult = Schema.encodeUnknownSync(ReadResultSchema)
const encodeCleanupResult = Schema.encodeUnknownSync(CleanupResultSchema)

const NODE_ARGV_OFFSET = 2

const parseCliArgs = (): CliArgs =>
  parseCliArgsInput(
    parseArgs({
      args: process.argv.slice(NODE_ARGV_OFFSET),
      options: {
        issueId: { type: "string" },
        mode: { type: "string" },
        fieldId: { type: "string" },
        fieldName: { type: "string" }
      }
    }).values
  )

const requireIssue = async (client: TxOperations, issueId: DocId): Promise<Doc> => {
  const issue = await client.findOne<Doc>(tracker.class.Issue, hulyQuery<Doc>({ _id: toRef<Doc>(issueId) }))
  if (issue === undefined) throw new Error(`Integration issue '${issueId}' not found.`)
  return issue
}

const setup = async (client: TxOperations): Promise<Schema.Schema.Type<typeof SetupResultSchema>> => {
  const fieldId = CustomFieldId.make(randomUUID())
  const fieldRef = toRef<Attribute<number>>(fieldId)
  const fieldName = `issue172Date${fieldRef}`
  await client.createDoc<Attribute<number>>(
    core.class.Attribute,
    core.space.Model,
    {
      attributeOf: tracker.class.Issue,
      name: fieldName,
      label: core.string.Date,
      type: { _class: core.class.TypeDate, label: core.string.Date, icon: core.icon.TypeDate },
      isCustom: true
    },
    fieldRef
  )
  return { fieldId, fieldName }
}

const read = async (
  client: TxOperations,
  issueId: DocId,
  fieldName: string
): Promise<Schema.Schema.Type<typeof ReadResultSchema>> => {
  const issue = await requireIssue(client, issueId)
  const values = parseDynamicDocument(issue)
  const value = values[fieldName]
  return { value: value === undefined ? null : parseCustomFieldDateTimestamp(value) }
}

const cleanup = async (
  client: TxOperations,
  issueId: DocId,
  fieldId: CustomFieldId,
  fieldName: string
): Promise<Schema.Schema.Type<typeof CleanupResultSchema>> => {
  const issue = await requireIssue(client, issueId)
  await client.updateDoc<Doc>(tracker.class.Issue, issue.space, issue._id, { $unset: { [fieldName]: true } })
  await client.removeDoc<AnyAttribute>(core.class.Attribute, core.space.Model, toRef<AnyAttribute>(fieldId))
  return { cleaned: true }
}

const main = async (): Promise<string> => {
  const args = parseCliArgs()
  const { client } = await connectIntegrationHuly()
  try {
    switch (args.mode) {
      case "setup":
        return JSON.stringify(encodeSetupResult(await setup(client)))
      case "read":
        return JSON.stringify(encodeReadResult(await read(client, args.issueId, args.fieldName)))
      case "cleanup":
        return JSON.stringify(encodeCleanupResult(await cleanup(client, args.issueId, args.fieldId, args.fieldName)))
    }
  } finally {
    await client.close()
  }
}

void main().then(
  async (output) => {
    await Effect.runPromise(Console.log(output))
  },
  async (cause) => {
    await Effect.runPromise(Console.error(cause))
    // eslint-disable-next-line functional/immutable-data -- process exit status is the script boundary.
    process.exitCode = 1
  }
)
