import type { Calendar as HulyCalendar } from "@hcengineering/calendar"
import type { Employee, SocialIdentity } from "@hcengineering/contact"
import type { TxOperations } from "@hcengineering/core"
import type { WorkSlot as HulyWorkSlot } from "@hcengineering/time"
import { Console, Effect, Schema } from "effect"
import { setTimeout } from "node:timers/promises"
import { parseArgs } from "node:util"

import {
  CalendarId,
  EventId,
  NonEmptyString,
  ObjectClassName,
  PersonId,
  SpaceId,
  Timestamp,
  TodoId,
  WorkSlotId
} from "../src/domain/schemas/shared.js"
import { calendar, contact, time } from "../src/huly/huly-plugins.js"
import { hulyQuery } from "../src/huly/operations/query-helpers.js"
import { toRef, toSocialIdentityRef } from "../src/huly/operations/sdk-boundary.js"
import { connectIntegrationHuly } from "./integration-huly-client.js"

const CliArgsSchema = Schema.Struct({
  slot: WorkSlotId,
  todo: TodoId,
  calendar: CalendarId,
  date: Schema.NumberFromString.pipe(Schema.decodeTo(Timestamp)),
  dueDate: Schema.NumberFromString.pipe(Schema.decodeTo(Timestamp))
})
const PlannerSlotStateSchema = Schema.Struct({
  slotId: WorkSlotId,
  todoId: TodoId,
  attachedToClass: ObjectClassName,
  space: SpaceId,
  eventId: EventId,
  calendarId: CalendarId,
  ownerSocialIdentity: PersonId,
  participants: Schema.Array(PersonId),
  date: Timestamp,
  dueDate: Timestamp,
  visibility: Schema.Literal("freeBusy"),
  access: Schema.Literal("owner"),
  blockTime: Schema.Literal(true)
})

type CliArgs = Schema.Schema.Type<typeof CliArgsSchema>
type PlannerSlotState = Schema.Schema.Type<typeof PlannerSlotStateSchema>
const parsePlannerSlotState = Schema.decodeUnknownSync(PlannerSlotStateSchema)

const MAX_POLL_ATTEMPTS = 30
const NODE_ARGV_OFFSET = 2
const POLL_INTERVAL_MS = 250

const parseCliArgs = (): CliArgs =>
  Schema.decodeUnknownSync(CliArgsSchema)(
    parseArgs({
      args: process.argv.slice(NODE_ARGV_OFFSET),
      options: {
        slot: { type: "string" },
        todo: { type: "string" },
        calendar: { type: "string" },
        date: { type: "string" },
        dueDate: { type: "string" }
      }
    }).values
  )

const requireEqual = (field: string, actual: unknown, expected: unknown): void => {
  if (actual !== expected) {
    throw new Error(`Planner slot ${field} mismatch: expected ${String(expected)}, received ${String(actual)}.`)
  }
}

const readPlannerSlot = async (
  client: TxOperations,
  primarySocialId: PersonId,
  args: CliArgs
): Promise<PlannerSlotState | undefined> => {
  const primaryIdentity = await client.findOne<SocialIdentity>(
    contact.class.SocialIdentity,
    hulyQuery<SocialIdentity>({ _id: toSocialIdentityRef(primarySocialId) })
  )
  if (primaryIdentity === undefined) throw new Error("Authenticated primary social identity not found.")
  const employee = await client.findOne<Employee>(
    contact.mixin.Employee,
    hulyQuery<Employee>({ _id: toRef<Employee>(NonEmptyString.make(primaryIdentity.attachedTo)) })
  )
  if (employee === undefined) throw new Error("Authenticated employee identity not found.")

  const slot = await client.findOne<HulyWorkSlot>(
    time.class.WorkSlot,
    hulyQuery<HulyWorkSlot>({ _id: toRef<HulyWorkSlot>(args.slot) })
  )
  if (slot === undefined) return undefined

  const personalCalendar = await client.findOne<HulyCalendar>(
    calendar.class.Calendar,
    hulyQuery<HulyCalendar>({ _id: toRef<HulyCalendar>(args.calendar) })
  )
  if (personalCalendar === undefined) throw new Error("Planner slot personal calendar not found.")

  requireEqual("todoId", slot.attachedTo, args.todo)
  requireEqual("attachedToClass", slot.attachedToClass, time.class.ToDo)
  requireEqual("space", slot.space, calendar.space.Calendar)
  requireEqual("calendar", slot.calendar, args.calendar)
  requireEqual("slot owner primary identity", slot.user, primarySocialId)
  requireEqual("calendar owner primary identity", personalCalendar.user, primarySocialId)
  requireEqual("start", slot.date, args.date)
  requireEqual("end", slot.dueDate, args.dueDate)
  requireEqual("visibility", slot.visibility, "freeBusy")
  requireEqual("access", slot.access, "owner")
  requireEqual("blockTime", slot.blockTime, true)
  if (slot.eventId.trim() === "") throw new Error("Planner slot eventId is empty.")
  if (slot.participants.length !== 1 || slot.participants[0] !== employee._id) {
    throw new Error("Planner slot participants do not contain exactly the authenticated employee.")
  }

  return parsePlannerSlotState({
    slotId: slot._id,
    todoId: slot.attachedTo,
    attachedToClass: slot.attachedToClass,
    space: slot.space,
    eventId: slot.eventId,
    calendarId: slot.calendar,
    ownerSocialIdentity: slot.user,
    participants: slot.participants,
    date: slot.date,
    dueDate: slot.dueDate,
    visibility: slot.visibility,
    access: slot.access,
    blockTime: slot.blockTime
  })
}

const waitForPlannerSlot = async (args: CliArgs): Promise<PlannerSlotState> => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const { client, primarySocialId } = await connectIntegrationHuly()
    try {
      const state = await readPlannerSlot(client, primarySocialId, args)
      if (state !== undefined) return state
    } finally {
      await client.close()
    }
    await setTimeout(POLL_INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for Planner work slot '${args.slot}'.`)
}

const main = async (): Promise<void> => {
  const result = Schema.encodeSync(PlannerSlotStateSchema)(await waitForPlannerSlot(parseCliArgs()))
  await Effect.runPromise(Console.log(JSON.stringify(result)))
}

main().catch(async (error: unknown) => {
  await Effect.runPromise(Console.error(error instanceof Error ? (error.stack ?? error.message) : String(error)))
  process.exit(1)
})
