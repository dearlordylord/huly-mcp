import { describe, it } from "@effect/vitest"
import { Effect, Exit, Schema } from "effect"
import { expect } from "vitest"

import {
  ExternalIssueNumber,
  ExternalTrackerPublicationStatusSchema,
  ExternalTrackerProviderSchema,
  ExternalTrackerTargetId,
  ExternalTrackerTargetLocator,
  ExternalTrackerTargetName,
  ExternalTrackerTargetSchema,
  type ExternalTrackerTarget
} from "../../../src/domain/schemas/external-tracker-publication.js"
import { IssueIdentifier, ProjectIdentifier, Timestamp, UrlString } from "../../../src/domain/schemas/shared.js"
import { DocId } from "../../../src/domain/schemas/shared-refs.js"
import {
  DocSyncInfoRecordSchema,
  GithubIssueMixinRecordSchema
} from "../../../src/huly/github-plugin.js"
import {
  EXTERNAL_PUBLICATION_MAX_PENDING_MS,
  pendingPublicationState,
  projectExternalPublicationState,
  resolveExternalTrackerTarget,
  type ExternalTrackerTargetCandidate
} from "../../../src/huly/operations/external-publication-core.js"

const target = (id: string, name: string, enabled = true): ExternalTrackerTarget =>
  ExternalTrackerTargetSchema.make({
    provider: ExternalTrackerProviderSchema.make("github"),
    kind: "repository",
    targetId: ExternalTrackerTargetId.make(id),
    name: ExternalTrackerTargetName.make(name),
    enabled
  })

const candidate = (
  value: ExternalTrackerTarget,
  mapped = true,
  actualProject?: string
): ExternalTrackerTargetCandidate => ({
  target: value,
  mapped,
  ...(actualProject === undefined ? {} : { actualProject: DocId.make(actualProject) })
})

const locator = ExternalTrackerTargetLocator.make
const timestamp = Timestamp.make
const targetId = ExternalTrackerTargetId.make
const mixin = (value: Readonly<Record<string, unknown>>) => Schema.decodeUnknownSync(GithubIssueMixinRecordSchema)(value)
const syncInfo = (value: Readonly<Record<string, unknown>>) => Schema.decodeUnknownSync(DocSyncInfoRecordSchema)(value)

describe("external publication core", () => {
  it("selects the sole enabled target and projects pending state", () => {
    const repository = target("repo-1", "owner/repo")
    const selected = Effect.runSync(
      resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", undefined, [candidate(repository)])
    )
    expect(selected.targetId).toBe(repository.targetId)

    const pending = pendingPublicationState({
      project: ProjectIdentifier.make("ENG"),
      identifier: IssueIdentifier.make("ENG-1"),
      target: repository,
      now: timestamp(1_000)
    })
    expect(pending.state).toBe("pending")
    if (pending.state === "pending") expect(pending.elapsedMs).toBe(0)
    expect(Schema.decodeUnknownSync(ExternalTrackerPublicationStatusSchema)(pending)).toEqual(pending)
  })

  it("returns not requested, published, and bounded stale failure projections", () => {
    const repository = target("repo-1", "owner/repo")
    const base = {
      project: ProjectIdentifier.make("ENG"),
      identifier: IssueIdentifier.make("ENG-1"),
      issueModifiedOn: timestamp(10_000),
      now: timestamp(10_000)
    }
    expect(projectExternalPublicationState(base).state).toBe("not_requested")

    const published = projectExternalPublicationState({
      ...base,
      mixin: mixin({
        repository: targetId("repo-1"),
        url: UrlString.make("https://github.com/owner/repo/issues/1"),
        githubNumber: ExternalIssueNumber.make(1)
      }),
      target: repository
    })
    expect(published.state).toBe("published")
    if (published.state === "published") expect(published.externalIssueNumber).toBe(1)

    const stale = projectExternalPublicationState({
      ...base,
      now: timestamp(base.issueModifiedOn + EXTERNAL_PUBLICATION_MAX_PENDING_MS),
      mixin: mixin({ repository: targetId("repo-1"), url: "", githubNumber: 0 }),
      target: repository
    })
    expect(stale.state).toBe("failed")
  })

  it("rejects ambiguous and cross-project target selection with typed failures", () => {
    const first = candidate(target("repo-1", "owner/repo"))
    const second = candidate(target("repo-2", "owner/repo"))
    const ambiguous = Effect.runSyncExit(
      resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", locator("owner/repo"), [first, second])
    )
    expect(Exit.isFailure(ambiguous)).toBe(true)

    const crossProject = Effect.runSyncExit(
      resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", locator("repo-3"), [
        candidate(target("repo-3", "other/repo"), false, "OTHER")
      ])
    )
    expect(Exit.isFailure(crossProject)).toBe(true)
  })

  it("covers automatic and exact-name resolution outcomes", () => {
    const disabled = candidate(target("repo-disabled", "owner/disabled", false))
    expect(
      Exit.isFailure(
        Effect.runSyncExit(resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", undefined, [disabled]))
      )
    ).toBe(true)

    const first = candidate(target("repo-1", "owner/one"))
    const second = candidate(target("repo-2", "owner/two"))
    expect(
      Exit.isFailure(
        Effect.runSyncExit(
          resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", undefined, [first, second])
        )
      )
    ).toBe(true)
    expect(
      Effect.runSync(
        resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", locator("owner/one"), [first])
      ).name
    ).toBe("owner/one")

    const disabledByName = candidate(target("repo-disabled", "owner/disabled", false))
    expect(
      Exit.isFailure(
        Effect.runSyncExit(
          resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", locator("owner/disabled"), [
            disabledByName
          ])
        )
      )
    ).toBe(true)
    expect(
      Exit.isFailure(
        Effect.runSyncExit(
          resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", locator("missing"), [first])
        )
      )
    ).toBe(true)
    expect(
      Exit.isFailure(
        Effect.runSyncExit(
          resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", locator("owner/other"), [
            candidate(target("repo-other", "owner/other"), false)
          ])
        )
      )
    ).toBe(true)
    expect(
      Exit.isFailure(
        Effect.runSyncExit(
          resolveExternalTrackerTarget(ProjectIdentifier.make("ENG"), "github", locator("repo-other"), [
            candidate(target("repo-other", "owner/other"), false)
          ])
        )
      )
    ).toBe(true)
  })

  it("uses persisted timestamps and redacts all worker failure shapes", () => {
    const repository = target("repo-1", "owner/repo")
    const base = {
      project: ProjectIdentifier.make("ENG"),
      identifier: IssueIdentifier.make("ENG-1"),
      issueModifiedOn: timestamp(10_000),
      now: timestamp(10_001),
      mixin: mixin({ repository: targetId("repo-1"), url: "", githubNumber: 0, modifiedOn: timestamp(10_000) }),
      target: repository
    }
    const pending = projectExternalPublicationState(base)
    expect(pending.state).toBe("pending")
    const persistedFailure = projectExternalPublicationState({
      ...base,
      syncInfo: syncInfo({
        repository: targetId("repo-1"),
        url: "",
        githubNumber: 0,
        modifiedOn: timestamp(10_000),
        error: "failed"
      })
    })
    expect(persistedFailure.state).toBe("failed")
    const nullFailure = projectExternalPublicationState({
      ...base,
      syncInfo: syncInfo({
        repository: targetId("repo-1"),
        url: "",
        githubNumber: 0,
        modifiedOn: timestamp(10_000),
        error: null
      })
    })
    expect(nullFailure.state).toBe("pending")
    const outOfDateRange = projectExternalPublicationState({
      ...base,
      issueModifiedOn: timestamp(Number.MAX_SAFE_INTEGER),
      now: timestamp(Number.MAX_SAFE_INTEGER),
      mixin: mixin({
        repository: targetId("repo-1"),
        url: "",
        githubNumber: 0,
        modifiedOn: timestamp(Number.MAX_SAFE_INTEGER)
      })
    })
    expect(outOfDateRange.state).toBe("pending")
    const { target: omittedTarget, ...withoutTarget } = base
    void omittedTarget
    const fallbackTarget = projectExternalPublicationState(withoutTarget)
    expect(fallbackTarget.state).toBe("pending")
    if (persistedFailure.state === "failed") expect(persistedFailure.failureSummary).not.toContain("failed")
  })
})
