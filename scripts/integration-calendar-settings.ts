import type {
  Calendar as HulyCalendar,
  ExternalCalendar as HulyExternalCalendar,
  PrimaryCalendar as HulyPrimaryCalendar
} from "@hcengineering/calendar"
import type { Data, Space, TxOperations } from "@hcengineering/core"
import { Schema, SchemaIssue } from "effect"
import { setTimeout as delay } from "node:timers/promises"
import { parseArgs } from "node:util"

import { CalendarAccessSchema, VisibilitySchema } from "../src/domain/schemas/calendar.js"
import { CalendarId, DocId, NonEmptyString, PersonId, SpaceId } from "../src/domain/schemas/shared.js"
import { calendar } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const NODE_ARGUMENT_OFFSET = 2
const MAX_POLL_ATTEMPTS = 40
const POLL_INTERVAL_MS = 250
const ATTEMPT_TIMEOUT_MS = 5_000

const SnapshotAbsentSchema = Schema.Struct({ status: Schema.Literal("absent") })
const SnapshotPresentSchema = Schema.Struct({
  status: Schema.Literal("present"),
  id: DocId,
  space: SpaceId,
  attachedTo: CalendarId
})
const PrimaryCalendarSnapshotSchema = Schema.Union([SnapshotAbsentSchema, SnapshotPresentSchema])
const SnapshotArgsSchema = Schema.Struct({ mode: Schema.Literal("snapshot") })
const RestoreArgsSchema = Schema.Struct({ mode: Schema.Literal("restore"), snapshot: NonEmptyString })
const SetAttachedArgsSchema = Schema.Struct({ mode: Schema.Literal("set-attached"), attachedTo: CalendarId })
const ProviderDefaultArgsSchema = Schema.Struct({ mode: Schema.Literal("provider-default") })
const CliArgsSchema = Schema.Union([
  SnapshotArgsSchema,
  RestoreArgsSchema,
  SetAttachedArgsSchema,
  ProviderDefaultArgsSchema
])

const PrimaryCalendarRowSchema = Schema.Struct({
  _id: DocId,
  _class: Schema.Literal(calendar.class.PrimaryCalendar),
  space: SpaceId,
  attachedTo: CalendarId
})

const SnapshotResultSchema = PrimaryCalendarSnapshotSchema
const RestoreResultSchema = Schema.Struct({ status: Schema.Literal("restored"), verified: Schema.Literal(true) })
const SetAttachedResultSchema = Schema.Struct({ status: Schema.Literal("updated"), verified: Schema.Literal(true) })
const ProviderDefaultFoundSchema = Schema.Struct({ status: Schema.Literal("found"), calendarId: CalendarId })
const ProviderDefaultAbsentSchema = Schema.Struct({ status: Schema.Literal("absent") })
const ProviderDefaultResultSchema = Schema.Union([ProviderDefaultFoundSchema, ProviderDefaultAbsentSchema])
const ProviderDefaultCalendarSchema = Schema.Struct({
  _id: CalendarId,
  hidden: Schema.Boolean,
  visibility: VisibilitySchema,
  access: CalendarAccessSchema,
  user: PersonId,
  default: Schema.Boolean
})

const decodeCliArgs = Schema.decodeUnknownSync(CliArgsSchema)
const decodePrimaryCalendarSnapshotJson = Schema.decodeUnknownSync(Schema.fromJsonString(PrimaryCalendarSnapshotSchema))
const decodePrimaryCalendarRow = Schema.decodeUnknownSync(PrimaryCalendarRowSchema)
const decodeProviderDefaultCalendar = Schema.decodeUnknownSync(ProviderDefaultCalendarSchema)

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>
type PrimaryCalendarSnapshot = Schema.Schema.Type<typeof PrimaryCalendarSnapshotSchema>
type PrimaryCalendarRow = Schema.Schema.Type<typeof PrimaryCalendarRowSchema>
type RestoreResult = Schema.Schema.Type<typeof RestoreResultSchema>
type SetAttachedArgs = Schema.Schema.Type<typeof SetAttachedArgsSchema>
type SetAttachedResult = Schema.Schema.Type<typeof SetAttachedResultSchema>
type ProviderDefaultResult = Schema.Schema.Type<typeof ProviderDefaultResultSchema>

const parseCliArgs = (): CliArgs =>
  decodeCliArgs(
    parseArgs({
      args: process.argv.slice(NODE_ARGUMENT_OFFSET),
      options: { mode: { type: "string" }, snapshot: { type: "string" }, attachedTo: { type: "string" } }
    }).values
  )

const parseSnapshot = (encoded: string): PrimaryCalendarSnapshot => decodePrimaryCalendarSnapshotJson(encoded)

const withAttemptTimeout = <A>(description: string, operation: Promise<A>): Promise<A> =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Timed out during one fresh-client attempt for ${description}.`)),
      ATTEMPT_TIMEOUT_MS
    )
    void operation.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (cause: unknown) => {
        clearTimeout(timeout)
        reject(cause)
      }
    )
  })

const withFreshClient = async <A>(use: (client: TxOperations) => Promise<A>): Promise<A> => {
  const connection = await connectIntegrationHuly()
  try {
    return await use(connection.client)
  } finally {
    await connection.client.close()
  }
}

const withFreshConnection = async <A>(
  use: (connection: Awaited<ReturnType<typeof connectIntegrationHuly>>) => Promise<A>
): Promise<A> => {
  const connection = await connectIntegrationHuly()
  try {
    return await use(connection)
  } finally {
    await connection.client.close()
  }
}

const readPrimaryCalendarRows = async (client: TxOperations): Promise<ReadonlyArray<PrimaryCalendarRow>> => {
  const rows = await client.findAll<HulyPrimaryCalendar>(
    calendar.class.PrimaryCalendar,
    hulyQuery<HulyPrimaryCalendar>({})
  )
  return rows.map((row) => decodePrimaryCalendarRow(row))
}

const readSnapshot = async (client: TxOperations): Promise<PrimaryCalendarSnapshot> => {
  const rows = await readPrimaryCalendarRows(client)
  if (rows.length > 1) {
    throw new Error(`Expected at most one caller PrimaryCalendar preference, found ${String(rows.length)}.`)
  }
  const [row] = rows
  return row === undefined
    ? { status: "absent" }
    : { status: "present", id: row._id, space: row.space, attachedTo: row.attachedTo }
}

const snapshot = async (): Promise<PrimaryCalendarSnapshot> => withFreshClient((client) => readSnapshot(client))

const providerDefault = async (): Promise<ProviderDefaultResult> =>
  withFreshConnection(async ({ client, primarySocialId, socialIds }) => {
    const rows = await client.findAll<HulyExternalCalendar>(
      calendar.class.ExternalCalendar,
      hulyQuery<HulyExternalCalendar>({})
    )
    const callerSocialIds = new Set([primarySocialId, ...socialIds].map(String))
    const candidates = rows.map((row) => decodeProviderDefaultCalendar(row))
    const row = candidates.find(
      (candidate) =>
        callerSocialIds.has(String(candidate.user)) &&
        !candidate.hidden &&
        (candidate.access === "owner" || candidate.access === "writer") &&
        candidate.default
    )
    return row === undefined ? { status: "absent" } : { status: "found", calendarId: row._id }
  })

const removeRows = async (client: TxOperations, rows: ReadonlyArray<PrimaryCalendarRow>): Promise<void> => {
  for (const row of rows) {
    await client.removeDoc(calendar.class.PrimaryCalendar, toRef<Space>(row.space), toRef<HulyPrimaryCalendar>(row._id))
  }
}

const createPreference = async (
  client: TxOperations,
  expected: Extract<PrimaryCalendarSnapshot, { status: "present" }>
) => {
  const attributes: Data<HulyPrimaryCalendar> = { attachedTo: toRef<HulyCalendar>(expected.attachedTo) }
  await client.createDoc(
    calendar.class.PrimaryCalendar,
    toRef<Space>(expected.space),
    attributes,
    toRef<HulyPrimaryCalendar>(expected.id)
  )
}

const restoreAbsentAttempt = async (client: TxOperations): Promise<void> => {
  await removeRows(client, await readPrimaryCalendarRows(client))
}

const restorePresentAttempt = async (
  client: TxOperations,
  expected: Extract<PrimaryCalendarSnapshot, { status: "present" }>
): Promise<void> => {
  const rows = await readPrimaryCalendarRows(client)
  const matching = rows.filter((row) => row._id === expected.id)
  await removeRows(
    client,
    rows.filter((row) => row._id !== expected.id || row !== matching[0])
  )

  const current = matching[0]
  if (current === undefined) {
    await createPreference(client, expected)
    return
  }
  if (current.space !== expected.space) {
    await client.removeDoc(
      calendar.class.PrimaryCalendar,
      toRef<Space>(current.space),
      toRef<HulyPrimaryCalendar>(current._id)
    )
    await createPreference(client, expected)
    return
  }
  if (current.attachedTo !== expected.attachedTo) {
    await client.updateDoc(
      calendar.class.PrimaryCalendar,
      toRef<Space>(current.space),
      toRef<HulyPrimaryCalendar>(current._id),
      { attachedTo: toRef<HulyCalendar>(expected.attachedTo) }
    )
  }
}

const isExpectedSnapshot = (
  snapshotValue: PrimaryCalendarSnapshot,
  rows: ReadonlyArray<PrimaryCalendarRow>
): boolean => {
  if (snapshotValue.status === "absent") return rows.length === 0
  return (
    rows.length === 1 &&
    rows[0]?._id === snapshotValue.id &&
    rows[0]?.space === snapshotValue.space &&
    rows[0]?.attachedTo === snapshotValue.attachedTo
  )
}

const restore = async (expected: PrimaryCalendarSnapshot): Promise<RestoreResult> => {
  let lastCause: unknown
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    try {
      await withAttemptTimeout(
        "PrimaryCalendar restoration mutation",
        withFreshClient((client) =>
          expected.status === "absent" ? restoreAbsentAttempt(client) : restorePresentAttempt(client, expected)
        )
      )
    } catch (cause: unknown) {
      lastCause = cause
    }

    try {
      const verified = await withAttemptTimeout(
        "PrimaryCalendar restoration verification",
        withFreshClient(async (client) => isExpectedSnapshot(expected, await readPrimaryCalendarRows(client)))
      )
      if (verified) return { status: "restored", verified: true }
    } catch (cause: unknown) {
      lastCause = cause
    }
    if (attempt < MAX_POLL_ATTEMPTS - 1) await delay(POLL_INTERVAL_MS)
  }

  const detail = lastCause instanceof Error ? ` ${lastCause.message}` : ""
  throw new Error(`PrimaryCalendar restoration was not verified after bounded retries.${detail}`)
}

const setAttached = async (args: SetAttachedArgs): Promise<SetAttachedResult> => {
  let lastCause: unknown
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    try {
      await withAttemptTimeout(
        "stale PrimaryCalendar preference mutation",
        withFreshClient(async (client) => {
          const rows = await readPrimaryCalendarRows(client)
          if (rows.length !== 1) {
            throw new Error(`Expected exactly one caller PrimaryCalendar preference, found ${String(rows.length)}.`)
          }
          const [row] = rows
          if (row === undefined) throw new Error("PrimaryCalendar preference is absent.")
          await client.updateDoc(
            calendar.class.PrimaryCalendar,
            toRef<Space>(row.space),
            toRef<HulyPrimaryCalendar>(row._id),
            { attachedTo: toRef<HulyCalendar>(args.attachedTo) }
          )
        })
      )
    } catch (cause: unknown) {
      lastCause = cause
    }
    try {
      const verified = await withAttemptTimeout(
        "stale PrimaryCalendar preference verification",
        withFreshClient(async (client) => {
          const rows = await readPrimaryCalendarRows(client)
          return rows.length === 1 && rows[0]?.attachedTo === args.attachedTo
        })
      )
      if (verified) return { status: "updated", verified: true }
    } catch (cause: unknown) {
      lastCause = cause
    }
    if (attempt < MAX_POLL_ATTEMPTS - 1) await delay(POLL_INTERVAL_MS)
  }
  const detail = lastCause instanceof Error ? ` ${lastCause.message}` : ""
  throw new Error(`PrimaryCalendar stale-target mutation was not verified after bounded retries.${detail}`)
}

const main = async (): Promise<string> => {
  const args = parseCliArgs()
  if (args.mode === "snapshot") {
    const result = await snapshot()
    return JSON.stringify(Schema.encodeUnknownSync(SnapshotResultSchema)(result))
  }
  if (args.mode === "restore") {
    const expected = parseSnapshot(args.snapshot)
    const result = await restore(expected)
    return JSON.stringify(Schema.encodeUnknownSync(RestoreResultSchema)(result))
  }
  if (args.mode === "set-attached") {
    const result = await setAttached(args)
    return JSON.stringify(Schema.encodeUnknownSync(SetAttachedResultSchema)(result))
  }
  const result = await providerDefault()
  return JSON.stringify(Schema.encodeUnknownSync(ProviderDefaultResultSchema)(result))
}

void main().then(
  (output) => {
    // eslint-disable-next-line no-console -- JSON stdout is this integration helper's result boundary.
    console.log(output)
  },
  (cause: unknown) => {
    // eslint-disable-next-line no-console -- stderr is this integration helper's failure boundary.
    console.error(Schema.isSchemaError(cause) ? SchemaIssue.makeFormatterDefault()(cause.issue) : cause)
    process.exitCode = 1
  }
)
