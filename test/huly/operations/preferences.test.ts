import { describe, it } from "@effect/vitest"
import type { Class, Doc, DocumentQuery, FindOptions, PersonId, Ref, Space, SpaceType } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { SpacePreference as HulySpacePreference } from "@hcengineering/preference"
import { Effect, Exit } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import { SpaceClassFilter, SpaceIdentifier, SpaceTypeId } from "../../../src/domain/schemas/shared.js"
import { SpacePreferenceMetadataDegradedWarningCode } from "../../../src/domain/schemas/tool-warnings.js"
import type { ToolWarning } from "../../../src/domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { core, preference } from "../../../src/huly/huly-plugins.js"
import { getSpacePreference, listSpacePreferences } from "../../../src/huly/operations/preferences.js"
import { toAccountUuid, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import type { GenericSpace } from "../../../src/huly/operations/spaces-shared.js"
import { corePersonId } from "../../helpers/huly-sdk.js"

type QueryRecord = Readonly<Record<string, unknown>>
type DocRecord = Readonly<Record<string, unknown>>

interface CapturedFindAll {
  readonly classId: string
  readonly query: QueryRecord
  readonly options: FindOptions<Doc> | undefined
}

interface FixtureConfig {
  readonly spaces?: ReadonlyArray<GenericSpace>
  readonly preferences?: ReadonlyArray<HulySpacePreference>
  readonly captures?: Array<CapturedFindAll>
}

const personId: PersonId = corePersonId("person-social-1")
const accountUuid = toAccountUuid("00000000-0000-4000-8000-000000000001")
const spaceIdentifier = (value: string) => SpaceIdentifier.make(value)

const exitCauseText = <A, E>(exit: Exit.Exit<A, E>): string => {
  if (Exit.isSuccess(exit)) throw new Error("Expected effect to fail")
  return exit.cause.toString()
}

const recordFromPort = (value: unknown): QueryRecord => {
  // Huly SDK query/doc payloads are plain objects at runtime; tests inspect them at the fake-client boundary.

  return value as QueryRecord
}

const docRecord = (doc: Doc): DocRecord => {
  // Huly docs are plain objects in these fixtures, and the fake client indexes fields by query keys.
  // eslint-disable-next-line no-restricted-syntax -- test-only structural query/doc matcher
  return doc as unknown as DocRecord
}

const hasInOperator = (value: unknown): value is { readonly $in: ReadonlyArray<unknown> } =>
  typeof value === "object" && value !== null && "$in" in value && Array.isArray(value.$in)

const matchesQuery = (doc: Doc, query: QueryRecord): boolean => {
  const source = docRecord(doc)
  return Object.entries(query).every(([key, expected]) =>
    hasInOperator(expected) ? expected.$in.includes(source[key]) : source[key] === expected
  )
}

const makeSpace = (overrides: Partial<GenericSpace> = {}): GenericSpace => ({
  _id: toRef<Space>("space-1"),
  _class: core.class.Space,
  space: core.space.Space,
  modifiedBy: personId,
  modifiedOn: 0,
  createdBy: personId,
  createdOn: 0,
  name: "General",
  description: "Default space",
  private: false,
  members: [accountUuid],
  owners: [],
  archived: false,
  ...overrides
})

const makePreference = (overrides: Partial<HulySpacePreference> = {}): HulySpacePreference => ({
  _id: toRef<HulySpacePreference>("pref-1"),
  _class: preference.class.SpacePreference,
  space: core.space.Workspace,
  modifiedBy: personId,
  modifiedOn: 10,
  createdBy: personId,
  createdOn: 5,
  attachedTo: toRef<Space>("space-1"),
  ...overrides
})

const docsForClass = (
  classId: unknown,
  spaces: ReadonlyArray<GenericSpace>,
  preferences: ReadonlyArray<HulySpacePreference>
): ReadonlyArray<Doc> => {
  if (classId === core.class.Space) return spaces
  if (classId === preference.class.SpacePreference) return preferences
  return []
}

const testLayer = (config: FixtureConfig = {}) => {
  const spaces = config.spaces ?? [makeSpace()]
  const preferences = config.preferences ?? [makePreference()]

  const findAll: HulyClientOperations["findAll"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    query: DocumentQuery<T>,
    options?: FindOptions<T>
  ) => {
    const queryRecord = recordFromPort(query)
    config.captures?.push({
      classId: String(classId),
      query: queryRecord,
      // The fake stores only read-only FindOptions fields for assertions; it never invokes or mutates option payloads.
      // Re-typing the generic SDK options to Doc options keeps the capture collection class-agnostic.
      options: options as FindOptions<Doc> | undefined
    })
    const matched = docsForClass(classId, spaces, preferences).filter((doc) => matchesQuery(doc, queryRecord))
    const limited = options?.limit === undefined ? matched : matched.slice(0, options.limit)

    // docsForClass branches on the same classId that defines T, but Ref<Class<T>> branding is erased at runtime.
    // The cast is limited to this test port after the classId branch selects the matching fixture array.
    return Effect.succeed(toFindResult(limited as Array<T>, matched.length))
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] = (<T extends Doc>(
    classId: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    const matched = docsForClass(classId, spaces, preferences).find((doc) => matchesQuery(doc, recordFromPort(query)))

    // docsForClass branches on the same classId that defines T, but Ref<Class<T>> branding is erased at runtime.
    // The cast is limited to this test port after the classId branch selects the matching fixture array.
    return Effect.succeed(matched as T | undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({ findAll, findOne })
}

const withWarnings = <A, E, R>(
  effect: Effect.Effect<A, E, R | Diagnostics>
): Effect.Effect<{ readonly value: A; readonly warnings: ReadonlyArray<ToolWarning> }, E, R> =>
  Effect.gen(function*() {
    const diagnostics = yield* makeDiagnosticsScope
    const value = yield* effect.pipe(Effect.provideService(Diagnostics, diagnostics.service))
    const warnings = yield* diagnostics.drainWarnings
    return { value, warnings }
  })

describe("space preference operations", () => {
  it.effect("lists SpacePreference rows with attached space summaries", () =>
    Effect.gen(function*() {
      const secondSpace = makeSpace({ _id: toRef<Space>("space-2"), name: "Design" })
      const secondPreference = makePreference({
        _id: toRef<HulySpacePreference>("pref-2"),
        attachedTo: toRef<Space>("space-2")
      })

      const { value, warnings } = yield* listSpacePreferences({ limit: 10 }).pipe(
        withWarnings,
        Effect.provide(
          testLayer({ spaces: [makeSpace(), secondSpace], preferences: [makePreference(), secondPreference] })
        )
      )

      expect(warnings).toEqual([])
      expect(value.total).toBe(2)
      expect(value.preferences.map((item) => item.preferenceId)).toEqual(["pref-1", "pref-2"])
      expect(value.preferences.map((item) => item.attachedSpace?.name)).toEqual(["General", "Design"])
    }))

  it.effect("filters listSpacePreferences by resolved space name", () =>
    Effect.gen(function*() {
      const captures: Array<CapturedFindAll> = []
      const typedSpace = makeSpace({ type: toRef<SpaceType>("space-type-1") })
      const otherPreference = makePreference({
        _id: toRef<HulySpacePreference>("pref-2"),
        attachedTo: toRef<Space>("space-2")
      })

      const { value } = yield* listSpacePreferences({
        space: spaceIdentifier("General"),
        includeArchived: true,
        class: SpaceClassFilter.make(core.class.Space),
        type: SpaceTypeId.make("space-type-1")
      }).pipe(
        withWarnings,
        Effect.provide(testLayer({ captures, spaces: [typedSpace], preferences: [makePreference(), otherPreference] }))
      )

      expect(value.preferences.map((item) => item.preferenceId)).toEqual(["pref-1"])
      const preferenceQuery = captures.find((capture) => capture.classId === preference.class.SpacePreference)?.query
      expect(preferenceQuery).toMatchObject({ attachedTo: "space-1" })
    }))

  it.effect("filters listSpacePreferences with default space resolver options", () =>
    Effect.gen(function*() {
      const { value, warnings } = yield* listSpacePreferences({ space: spaceIdentifier("General") }).pipe(
        withWarnings,
        Effect.provide(testLayer())
      )

      expect(warnings).toEqual([])
      expect(value.preferences.map((item) => item.preferenceId)).toEqual(["pref-1"])
    }))

  it.effect("returns present=false when a resolved space has no SpacePreference row", () =>
    Effect.gen(function*() {
      const result = yield* getSpacePreference({ space: spaceIdentifier("General") }).pipe(
        Effect.provide(testLayer({ preferences: [] }))
      )

      expect(result).toMatchObject({
        present: false,
        attachedTo: "space-1",
        attachedSpace: { id: "space-1", name: "General" }
      })
    }))

  it.effect("returns present=true when a resolved space has a SpacePreference row", () =>
    Effect.gen(function*() {
      const result = yield* getSpacePreference({ space: spaceIdentifier("General") }).pipe(
        Effect.provide(testLayer())
      )

      expect(result).toMatchObject({
        present: true,
        preference: {
          preferenceId: "pref-1",
          attachedTo: "space-1",
          attachedSpace: { id: "space-1", name: "General" }
        }
      })
    }))

  it.effect("lists an empty SpacePreference result without metadata warnings", () =>
    Effect.gen(function*() {
      const captures: Array<CapturedFindAll> = []
      const { value, warnings } = yield* listSpacePreferences({}).pipe(
        withWarnings,
        Effect.provide(testLayer({ captures, preferences: [] }))
      )

      expect(value).toEqual({ preferences: [], total: 0 })
      expect(warnings).toEqual([])
      expect(captures.filter((capture) => capture.classId === core.class.Space)).toEqual([])
    }))

  it.effect("fails getSpacePreference when the target space cannot be resolved", () =>
    Effect.gen(function*() {
      const exit = yield* getSpacePreference({ space: spaceIdentifier("Missing") }).pipe(
        Effect.provide(testLayer({ spaces: [], preferences: [] })),
        Effect.exit
      )

      expect(exitCauseText(exit)).toContain("SpaceNotFoundError")
    }))

  it.effect("warns when listSpacePreferences cannot hydrate attached space metadata", () =>
    Effect.gen(function*() {
      const missingPreference = makePreference({ attachedTo: toRef<Space>("missing-space") })
      const { value, warnings } = yield* listSpacePreferences({}).pipe(
        withWarnings,
        Effect.provide(testLayer({ spaces: [], preferences: [missingPreference] }))
      )

      expect(assertAt(warnings, 0).code).toBe(SpacePreferenceMetadataDegradedWarningCode)
      const firstPreference = assertAt(value.preferences, 0)
      expect(firstPreference.attachedTo).toBe("missing-space")
      expect("attachedSpace" in firstPreference).toBe(false)
    }))
})
