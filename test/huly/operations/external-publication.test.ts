import type { Doc, FindResult, TxResult } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import { describe, it } from "@effect/vitest"
import { Clock, Effect, Exit, Layer } from "effect"
import { expect } from "vitest"

import {
  getIssuePublicationStatus,
  listExternalTrackerTargets,
  publishIssueToExternalTracker
} from "../../../src/huly/operations/external-publication.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics } from "../../../src/huly/diagnostics.js"
import { github } from "../../../src/huly/github-plugin.js"
import { core, tracker } from "../../../src/huly/huly-plugins.js"
import {
  ExternalTrackerModelUnavailableError,
  ExternalTrackerNoEnabledTargetError,
  ExternalTrackerPublicationConflictError,
  ExternalTrackerTargetAmbiguousError,
  ExternalTrackerTargetCrossProjectError,
  ExternalTrackerTargetDisabledError,
  ExternalTrackerTargetNotFoundError
} from "../../../src/huly/errors-external-publication.js"
import { IssueIdentifier, ProjectIdentifier } from "../../../src/domain/schemas/shared.js"
import { DocId } from "../../../src/domain/schemas/shared-refs.js"
import type { ToolWarning } from "../../../src/domain/schemas/tool-warnings.js"
import {
  ExternalTrackerTargetId,
  ExternalTrackerTargetLocator,
  ExternalTrackerTargetName,
  GithubCompatibilityCapabilitySchema
} from "../../../src/domain/schemas/external-tracker-publication.js"
import type {
  ListExternalTrackerTargetsParams,
  PublishIssueToExternalTrackerParams
} from "../../../src/domain/schemas/external-tracker-publication.js"

interface FixtureState {
  mixin?: Record<string, unknown> | undefined
  syncInfo?: Record<string, unknown> | undefined
  projectMixin?: Record<string, unknown> | undefined
  modelCapabilities?: boolean
  sdkMixinWrappers?: boolean
  projectRepositories: ReadonlyArray<string>
  repositories: ReadonlyArray<Record<string, unknown>>
  readonly modelClassRefs: Array<string>
  readonly createMixins: Array<Record<string, unknown>>
  readonly updateMixins: Array<Record<string, unknown>>
  readonly warnings: Array<ToolWarning>
}

const projectId = "project-1"
const issueId = "issue-1"
const repositoryId = "repository-1"
const secondRepositoryId = "repository-2"
const targetLocator = ExternalTrackerTargetLocator.make

const projectDoc = { _id: projectId, identifier: "ENG" }
const issueDoc = { _id: issueId, identifier: "ENG-1", modifiedOn: 10_000, space: projectId }

const baseRepository = (id: string, name: string, enabled = true, mappedProject = projectId) => ({
  _id: id,
  name,
  enabled,
  githubProject: mappedProject
})

const makeFixtureLayer = (state: FixtureState, now = 11_000): Layer.Layer<HulyClient | Diagnostics> => {
  const matches = (value: unknown, query: unknown): boolean => {
    if (typeof query !== "object" || query === null) return true
    return Object.entries(query).every(([key, expected]) => Reflect.get(value as object, key) === expected)
  }
  const findOne: HulyClientOperations["findOne"] = ((classRef: unknown, query: unknown) => {
    const ref = String(classRef)
    if (ref === String(tracker.class.Project))
      return Effect.succeed(matches(projectDoc, query) ? projectDoc : undefined)
    if (ref === String(tracker.class.Issue)) return Effect.succeed(matches(issueDoc, query) ? issueDoc : undefined)
    if (ref === String(github.mixin.GithubProject)) {
      return Effect.succeed(
        state.sdkMixinWrappers && state.projectMixin !== undefined
          ? { [String(github.mixin.GithubProject)]: state.projectMixin }
          : state.projectMixin
      )
    }
    if (ref === String(github.mixin.GithubIssue)) {
      return Effect.succeed(
        state.sdkMixinWrappers && state.mixin !== undefined
          ? { [String(github.mixin.GithubIssue)]: state.mixin }
          : state.mixin
      )
    }
    if (ref === String(github.class.DocSyncInfo)) return Effect.succeed(state.syncInfo)
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]
  const findAll: HulyClientOperations["findAll"] = ((classRef: unknown) => {
    return String(classRef) === String(github.class.GithubIntegrationRepository)
      ? // eslint-disable-next-line hulymcp/no-double-type-assertion -- generic Huly adapter fixtures narrow unknown records at the test port.
        Effect.succeed(toFindResult([...state.repositories] as unknown as Array<Doc>) as FindResult<Doc>)
      : Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]
  const findAllInModel: HulyClientOperations["findAllInModel"] = ((classRef: unknown) => {
    state.modelClassRefs.push(String(classRef))
    return Effect.succeed(
      // eslint-disable-next-line hulymcp/no-double-type-assertion -- model capability fixtures use opaque SDK refs.
      toFindResult(
        state.modelCapabilities === false
          ? []
          : [
              // eslint-disable-next-line hulymcp/no-double-type-assertion -- model capability fixtures use opaque SDK refs.
              ...([
                github.class.GithubIntegrationRepository,
                github.class.DocSyncInfo,
                github.mixin.GithubIssue,
                github.mixin.GithubProject
              ].map((_id) => ({
                _id,
                _class: core.class.Class,
                space: core.space.Model,
                modifiedOn: 0
              })) as unknown as Array<Doc>)
            ]
      ) as unknown as FindResult<Doc>
    )
  }) as HulyClientOperations["findAllInModel"]
  const createMixin = ((...args: ReadonlyArray<unknown>) => {
    const attributes = args.at(-1)
    state.createMixins.push((attributes ?? {}) as Record<string, unknown>)
    return Effect.succeed({} as TxResult)
  }) as HulyClientOperations["createMixin"]
  const updateMixin = ((...args: ReadonlyArray<unknown>) => {
    const attributes = args.at(-1)
    state.updateMixins.push((attributes ?? {}) as Record<string, unknown>)
    return Effect.succeed({} as TxResult)
  }) as HulyClientOperations["updateMixin"]
  const operations = HulyClient.testLayer({ findOne, findAll, findAllInModel, createMixin, updateMixin })
  const diagnostics = Layer.succeed(Diagnostics, {
    warnAgent: (warning) => Effect.sync(() => state.warnings.push(warning)).pipe(Effect.asVoid),
    trail: () => Effect.void
  })
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => now,
    currentTimeMillis: Effect.succeed(now),
    currentTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
    currentTimeNanos: Effect.succeed(BigInt(now) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => BigInt(now) * 1_000_000n,
    monotonicTimeNanos: Effect.succeed(BigInt(now) * 1_000_000n),
    sleep: () => Effect.void
  }
  return Layer.merge(Layer.merge(operations, Layer.succeed(Clock.Clock, clock)), diagnostics)
}

const params = {
  project: ProjectIdentifier.make("ENG"),
  identifier: IssueIdentifier.make("ENG-1"),
  provider: "github" as const
}

const baseState = (): FixtureState => ({
  projectRepositories: [repositoryId],
  projectMixin: { repositories: [repositoryId] },
  repositories: [baseRepository(repositoryId, "owner/repo")],
  modelClassRefs: [],
  sdkMixinWrappers: false,
  createMixins: [],
  updateMixins: [],
  warnings: []
})

describe("external publication Huly adapter", () => {
  it("unwraps the native SDK envelope around mixin records", () => {
    const state = baseState()
    state.sdkMixinWrappers = true
    state.mixin = { repository: repositoryId, url: "", githubNumber: 0, modifiedOn: 10_500 }
    const layer = makeFixtureLayer(state, 12_000)
    const targets = Effect.runSync(
      listExternalTrackerTargets({ project: ProjectIdentifier.make("ENG") }).pipe(Effect.provide(layer))
    )
    expect(targets.targets).toHaveLength(1)

    const status = Effect.runSync(getIssuePublicationStatus(params).pipe(Effect.provide(layer)))
    expect(status.state).toBe("pending")
    if (status.state === "pending") expect(status.elapsedMs).toBe(1_500)
  })

  it("discovers mapped targets and creates the exact native GitHub mixin", () => {
    const state = baseState()
    const layer = makeFixtureLayer(state)
    const discovered = Effect.runSync(
      listExternalTrackerTargets({
        project: ProjectIdentifier.make("ENG")
      } satisfies ListExternalTrackerTargetsParams).pipe(Effect.provide(layer))
    )
    expect(discovered.targets).toHaveLength(1)
    expect(discovered.targets[0]?.targetId).toBe(repositoryId)

    const published = Effect.runSync(
      publishIssueToExternalTracker(params satisfies PublishIssueToExternalTrackerParams).pipe(Effect.provide(layer))
    )
    expect(published.state).toBe("pending")
    expect(state.createMixins).toEqual([{ repository: repositoryId, url: "", githubNumber: 0 }])
    expect(state.modelClassRefs).toEqual([
      String(core.class.Class),
      String(core.class.Mixin),
      String(core.class.Class),
      String(core.class.Mixin)
    ])
  })

  it("projects status and returns idempotent pending or published states", () => {
    const state = baseState()
    state.mixin = { repository: repositoryId, url: "", githubNumber: 0, modifiedOn: 10_500 }
    const layer = makeFixtureLayer(state, 12_000)
    const pending = Effect.runSync(getIssuePublicationStatus(params).pipe(Effect.provide(layer)))
    expect(pending.state).toBe("pending")
    if (pending.state === "pending") expect(pending.elapsedMs).toBe(1_500)

    const idempotentPending = Effect.runSync(publishIssueToExternalTracker(params).pipe(Effect.provide(layer)))
    expect(idempotentPending.state).toBe("pending")
    expect(state.updateMixins).toHaveLength(0)

    state.syncInfo = {
      repository: repositoryId,
      url: "https://github.com/owner/repo/issues/7",
      githubNumber: 7,
      modifiedOn: 11_500
    }
    const published = Effect.runSync(publishIssueToExternalTracker(params).pipe(Effect.provide(layer)))
    expect(published.state).toBe("published")
    expect(state.updateMixins).toHaveLength(0)
    const publishedStatus = Effect.runSync(getIssuePublicationStatus(params).pipe(Effect.provide(layer)))
    expect(publishedStatus.state).toBe("published")
  })

  it("requeues persisted failures and preserves bounded previous failure evidence", () => {
    const state = baseState()
    state.mixin = { repository: repositoryId, url: "", githubNumber: 0, modifiedOn: 10_000 }
    state.syncInfo = {
      repository: repositoryId,
      url: "",
      githubNumber: 0,
      modifiedOn: 10_000,
      error: { secret: "must not escape" }
    }
    const result = Effect.runSync(
      publishIssueToExternalTracker(params).pipe(Effect.provide(makeFixtureLayer(state, 10_001)))
    )
    expect(result.state).toBe("pending")
    if (result.state === "pending" && "previousFailure" in result)
      expect(result.previousFailure).toContain("worker reported")
    expect(state.updateMixins).toEqual([{ repository: repositoryId, url: "", githubNumber: 0 }])
    expect(JSON.stringify(result)).not.toContain("secret")
  })

  it("returns typed target and conflict failures", () => {
    const disabled = baseState()
    disabled.repositories = [baseRepository(repositoryId, "owner/repo", false)]
    const disabledExit = Effect.runSyncExit(
      publishIssueToExternalTracker({ ...params, target: targetLocator(repositoryId) }).pipe(
        Effect.provide(makeFixtureLayer(disabled))
      )
    )
    expect(Exit.isFailure(disabledExit)).toBe(true)
    if (Exit.isFailure(disabledExit)) expect(disabledExit.cause).toBeDefined()

    const missing = baseState()
    const missingExit = Effect.runSyncExit(
      publishIssueToExternalTracker({ ...params, target: targetLocator("missing") }).pipe(
        Effect.provide(makeFixtureLayer(missing))
      )
    )
    expect(Exit.isFailure(missingExit)).toBe(true)

    const conflict = baseState()
    conflict.repositories = [
      baseRepository(repositoryId, "owner/repo"),
      baseRepository(secondRepositoryId, "owner/other")
    ]
    conflict.projectRepositories = [repositoryId, secondRepositoryId]
    conflict.mixin = { repository: repositoryId, url: "", githubNumber: 0 }
    const conflictExit = Effect.runSyncExit(
      publishIssueToExternalTracker({ ...params, target: targetLocator(secondRepositoryId) }).pipe(
        Effect.provide(makeFixtureLayer(conflict))
      )
    )
    expect(Exit.isFailure(conflictExit)).toBe(true)
    if (Exit.isFailure(conflictExit)) expect(conflictExit.cause).toBeDefined()
  })

  it("reports capability, malformed-data, and unavailable-target failures", () => {
    const unsupported = baseState()
    unsupported.modelCapabilities = false
    expect(
      Exit.isFailure(
        Effect.runSyncExit(
          listExternalTrackerTargets({ project: ProjectIdentifier.make("ENG") }).pipe(
            Effect.provide(makeFixtureLayer(unsupported))
          )
        )
      )
    ).toBe(true)

    const malformed = baseState()
    malformed.repositories = [{ _id: repositoryId, name: "" }]
    expect(
      Exit.isFailure(
        Effect.runSyncExit(
          listExternalTrackerTargets({ project: ProjectIdentifier.make("ENG") }).pipe(
            Effect.provide(makeFixtureLayer(malformed))
          )
        )
      )
    ).toBe(true)

    const deleted = baseState()
    deleted.projectMixin = undefined
    deleted.repositories = [
      { ...baseRepository(repositoryId, "z-owner/deleted"), deleted: true },
      baseRepository(secondRepositoryId, "a-owner/repo"),
      { _id: "repository-unmapped", name: "unmapped", enabled: true, githubProject: null }
    ]
    const targets = Effect.runSync(
      listExternalTrackerTargets({ project: ProjectIdentifier.make("ENG"), provider: "github" }).pipe(
        Effect.provide(makeFixtureLayer(deleted))
      )
    )
    expect(targets.targets[0]?.enabled).toBe(true)
    expect(targets.targets[1]?.enabled).toBe(false)

    const projectMixinMapping = baseState()
    projectMixinMapping.projectMixin = { repositories: [repositoryId, secondRepositoryId] }
    projectMixinMapping.repositories = [
      baseRepository(repositoryId, "owner/direct", true, "OTHER"),
      baseRepository(secondRepositoryId, "owner/mixin")
    ]
    const mixedTargets = Effect.runSync(
      listExternalTrackerTargets({ project: ProjectIdentifier.make("ENG") }).pipe(
        Effect.provide(makeFixtureLayer(projectMixinMapping))
      )
    )
    expect(mixedTargets.targets.map((target) => target.name)).toEqual(["owner/direct", "owner/mixin"])

    const notRequested = baseState()
    notRequested.mixin = undefined
    const status = Effect.runSync(
      getIssuePublicationStatus(params).pipe(Effect.provide(makeFixtureLayer(notRequested)))
    )
    expect(status.state).toBe("not_requested")

    const unavailable = baseState()
    unavailable.projectMixin = undefined
    unavailable.repositories = []
    unavailable.mixin = { repository: "missing-repo", url: "", githubNumber: 0 }
    const unavailableStatus = Effect.runSync(
      getIssuePublicationStatus(params).pipe(Effect.provide(makeFixtureLayer(unavailable)))
    )
    expect(unavailableStatus.state).toBe("pending")
    if (unavailableStatus.state === "pending") expect(unavailableStatus.target.enabled).toBe(false)
    expect(unavailable.warnings).toHaveLength(1)
  })

  it("renders actionable messages for every publication-domain failure", () => {
    const messages = [
      new ExternalTrackerModelUnavailableError({
        provider: "github",
        capabilities: [GithubCompatibilityCapabilitySchema.make("github:mixin:GithubIssue")]
      }),
      new ExternalTrackerNoEnabledTargetError({ project: ProjectIdentifier.make("ENG"), provider: "github" }),
      new ExternalTrackerTargetNotFoundError({
        project: ProjectIdentifier.make("ENG"),
        provider: "github",
        target: targetLocator("missing")
      }),
      new ExternalTrackerTargetAmbiguousError({
        project: ProjectIdentifier.make("ENG"),
        provider: "github",
        candidates: []
      }),
      new ExternalTrackerTargetAmbiguousError({
        project: ProjectIdentifier.make("ENG"),
        provider: "github",
        target: targetLocator("owner/repo"),
        candidates: []
      }),
      new ExternalTrackerTargetDisabledError({
        project: ProjectIdentifier.make("ENG"),
        provider: "github",
        targetId: ExternalTrackerTargetId.make(repositoryId),
        name: ExternalTrackerTargetName.make("owner/repo")
      }),
      new ExternalTrackerTargetCrossProjectError({
        project: ProjectIdentifier.make("ENG"),
        provider: "github",
        target: targetLocator(repositoryId),
        actualProject: DocId.make("OTHER")
      }),
      new ExternalTrackerPublicationConflictError({
        project: ProjectIdentifier.make("ENG"),
        identifier: IssueIdentifier.make("ENG-1"),
        requestedTargetId: ExternalTrackerTargetId.make(secondRepositoryId),
        existingTargetId: ExternalTrackerTargetId.make(repositoryId)
      })
    ].map((error) => error.message)
    expect(messages.every((message) => message.length > 20)).toBe(true)
  })
})
