import { describe, it } from "@effect/vitest"
import {
  AccessLevel,
  type Calendar as HulyCalendar,
  type ExternalCalendar as HulyExternalCalendar,
  type PrimaryCalendar as HulyPrimaryCalendar
} from "@hcengineering/calendar"
import type { Class, Data, Doc, DocumentQuery, DocumentUpdate, FindOptions, Ref, Space } from "@hcengineering/core"
import { Effect, Exit, Result, Schema } from "effect"
import { expect } from "vitest"

import {
  SetPrimaryCalendarParamsSchema,
  UpdateCalendarSettingsParamsSchema
} from "../../../src/domain/schemas/calendar-settings.js"
import { CalendarId, DocId } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { calendar, core } from "../../../src/huly/huly-plugins.js"
import {
  listCalendarSettings,
  setPrimaryCalendar,
  updateCalendarSettings
} from "../../../src/huly/operations/calendar-settings.js"
import { toCorePersonId, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { CalendarName } from "../../../src/domain/schemas/calendar.js"
import { SocialIdentityId } from "../../../src/domain/schemas/person-administration.js"
import { findResultForTestClass, documentForTestClass } from "../../helpers/huly-sdk.js"

const makeCalendar = (id: string, user: string, overrides: Partial<HulyCalendar> = {}): HulyCalendar => {
  const calendarId = CalendarId.make(id)
  const socialIdentityId = SocialIdentityId.make(user)
  return {
    _id: toRef<HulyCalendar>(calendarId),
    _class: calendar.class.Calendar,
    space: calendar.space.Calendar,
    name: "Calendar",
    hidden: false,
    visibility: "private",
    user: toCorePersonId(socialIdentityId),
    access: AccessLevel.Owner,
    modifiedBy: toCorePersonId(SocialIdentityId.make("user")),
    modifiedOn: 0,
    createdBy: toCorePersonId(socialIdentityId),
    createdOn: 0,
    ...overrides
  }
}

const makeExternalCalendar = (
  id: string,
  user: string,
  overrides: Partial<HulyCalendar> & { readonly default?: boolean } = {}
): HulyExternalCalendar => {
  const calendarId = CalendarId.make(id)
  const socialIdentityId = SocialIdentityId.make(user)
  const calendarUser = overrides.user ?? toCorePersonId(socialIdentityId)
  return {
    _id: toRef<HulyExternalCalendar>(calendarId),
    _class: calendar.class.ExternalCalendar,
    space: calendar.space.Calendar,
    name: overrides.name ?? "Calendar",
    hidden: overrides.hidden ?? false,
    visibility: overrides.visibility ?? "private",
    user: calendarUser,
    access: overrides.access ?? AccessLevel.Owner,
    modifiedBy: toCorePersonId(SocialIdentityId.make("user")),
    modifiedOn: 0,
    createdBy: toCorePersonId(socialIdentityId),
    createdOn: 0,
    default: overrides.default ?? false,
    externalId: `external-${id}`,
    externalUser: user
  }
}

const makePrimary = (attachedTo: Ref<HulyCalendar>): HulyPrimaryCalendar => ({
  _id: toRef<HulyPrimaryCalendar>(DocId.make("primary-preference")),
  _class: calendar.class.PrimaryCalendar,
  space: core.space.Workspace,
  attachedTo,
  modifiedBy: toCorePersonId(SocialIdentityId.make("user")),
  modifiedOn: 0,
  createdBy: toCorePersonId(SocialIdentityId.make("primary")),
  createdOn: 0
})

interface HarnessState {
  readonly calendars: Array<HulyCalendar>
  preference: HulyPrimaryCalendar | undefined
  created: number
  readonly updates: Array<Record<string, unknown>>
  readonly queries: Array<Record<string, unknown>>
}

interface HarnessOptions {
  readonly calendars: ReadonlyArray<HulyCalendar>
  readonly preference?: HulyPrimaryCalendar
  readonly socialIds?: ReadonlyArray<string>
}

const QueryRecordSchema = Schema.Record(Schema.String, Schema.Unknown)
const queryRecord = <T extends Doc>(query: DocumentQuery<T>): Record<string, unknown> =>
  Schema.decodeUnknownSync(QueryRecordSchema)(query)

const comparable = (value: unknown): string => (typeof value === "string" ? value : (JSON.stringify(value) ?? ""))

const matchesUser = (calendarRow: HulyCalendar, query: Record<string, unknown>): boolean => {
  const user = query.user
  if (user === undefined) return true
  const userFilter = Schema.decodeUnknownResult(Schema.Struct({ $in: Schema.Array(Schema.Unknown) }))(user)
  if (Result.isSuccess(userFilter)) {
    return userFilter.success.$in.some((id) => String(id) === String(calendarRow.user))
  }
  return comparable(user) === comparable(calendarRow.user)
}

const harness = (options: HarnessOptions) => {
  const primary = toCorePersonId(SocialIdentityId.make("primary"))
  const socialIds = (options.socialIds ?? ["primary", "secondary"]).map((id) =>
    toCorePersonId(SocialIdentityId.make(id))
  )
  const state: HarnessState = {
    calendars: [...options.calendars],
    preference: options.preference,
    created: 0,
    updates: [],
    queries: []
  }

  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    classId: Ref<Class<T>>,
    query: DocumentQuery<T>,
    _options?: FindOptions<T>
  ) => {
    if (classId !== calendar.class.Calendar) return Effect.succeed(findResultForTestClass<T>([]))
    const queryObject = queryRecord(query)
    state.queries.push(queryObject)
    const matches = state.calendars.filter((calendarRow) => matchesUser(calendarRow, queryObject))
    // The test layer only serves Calendar rows, while the production port is generic over all Doc types.
    // eslint-disable-next-line no-restricted-syntax -- explicit DI boundary: the generic Huly client port serves Calendar fixtures only.
    return Effect.succeed(findResultForTestClass<T>(matches))
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(classId: Ref<Class<T>>) => {
    if (classId === calendar.class.PrimaryCalendar) return Effect.succeed(documentForTestClass<T>(state.preference))
    return Effect.succeed(undefined)
  }

  const createDoc: HulyClientOperations["createDoc"] = <T extends Doc>(
    classId: Ref<Class<T>>,
    _space: Ref<Space>,
    _attributes: Data<T>
  ) => {
    if (classId === calendar.class.PrimaryCalendar) {
      state.created += 1
    }
    return Effect.succeed(toRef<T>(DocId.make("created-document")))
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    classId: Ref<Class<T>>,
    _space: Ref<Space>,
    _objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    const update = Object.fromEntries(Object.entries(operations))
    state.updates.push(update)
    return Effect.succeed({})
  }

  const layer = HulyClient.testLayer({
    getPrimarySocialId: () => primary,
    getSocialIds: () => socialIds,
    findAll,
    findOne,
    createDoc,
    updateDoc
  })
  return { layer, state }
}

describe("caller-scoped calendar settings", () => {
  it.effect("lists all caller-owned rows and computes the valid primary fallback", () => {
    const internal = makeCalendar("internal", "primary", { name: "Personal" })
    const provider = makeExternalCalendar("provider", "secondary", {
      name: "Provider",
      visibility: "public",
      default: true
    })
    const hidden = makeExternalCalendar("hidden", "secondary", { name: "Hidden", hidden: true })
    const readOnly = makeExternalCalendar("read-only", "primary", {
      name: "Read only",
      access: AccessLevel.Reader,
      default: true
    })
    const foreign = makeExternalCalendar("foreign", "other", { default: true })
    const test = harness({
      calendars: [internal, provider, hidden, readOnly, foreign],
      preference: makePrimary(foreign._id)
    })

    return Effect.gen(function* () {
      const rows = yield* listCalendarSettings({}).pipe(Effect.provide(test.layer))
      expect(rows).toHaveLength(4)
      expect(rows.map((row) => row.calendarId)).toEqual(["internal", "provider", "hidden", "read-only"])
      expect(rows.find((row) => row.calendarId === "foreign")).toBeUndefined()
      expect(rows.find((row) => row.calendarId === "hidden")).toMatchObject({
        kind: "external",
        hidden: true,
        access: "owner",
        isPrimary: false
      })
      expect(rows.find((row) => row.calendarId === "read-only")).toMatchObject({ access: "reader" })
      expect(rows.find((row) => row.calendarId === "provider")).toMatchObject({
        kind: "external",
        visibility: "public",
        isPrimary: true
      })
      expect(rows.find((row) => row.calendarId === "internal")).toMatchObject({ kind: "internal" })
      expect(test.state.queries[0]?.user).toMatchObject({ $in: expect.any(Array) })
    })
  })

  it.effect("uses the account-backed internal fallback when no eligible provider remains", () => {
    const internalId = "00000000-0000-4000-8000-000000000000_calendar"
    const internal = makeCalendar(internalId, "primary", { name: "Personal" })
    const hiddenProvider = makeExternalCalendar("hidden-provider", "primary", { hidden: true, default: true })
    const readOnlyProvider = makeExternalCalendar("read-only-provider", "primary", {
      access: AccessLevel.Reader,
      default: true
    })
    const test = harness({ calendars: [internal, hiddenProvider, readOnlyProvider] })

    return Effect.gen(function* () {
      const rows = yield* listCalendarSettings({}).pipe(Effect.provide(test.layer))
      expect(rows.find((row) => row.calendarId === internalId)?.isPrimary).toBe(true)
    })
  })

  it.effect("creates, replaces, and leaves an unchanged primary preference", () => {
    const first = makeCalendar("first", "primary", { name: "First" })
    const second = makeCalendar("second", "primary", { name: "Second" })

    return Effect.gen(function* () {
      const createTest = harness({ calendars: [first, second] })
      expect(
        yield* setPrimaryCalendar({ calendarName: CalendarName.make("First") }).pipe(Effect.provide(createTest.layer))
      ).toEqual({ calendarId: "first", action: "created", created: true, updated: false })
      expect(createTest.state.created).toBe(1)

      const replaceTest = harness({ calendars: [first, second], preference: makePrimary(first._id) })
      expect(
        yield* setPrimaryCalendar({ calendarId: CalendarId.make("second") }).pipe(Effect.provide(replaceTest.layer))
      ).toEqual({ calendarId: "second", action: "updated", created: false, updated: true })
      expect(replaceTest.state.updates).toEqual([{ attachedTo: second._id }])

      const unchangedTest = harness({ calendars: [first, second], preference: makePrimary(first._id) })
      expect(
        yield* setPrimaryCalendar({ calendarId: CalendarId.make("first") }).pipe(Effect.provide(unchangedTest.layer))
      ).toEqual({ calendarId: "first", action: "unchanged", created: false, updated: false })
      expect(unchangedTest.state.updates).toHaveLength(0)
    })
  })

  it.effect("updates settings while allowing an external calendar to be unhidden", () => {
    const external = makeExternalCalendar("external", "primary", { hidden: true })
    const internal = makeCalendar("internal", "primary", { name: "Internal" })
    const test = harness({ calendars: [external, internal] })

    return Effect.gen(function* () {
      expect(
        yield* updateCalendarSettings({ calendarId: CalendarId.make("external"), hidden: false }).pipe(
          Effect.provide(test.layer)
        )
      ).toEqual({ calendarId: "external", updated: true })
      expect(test.state.updates[0]).toEqual({ hidden: false })
      expect(
        yield* updateCalendarSettings({ calendarName: CalendarName.make("Internal"), visibility: "public" }).pipe(
          Effect.provide(test.layer)
        )
      ).toEqual({ calendarId: "internal", updated: true })
      expect(test.state.updates[1]).toEqual({ visibility: "public" })
    })
  })

  it.effect("rejects ambiguous, cross-user, hidden, read-only, and internal-hidden mutations", () => {
    const duplicateA = makeCalendar("duplicate-a", "primary", { name: "Duplicate" })
    const duplicateB = makeCalendar("duplicate-b", "primary", { name: "Duplicate" })
    const duplicateIdA = makeCalendar("duplicate-id", "primary", { name: "Duplicate ID A" })
    const duplicateIdB = makeCalendar("duplicate-id", "primary", { name: "Duplicate ID B" })
    const hidden = makeExternalCalendar("hidden", "primary", { hidden: true })
    const readOnly = makeCalendar("read-only", "primary", { access: AccessLevel.Reader })
    const internal = makeCalendar("internal", "primary")
    const foreign = makeExternalCalendar("foreign", "other")
    const test = harness({
      calendars: [duplicateA, duplicateB, duplicateIdA, duplicateIdB, hidden, readOnly, internal, foreign]
    })

    return Effect.gen(function* () {
      const ambiguous = yield* Effect.exit(
        setPrimaryCalendar({ calendarName: CalendarName.make("Duplicate") }).pipe(Effect.provide(test.layer))
      )
      expect(Exit.isFailure(ambiguous)).toBe(true)

      const duplicateId = yield* Effect.flip(
        setPrimaryCalendar({ calendarId: CalendarId.make("duplicate-id") }).pipe(Effect.provide(test.layer))
      )
      expect(duplicateId).toMatchObject({ _tag: "CalendarSettingsTargetNotAccessibleError" })

      const crossUser = yield* Effect.flip(
        setPrimaryCalendar({ calendarId: CalendarId.make("foreign") }).pipe(Effect.provide(test.layer))
      )
      expect(crossUser).toMatchObject({ _tag: "CalendarSettingsTargetNotAccessibleError" })

      const crossUserUpdate = yield* Effect.flip(
        updateCalendarSettings({ calendarId: CalendarId.make("foreign"), visibility: "public" }).pipe(
          Effect.provide(test.layer)
        )
      )
      expect(crossUserUpdate).toMatchObject({ _tag: "CalendarSettingsTargetNotAccessibleError" })

      const hiddenPrimary = yield* Effect.flip(
        setPrimaryCalendar({ calendarId: CalendarId.make("hidden") }).pipe(Effect.provide(test.layer))
      )
      expect(hiddenPrimary).toMatchObject({ _tag: "CalendarSettingsTargetNotWritableError", reason: "hidden-primary" })

      const readOnlyUpdate = yield* Effect.flip(
        updateCalendarSettings({ calendarId: CalendarId.make("read-only"), visibility: "public" }).pipe(
          Effect.provide(test.layer)
        )
      )
      expect(readOnlyUpdate).toMatchObject({
        _tag: "CalendarSettingsTargetNotWritableError",
        reason: "insufficient-access"
      })

      const internalHidden = yield* Effect.flip(
        updateCalendarSettings({ calendarId: CalendarId.make("internal"), hidden: true }).pipe(
          Effect.provide(test.layer)
        )
      )
      expect(internalHidden).toMatchObject({ _tag: "CalendarSettingsInternalCalendarHideError" })
      expect(test.state.created).toBe(0)
      expect(test.state.updates).toHaveLength(0)
    })
  })

  it("requires one target and rejects provider-owned update fields at the parser boundary", () => {
    expect(Schema.decodeUnknownResult(SetPrimaryCalendarParamsSchema)({})).toMatchObject({ _tag: "Failure" })
    expect(
      Schema.decodeUnknownResult(SetPrimaryCalendarParamsSchema)({ calendarId: "a", calendarName: "A" })
    ).toMatchObject({ _tag: "Failure" })
    expect(
      Schema.decodeUnknownResult(UpdateCalendarSettingsParamsSchema, { onExcessProperty: "error" })({
        calendarId: "a",
        visibility: "private",
        default: true
      })
    ).toMatchObject({ _tag: "Failure" })
  })
})
