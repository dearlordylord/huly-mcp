/* eslint-disable no-restricted-syntax -- Published Huly fixtures require erased nominal-ref bridges and opaque Resource<Component> handles; the generic client port casts preserve those declaration-verified runtime strings. */
import { describe, it } from "@effect/vitest"
import type { Class, Doc, PersonId, Ref, Space } from "@hcengineering/core"
import { AccountRole, toFindResult } from "@hcengineering/core"
import type { IntlString } from "@hcengineering/platform"
import type { AnyComponent } from "@hcengineering/ui"
import type { Application, ApplicationNavModel, HiddenApplication } from "@hcengineering/workbench"
import { Effect, Schema } from "effect"
import { expect } from "vitest"

import {
  ListWorkbenchApplicationsParamsSchema,
  ListWorkbenchApplicationsResultSchema,
  WorkbenchApplicationAlias,
  WorkbenchApplicationId
} from "../../../src/domain/schemas/workbench.js"
import { DocId, NonEmptyString, ObjectClassName } from "../../../src/domain/schemas/shared.js"
import type { ToolWarning } from "../../../src/domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics, makeDiagnosticsScope } from "../../../src/huly/diagnostics.js"
import { core, workbench } from "../../../src/huly/huly-plugins.js"
import { listWorkbenchApplications } from "../../../src/huly/operations/workbench.js"
import { toClassRef, toRef } from "../../../src/huly/operations/sdk-boundary.js"
import { workbenchTools } from "../../../src/mcp/tools/workbench.js"

const caller = "caller-social-id" as PersonId
// IntlString and AnyComponent are erased platform resource identifiers represented by strings at runtime.
const intl = (value: NonEmptyString): IntlString => value as IntlString
const trackerAllComponent = "tracker:component:All" as AnyComponent
const workbenchAppIcon = "workbench:icon:App" as Application["icon"]
const docBase = <T extends Doc>(_id: Ref<T>, _class: Ref<Class<T>>, space: Ref<Space>) => ({
  _id,
  _class,
  space,
  modifiedOn: 1,
  modifiedBy: caller
})

const application = (
  id: WorkbenchApplicationId,
  alias: WorkbenchApplicationAlias,
  overrides: Partial<Application> = {}
): Application => ({
  ...docBase(toRef<Application>(id), workbench.class.Application, core.space.Model),
  alias,
  label: intl(NonEmptyString.make(`workbench:string:${alias}`)),
  icon: workbenchAppIcon,
  hidden: false,
  order: 2,
  navigatorModel: {
    spaces: [
      {
        id: "projects",
        label: intl(NonEmptyString.make("tracker:string:Projects")),
        spaceClass: toClassRef<Space>(ObjectClassName.make("tracker:class:Project"))
      }
    ],
    specials: [
      {
        id: "all",
        label: intl(NonEmptyString.make("tracker:string:All")),
        component: trackerAllComponent,
        position: "top"
      }
    ]
  },
  ...overrides
})

const navExtensionBase = (): ApplicationNavModel => ({
  ...docBase(toRef<ApplicationNavModel>(DocId.make("nav-1")), workbench.class.ApplicationNavModel, core.space.Model),
  extends: toRef<Application>(WorkbenchApplicationId.make("app-tracker"))
})

const navExtension = () => ({
  ...navExtensionBase(),
  groups: [
    {
      id: "types",
      label: intl(NonEmptyString.make("tracker:string:Types")),
      groupByClass: toClassRef<Doc>(ObjectClassName.make("task:class:TaskType"))
    }
  ]
})

const hiddenPreference = (): HiddenApplication => ({
  ...docBase(toRef<HiddenApplication>(DocId.make("hidden-1")), workbench.class.HiddenApplication, core.space.Workspace),
  attachedTo: toRef<Application>(WorkbenchApplicationId.make("app-tracker")),
  createdBy: caller,
  createdOn: 1
})

interface Fixture {
  readonly applications: ReadonlyArray<Doc>
  readonly navigation?: ReadonlyArray<Doc>
  readonly hidden?: ReadonlyArray<Doc>
  readonly queries: Array<{ readonly classRef: string; readonly query: unknown }>
}

const layer = (fixture: Fixture) => {
  const findAllInModel = ((classRef: unknown, query: unknown) => {
    fixture.queries.push({ classRef: String(classRef), query })
    const source: ReadonlyArray<Doc> =
      String(classRef) === String(workbench.class.Application) ? fixture.applications : (fixture.navigation ?? [])
    return Effect.succeed(toFindResult(Array.from(source)))
  }) as HulyClientOperations["findAllInModel"]
  const findAll = ((classRef: unknown, query: unknown) => {
    fixture.queries.push({ classRef: String(classRef), query })
    return Effect.succeed(toFindResult(Array.from(fixture.hidden ?? [])))
  }) as HulyClientOperations["findAll"]
  return HulyClient.testLayer({ findAll, findAllInModel, getPrimarySocialId: () => caller })
}

const run = (fixture: Fixture, params: unknown = {}) =>
  Effect.gen(function* () {
    const diagnostics = yield* makeDiagnosticsScope
    return yield* listWorkbenchApplications(
      Schema.decodeUnknownSync(ListWorkbenchApplicationsParamsSchema)(params)
    ).pipe(Effect.provide(layer(fixture)), Effect.provideService(Diagnostics, diagnostics.service))
  })

const runWithWarnings = (fixture: Fixture, params: unknown = {}) =>
  Effect.gen(function* () {
    const diagnostics = yield* makeDiagnosticsScope
    const result = yield* listWorkbenchApplications(
      Schema.decodeUnknownSync(ListWorkbenchApplicationsParamsSchema)(params)
    ).pipe(Effect.provide(layer(fixture)), Effect.provideService(Diagnostics, diagnostics.service))
    const warnings: ReadonlyArray<ToolWarning> = yield* diagnostics.drainWarnings
    return { result, warnings }
  })

describe("listWorkbenchApplications", () => {
  it("loads the exact published Workbench class references and LLM-first contract", () => {
    expect(String(workbench.class.Application)).toBe("workbench:class:Application")
    expect(String(workbench.class.HiddenApplication)).toBe("workbench:class:HiddenApplication")
    expect(workbenchTools[0]?.description).toContain("model declarations")
    expect(workbenchTools[0]?.description).toContain("not proof")
  })

  it("rejects simultaneous exact and substring aliases", () => {
    expect(
      Schema.decodeUnknownEither(ListWorkbenchApplicationsParamsSchema)({ alias: "tracker", aliasSearch: "track" })._tag
    ).toBe("Left")
  })

  it.effect("returns typed application navigation and caller-only hidden preference", () =>
    Effect.gen(function* () {
      const fixture: Fixture = {
        applications: [
          application(WorkbenchApplicationId.make("app-tracker"), WorkbenchApplicationAlias.make("tracker"))
        ],
        navigation: [navExtension()],
        hidden: [hiddenPreference()],
        queries: []
      }
      const result = yield* run(fixture)
      expect(result.applications[0]).toEqual({
        id: "app-tracker",
        alias: "tracker",
        labelId: "workbench:string:tracker",
        hidden: false,
        hiddenByPreference: true,
        order: 2,
        navigation: {
          spaces: [{ id: "projects", labelId: "tracker:string:Projects", spaceClass: "tracker:class:Project" }],
          specials: [{ id: "all", labelId: "tracker:string:All", position: "top" }],
          groups: [{ id: "types", labelId: "tracker:string:Types", groupByClass: "task:class:TaskType" }]
        }
      })
      expect(result.total).toBe(1)
      expect(fixture.queries.at(-1)?.query).toEqual({
        attachedTo: { $in: ["app-tracker"] },
        space: core.space.Workspace,
        createdBy: caller
      })
      expect(Schema.decodeUnknownEither(ListWorkbenchApplicationsResultSchema)(result)._tag).toBe("Right")
    })
  )

  it.effect("rejects duplicate exact aliases instead of choosing the first declaration", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        run(
          {
            applications: [
              application(WorkbenchApplicationId.make("app-1"), WorkbenchApplicationAlias.make("tracker")),
              application(WorkbenchApplicationId.make("app-2"), WorkbenchApplicationAlias.make("tracker"))
            ],
            queries: []
          },
          { alias: WorkbenchApplicationAlias.make("tracker") }
        )
      )
      expect(String(exit)).toContain("WorkbenchApplicationAliasAmbiguousError")
    })
  )

  it.effect("filters aliases case-insensitively, sorts deterministically, and applies the limit after filtering", () =>
    Effect.gen(function* () {
      const fixture: Fixture = {
        applications: [
          application(WorkbenchApplicationId.make("app-z"), WorkbenchApplicationAlias.make("Zeta"), { order: 5 }),
          application(WorkbenchApplicationId.make("app-b"), WorkbenchApplicationAlias.make("TrackerBeta"), {
            order: 3
          }),
          application(WorkbenchApplicationId.make("app-a"), WorkbenchApplicationAlias.make("TRACKERAlpha"), {
            order: 3
          }),
          application(WorkbenchApplicationId.make("app-other"), WorkbenchApplicationAlias.make("calendar"), {
            order: 1
          })
        ],
        queries: []
      }
      const result = yield* run(fixture, { aliasSearch: "tracker", limit: 1 })
      expect(result.total).toBe(2)
      expect(result.applications.map(({ alias }) => alias)).toEqual(["TRACKERAlpha"])
      expect(fixture.queries[0]?.query).toEqual({ alias: { $like: "%tracker%" } })
    })
  )

  it.effect("preserves duplicate navigation identifiers from distinct declarations", () =>
    Effect.gen(function* () {
      const duplicateNavigation = {
        ...navExtension(),
        _id: toRef<ApplicationNavModel>(DocId.make("nav-2")),
        groups: [
          {
            id: "types",
            label: intl(NonEmptyString.make("recruit:string:Types")),
            groupByClass: toClassRef<Doc>(ObjectClassName.make("recruit:class:Vacancy"))
          }
        ]
      }
      const result = yield* run({
        applications: [
          application(WorkbenchApplicationId.make("app-tracker"), WorkbenchApplicationAlias.make("tracker"))
        ],
        navigation: [navExtension(), duplicateNavigation],
        queries: []
      })
      expect(result.applications[0]?.navigation.groups).toEqual([
        { id: "types", labelId: "tracker:string:Types", groupByClass: "task:class:TaskType" },
        { id: "types", labelId: "recruit:string:Types", groupByClass: "recruit:class:Vacancy" }
      ])
    })
  )

  it.effect("preserves optional application and navigation model fields without fabricating labels", () =>
    Effect.gen(function* () {
      const extensionWithoutLabel = {
        ...navExtensionBase(),
        groups: [{ id: "types", groupByClass: toClassRef<Doc>(ObjectClassName.make("task:class:TaskType")) }]
      }
      const result = yield* run({
        applications: [
          application(WorkbenchApplicationId.make("app-tracker"), WorkbenchApplicationAlias.make("tracker"), {
            accessLevel: AccountRole.User,
            position: "top",
            type: "link",
            navigatorModel: {
              spaces: [
                { id: "projects", spaceClass: toClassRef<Space>(ObjectClassName.make("tracker:class:Project")) }
              ],
              specials: [
                {
                  id: "all",
                  label: intl(NonEmptyString.make("tracker:string:All")),
                  component: trackerAllComponent,
                  accessLevel: AccountRole.User,
                  spaceClass: toClassRef<Space>(ObjectClassName.make("tracker:class:Project"))
                }
              ]
            }
          })
        ],
        navigation: [extensionWithoutLabel],
        queries: []
      })
      expect(result.applications[0]).toMatchObject({
        accessLevel: "USER",
        position: "top",
        type: "link",
        navigation: {
          spaces: [{ id: "projects", spaceClass: "tracker:class:Project" }],
          specials: [
            { id: "all", labelId: "tracker:string:All", accessLevel: "USER", spaceClass: "tracker:class:Project" }
          ],
          groups: [{ id: "types", groupByClass: "task:class:TaskType" }]
        }
      })
    })
  )

  it.effect("omits space navigation without stable IDs and emits an agent-visible warning", () =>
    Effect.gen(function* () {
      const applicationWithUnstableNavigation = {
        ...application(WorkbenchApplicationId.make("app-lead"), WorkbenchApplicationAlias.make("lead")),
        navigatorModel: {
          spaces: [
            { spaceClass: toClassRef<Space>(ObjectClassName.make("lead:class:Funnel")) },
            { spaceClass: toClassRef<Space>(ObjectClassName.make("lead:class:Funnel")) }
          ],
          specials: []
        }
      }
      const { result, warnings } = yield* runWithWarnings({
        applications: [applicationWithUnstableNavigation],
        queries: []
      })
      expect(result.applications[0]?.navigation.spaces).toEqual([])
      expect(warnings).toEqual([
        {
          code: "workbench_navigation_metadata_degraded",
          message: "Skipped 2 Workbench space navigation declarations without a stable id."
        }
      ])

      const singleUnstableItem = {
        ...applicationWithUnstableNavigation,
        navigatorModel: {
          ...applicationWithUnstableNavigation.navigatorModel,
          spaces: [{ spaceClass: toClassRef<Space>(ObjectClassName.make("lead:class:Funnel")) }]
        }
      }
      const single = yield* runWithWarnings({ applications: [singleUnstableItem], queries: [] })
      expect(single.warnings[0]?.message).toBe("Skipped 1 Workbench space navigation declaration without a stable id.")
    })
  )

  it.effect("returns immediately when no application declarations match", () =>
    Effect.gen(function* () {
      const fixture: Fixture = { applications: [], queries: [] }
      const result = yield* run(fixture, { alias: "missing" })
      expect(result).toEqual({ applications: [], total: 0 })
      expect(fixture.queries).toHaveLength(1)
    })
  )

  it.effect("sorts declarations without model order by alias", () =>
    Effect.gen(function* () {
      const { order: _firstOrder, ...second } = application(
        WorkbenchApplicationId.make("app-b"),
        WorkbenchApplicationAlias.make("beta")
      )
      const { order: _secondOrder, ...first } = application(
        WorkbenchApplicationId.make("app-a"),
        WorkbenchApplicationAlias.make("alpha")
      )
      const { order: _duplicateOrder, ...duplicate } = application(
        WorkbenchApplicationId.make("app-a-duplicate"),
        WorkbenchApplicationAlias.make("alpha")
      )
      const result = yield* run({ applications: [first, second, duplicate], queries: [] })
      expect(result.applications.map(({ alias }) => alias)).toEqual(["alpha", "alpha", "beta"])
    })
  )

  it.effect("fails with a typed boundary error instead of leaking malformed model rows", () =>
    Effect.gen(function* () {
      const malformed = {
        ...application(WorkbenchApplicationId.make("app-tracker"), WorkbenchApplicationAlias.make("tracker")),
        label: ""
      }
      const exit = yield* Effect.exit(run({ applications: [malformed], queries: [] }))
      expect(String(exit)).toContain("Huly returned malformed Workbench application metadata")
      expect(String(exit)).not.toContain("app-tracker")
    })
  )

  it.effect("rejects malformed navigation and private preference rows at their boundaries", () =>
    Effect.gen(function* () {
      const malformedNavigation = { ...navExtensionBase(), extends: "" }
      const malformedNavigationExit = yield* Effect.exit(
        run({
          applications: [
            application(WorkbenchApplicationId.make("app-tracker"), WorkbenchApplicationAlias.make("tracker"))
          ],
          navigation: [malformedNavigation],
          queries: []
        })
      )
      expect(String(malformedNavigationExit)).toContain("malformed Workbench navigation metadata")

      const malformedPreference = { ...hiddenPreference(), attachedTo: "" }
      const malformedPreferenceExit = yield* Effect.exit(
        run({
          applications: [
            application(WorkbenchApplicationId.make("app-tracker"), WorkbenchApplicationAlias.make("tracker"))
          ],
          hidden: [malformedPreference],
          queries: []
        })
      )
      expect(String(malformedPreferenceExit)).toContain("malformed caller Workbench preference metadata")
    })
  )
})
