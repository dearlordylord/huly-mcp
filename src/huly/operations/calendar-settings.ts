import type {
  Calendar as HulyCalendar,
  ExternalCalendar as HulyExternalCalendar,
  PrimaryCalendar as HulyPrimaryCalendar
} from "@hcengineering/calendar"
import type { DocumentUpdate, Space } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type {
  CalendarSettingsTarget,
  CalendarSettingsSummary,
  ListCalendarSettingsParams,
  SetPrimaryCalendarParams,
  UpdateCalendarSettingsParams
} from "../../domain/schemas/calendar-settings.js"
import { CalendarAccessSchema, CalendarName, VisibilitySchema } from "../../domain/schemas/calendar.js"
import type {
  ListCalendarSettingsResult,
  SetPrimaryCalendarResult,
  UpdateCalendarSettingsResult
} from "../../domain/schemas/calendar-results.js"
import { CalendarId, Count, DocId, PersonId, SpaceId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import {
  CalendarSettingsIdentifierAmbiguousError,
  CalendarSettingsInternalCalendarHideError,
  CalendarSettingsTargetNotAccessibleError,
  CalendarSettingsTargetNotWritableError
} from "../errors.js"
import { HulyDataInvalidError } from "../errors-base.js"
import { calendar, core } from "../huly-plugins.js"
import { findCallerCalendars, selectPrimaryCalendar } from "./calendar-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef, toRef } from "./sdk-boundary.js"

type SetPrimaryCalendarError =
  | HulyClientError
  | HulyDataInvalidError
  | CalendarSettingsIdentifierAmbiguousError
  | CalendarSettingsTargetNotAccessibleError
  | CalendarSettingsTargetNotWritableError

type UpdateCalendarSettingsError =
  | HulyClientError
  | HulyDataInvalidError
  | CalendarSettingsIdentifierAmbiguousError
  | CalendarSettingsTargetNotAccessibleError
  | CalendarSettingsInternalCalendarHideError
  | CalendarSettingsTargetNotWritableError

const CalendarSettingsCalendarProjectionSchema = Schema.Union([
  Schema.Struct({
    _id: CalendarId,
    _class: Schema.Literal(calendar.class.Calendar),
    space: SpaceId,
    name: CalendarName,
    hidden: Schema.Boolean,
    visibility: VisibilitySchema,
    user: PersonId,
    access: CalendarAccessSchema,
    kind: Schema.Literal("internal"),
    default: Schema.Literal(false)
  }),
  Schema.Struct({
    _id: CalendarId,
    _class: Schema.Literal(calendar.class.ExternalCalendar),
    space: SpaceId,
    name: CalendarName,
    hidden: Schema.Boolean,
    visibility: VisibilitySchema,
    user: PersonId,
    access: CalendarAccessSchema,
    kind: Schema.Literal("external"),
    default: Schema.Boolean
  })
])
type CalendarSettingsCalendarProjection = Schema.Schema.Type<typeof CalendarSettingsCalendarProjectionSchema>
const decodeCalendarSettingsCalendarProjection = Schema.decodeUnknownEffect(CalendarSettingsCalendarProjectionSchema)

const PrimaryCalendarProjectionSchema = Schema.Struct({
  _id: DocId,
  _class: Schema.Literal(calendar.class.PrimaryCalendar),
  space: SpaceId,
  attachedTo: CalendarId
})
type PrimaryCalendarProjection = Schema.Schema.Type<typeof PrimaryCalendarProjectionSchema>
const decodePrimaryCalendarProjection = Schema.decodeUnknownEffect(PrimaryCalendarProjectionSchema)

const invalidCalendarSettingsData = (entity: string, cause: unknown): HulyDataInvalidError =>
  new HulyDataInvalidError({ operation: "calendarSettings", entity, cause })

const isExternalCalendar = (row: HulyCalendar): row is HulyExternalCalendar =>
  row._class === calendar.class.ExternalCalendar

const parseCalendarSettingsRow = Effect.fn("CalendarSettings.parseCalendarRow")(function* (
  row: HulyCalendar
): Effect.fn.Return<CalendarSettingsCalendarProjection, HulyDataInvalidError> {
  const external = isExternalCalendar(row)
  const projection = yield* decodeCalendarSettingsCalendarProjection({
    _id: row._id,
    _class: row._class,
    space: row.space,
    name: row.name,
    hidden: row.hidden,
    visibility: row.visibility,
    user: row.user,
    access: row.access,
    kind: external ? "external" : "internal",
    default: external ? row.default : false
  }).pipe(Effect.mapError((cause) => invalidCalendarSettingsData("calendar", cause)))
  return projection
})

const readCallerCalendars = Effect.fn("CalendarSettings.readCallerCalendars")(function* (
  client: HulyClient["Service"]
): Effect.fn.Return<ReadonlyArray<CalendarSettingsCalendarProjection>, HulyClientError | HulyDataInvalidError> {
  const rows = yield* findCallerCalendars(client)
  return yield* Effect.all(rows.map(parseCalendarSettingsRow))
})

const primaryCalendarPreference = Effect.fn("CalendarSettings.readPrimaryPreference")(function* (
  client: HulyClient["Service"]
): Effect.fn.Return<PrimaryCalendarProjection | undefined, HulyClientError | HulyDataInvalidError> {
  const preference = yield* client.findOne<HulyPrimaryCalendar>(
    calendar.class.PrimaryCalendar,
    hulyQuery<HulyPrimaryCalendar>({})
  )
  if (preference === undefined) return undefined
  return yield* decodePrimaryCalendarProjection(preference).pipe(
    Effect.mapError((cause) => invalidCalendarSettingsData("primary calendar preference", cause))
  )
})

const calendarSettingsSummary = (
  calendarRow: CalendarSettingsCalendarProjection,
  primaryCalendarRef: CalendarId
): CalendarSettingsSummary => ({
  calendarId: calendarRow._id,
  name: calendarRow.name,
  kind: calendarRow.kind,
  hidden: calendarRow.hidden,
  visibility: calendarRow.visibility,
  user: calendarRow.user,
  access: calendarRow.access,
  isPrimary: calendarRow._id === primaryCalendarRef
})

const resolveCallerCalendar = Effect.fn("CalendarSettings.resolveCalendar")(function* (
  calendars: ReadonlyArray<CalendarSettingsCalendarProjection>,
  target: CalendarSettingsTarget
): Effect.fn.Return<
  CalendarSettingsCalendarProjection,
  CalendarSettingsTargetNotAccessibleError | CalendarSettingsIdentifierAmbiguousError
> {
  const matches =
    "calendarId" in target
      ? calendars.filter((calendarRow) => calendarRow._id === target.calendarId)
      : calendars.filter((calendarRow) => calendarRow.name === target.calendarName)
  if (matches.length === 0) return yield* new CalendarSettingsTargetNotAccessibleError({ target })
  if (matches.length > 1) {
    if ("calendarId" in target) return yield* new CalendarSettingsTargetNotAccessibleError({ target })
    return yield* new CalendarSettingsIdentifierAmbiguousError({
      calendarName: target.calendarName,
      matches: Count.make(matches.length)
    })
  }
  const [match] = matches
  if (match === undefined) return yield* new CalendarSettingsTargetNotAccessibleError({ target })
  return match
})

const targetCalendarId = (calendarRow: CalendarSettingsCalendarProjection): CalendarId => calendarRow._id

const ensureWritable = Effect.fn("CalendarSettings.ensureWritable")(function* (
  calendarRow: CalendarSettingsCalendarProjection
): Effect.fn.Return<void, CalendarSettingsTargetNotWritableError> {
  const writableAccess = calendarRow.access === "writer" || calendarRow.access === "owner"
  if (!writableAccess) {
    return yield* new CalendarSettingsTargetNotWritableError({
      calendarId: targetCalendarId(calendarRow),
      reason: "insufficient-access"
    })
  }
})

const ensureWritableVisible = Effect.fn("CalendarSettings.ensureWritableVisible")(function* (
  calendarRow: CalendarSettingsCalendarProjection
): Effect.fn.Return<void, CalendarSettingsTargetNotWritableError> {
  if (calendarRow.hidden) {
    return yield* new CalendarSettingsTargetNotWritableError({
      calendarId: targetCalendarId(calendarRow),
      reason: "hidden-primary"
    })
  }
  yield* ensureWritable(calendarRow)
})

const ensureExternalForHiddenSetting = Effect.fn("CalendarSettings.ensureExternalForHiddenSetting")(function* (
  calendarRow: CalendarSettingsCalendarProjection,
  hidden: boolean | undefined
): Effect.fn.Return<void, CalendarSettingsInternalCalendarHideError> {
  if (hidden !== undefined && calendarRow.kind !== "external") {
    return yield* new CalendarSettingsInternalCalendarHideError({ calendarId: targetCalendarId(calendarRow) })
  }
})

export const listCalendarSettings = Effect.fn("CalendarSettings.list")(function* (
  _params: ListCalendarSettingsParams
): Effect.fn.Return<ListCalendarSettingsResult, HulyClientError | HulyDataInvalidError, HulyClient> {
  const client = yield* HulyClient
  const parsedCalendars = yield* readCallerCalendars(client)
  const preference = yield* primaryCalendarPreference(client)
  const primaryCalendarRef = selectPrimaryCalendar(parsedCalendars, preference, client.getAccountUuid())
  return parsedCalendars.map((projection) => calendarSettingsSummary(projection, primaryCalendarRef))
})

export const setPrimaryCalendar = Effect.fn("CalendarSettings.setPrimary")(function* (
  params: SetPrimaryCalendarParams
): Effect.fn.Return<SetPrimaryCalendarResult, SetPrimaryCalendarError, HulyClient> {
  const client = yield* HulyClient
  const calendars = yield* readCallerCalendars(client)
  const calendarRow = yield* resolveCallerCalendar(calendars, params)
  yield* ensureWritableVisible(calendarRow)

  const preference = yield* primaryCalendarPreference(client)
  const calendarId = targetCalendarId(calendarRow)
  if (preference === undefined) {
    yield* client.createDoc(calendar.class.PrimaryCalendar, core.space.Workspace, {
      attachedTo: toRef<HulyCalendar>(calendarId)
    })
    return { calendarId, action: "created", created: true, updated: false }
  }

  if (preference.attachedTo === calendarId) {
    return { calendarId, action: "unchanged", created: false, updated: false }
  }

  yield* client.updateDoc(
    calendar.class.PrimaryCalendar,
    toRef<Space>(preference.space),
    toRef<HulyPrimaryCalendar>(preference._id),
    { attachedTo: toRef<HulyCalendar>(calendarId) }
  )
  return { calendarId, action: "updated", created: false, updated: true }
})

export const updateCalendarSettings = Effect.fn("CalendarSettings.update")(function* (
  params: UpdateCalendarSettingsParams
): Effect.fn.Return<UpdateCalendarSettingsResult, UpdateCalendarSettingsError, HulyClient> {
  const client = yield* HulyClient
  const calendars = yield* readCallerCalendars(client)
  const calendarRow = yield* resolveCallerCalendar(calendars, params)
  yield* ensureExternalForHiddenSetting(calendarRow, params.hidden)
  yield* ensureWritable(calendarRow)

  const update: DocumentUpdate<HulyCalendar> = {
    ...(params.visibility === undefined ? {} : { visibility: params.visibility }),
    ...(params.hidden === undefined ? {} : { hidden: params.hidden })
  }
  yield* client.updateDoc(
    toClassRef<HulyCalendar>(calendarRow._class),
    toRef<Space>(calendarRow.space),
    toRef<HulyCalendar>(calendarRow._id),
    update
  )

  return { calendarId: targetCalendarId(calendarRow), updated: true }
})
