import { describe, it } from "@effect/vitest"
import type { Doc, MarkupBlobRef, PersonId, Ref, Space } from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type {
  Document as HulyDocument,
  DocumentSnapshot as HulyDocumentSnapshot,
  Teamspace as HulyTeamspace
} from "@hcengineering/document"
import type {
  IssueStatus,
  Project as HulyProject,
  ProjectTargetPreference,
  RelatedIssueTarget as HulyRelatedIssueTarget
} from "@hcengineering/tracker"
import { TimeReportDayType } from "@hcengineering/tracker"
import { Effect, Exit, TestClock } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import { DocumentSnapshotIdentifier } from "../../../src/domain/schemas/document-snapshots.js"
import { TrackerPreferencePropertyKey } from "../../../src/domain/schemas/project-target-preferences.js"
import {
  parseListRelatedIssueTargetsParams,
  parseSetRelatedIssueTargetParams
} from "../../../src/domain/schemas/related-issue-targets.js"
import {
  DocumentIdentifier,
  ObjectClassName,
  ProjectIdentifier,
  SpaceIdentifier,
  TeamspaceIdentifier
} from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core, documentPlugin, tracker } from "../../../src/huly/huly-plugins.js"
import { getDocumentSnapshot, listDocumentSnapshots } from "../../../src/huly/operations/document-snapshots.js"
import {
  listProjectTargetPreferences,
  upsertProjectTargetPreference
} from "../../../src/huly/operations/project-target-preferences.js"
import {
  deleteRelatedIssueSpaceTarget,
  listRelatedIssueTargets,
  setRelatedIssueTarget
} from "../../../src/huly/operations/related-issue-targets.js"

// Brands and SDK refs are erased at runtime. Test fixtures use literal strings to model
// documents returned by the Huly SDK, so these casts only restore phantom SDK brands.
const ref = <T extends Doc>(value: string): Ref<T> => value as Ref<T>
const personId = (value: string): PersonId => value as PersonId
const markupBlobRef = (value: string): MarkupBlobRef => value as MarkupBlobRef

// The test Huly port receives already-decoded query/update objects from operation code.
// This narrows unknown port payloads to inspect captured fields without changing behavior.
const recordFromPort = (value: unknown): Record<string, unknown> => value as Record<string, unknown>
const arrayFromPort = (value: unknown): ReadonlyArray<unknown> => Array.isArray(value) ? value : []
const idInFilter = (value: unknown): ReadonlyArray<unknown> =>
  value === undefined ? [] : arrayFromPort(recordFromPort(value).$in)
const userId: PersonId = personId("user-1")

const makeTeamspace = (): HulyTeamspace => ({
  _id: ref<HulyTeamspace>("teamspace-1"),
  _class: documentPlugin.class.Teamspace,
  space: ref<Space>("space-1"),
  name: "Docs",
  description: "",
  archived: false,
  private: false,
  members: [],
  type: documentPlugin.spaceType.DefaultTeamspaceType,
  modifiedBy: userId,
  modifiedOn: 1
})

const makeDocument = (): HulyDocument => ({
  _id: ref<HulyDocument>("doc-1"),
  _class: documentPlugin.class.Document,
  space: ref<HulyTeamspace>("teamspace-1"),
  title: "Spec",
  content: null,
  parent: documentPlugin.ids.NoParent,
  rank: "0|aaa",
  modifiedBy: userId,
  modifiedOn: 2
})

type SnapshotDoc = HulyDocumentSnapshot & { readonly attachedTo: Ref<HulyDocument> }

const makeSnapshot = (overrides: Partial<SnapshotDoc> = {}): SnapshotDoc => ({
  _id: ref<SnapshotDoc>("snapshot-1"),
  _class: documentPlugin.class.DocumentSnapshot,
  space: ref<Space>("teamspace-1"),
  title: "Before release",
  content: markupBlobRef("markup-1"),
  parent: ref<HulyDocument>("doc-parent"),
  attachedTo: ref<HulyDocument>("doc-1"),
  modifiedBy: userId,
  modifiedOn: 20,
  createdBy: userId,
  createdOn: 10,
  ...overrides
})

const makeProject = (): HulyProject => ({
  _id: ref<HulyProject>("project-1"),
  _class: tracker.class.Project,
  space: ref<Space>("project-1"),
  identifier: "PRJ",
  name: "Project",
  description: "",
  private: false,
  archived: false,
  members: [],
  type: tracker.ids.ClassingProjectType,
  sequence: 1,
  defaultIssueStatus: ref<IssueStatus>("status-1"),
  defaultTimeReportDay: TimeReportDayType.CurrentWorkDay,
  modifiedBy: userId,
  modifiedOn: 1
})

const makePreference = (overrides: Partial<ProjectTargetPreference> = {}): ProjectTargetPreference => ({
  _id: ref<ProjectTargetPreference>("pref-1"),
  _class: tracker.class.ProjectTargetPreference,
  space: ref<Space>("project-1"),
  attachedTo: ref<HulyProject>("project-1"),
  usedOn: 25,
  props: [{ key: "github:repo", value: "repo-1" }],
  modifiedBy: userId,
  modifiedOn: 25,
  ...overrides
})

const makeSpace = (): Space => ({
  _id: ref<Space>("space-1"),
  _class: core.class.Space,
  space: core.space.Space,
  name: "Source Space",
  description: "",
  private: false,
  archived: false,
  members: [],
  modifiedBy: userId,
  modifiedOn: 1
})

const makeRelatedSpaceTarget = (overrides: Partial<HulyRelatedIssueTarget> = {}): HulyRelatedIssueTarget => ({
  _id: ref<HulyRelatedIssueTarget>("related-target-1"),
  _class: tracker.class.RelatedIssueTarget,
  space: ref<Space>("space-1"),
  rule: { kind: "spaceRule", space: ref<Space>("space-1") },
  target: ref<HulyProject>("project-1"),
  modifiedBy: userId,
  modifiedOn: 30,
  createdBy: userId,
  createdOn: 20,
  ...overrides
})

const makeRelatedClassTarget = (overrides: Partial<HulyRelatedIssueTarget> = {}): HulyRelatedIssueTarget =>
  makeRelatedSpaceTarget({
    _id: ref<HulyRelatedIssueTarget>("related-class-target-1"),
    rule: { kind: "classRule", ofClass: ref("document:class:Document") },
    ...overrides
  })

interface Captures {
  readonly createDoc?: { attributes?: Record<string, unknown>; space?: unknown }
  readonly removeDoc?: { id?: unknown; space?: unknown }
  readonly updateDoc?: { operations?: Record<string, unknown> }
}

interface TestFixtures {
  readonly preference?: ProjectTargetPreference | undefined
  readonly relatedTargets?: ReadonlyArray<HulyRelatedIssueTarget>
  readonly snapshots?: ReadonlyArray<SnapshotDoc>
}

const testLayer = (captures: Captures = {}, fixtures: TestFixtures = {}) => {
  const teamspace = makeTeamspace()
  const document = makeDocument()
  const snapshots = fixtures.snapshots ?? [makeSnapshot()]
  const project = makeProject()
  const preference = "preference" in fixtures ? fixtures.preference : makePreference()
  const space = makeSpace()
  const relatedTargets = fixtures.relatedTargets ?? []

  // HulyClientOperations methods are generic SDK ports. The fixture branches by class and returns
  // matching SDK-shaped documents; the cast seals the generic method signature for the test layer.
  const findAll: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown) => {
    const q = recordFromPort(query)
    if (_class === documentPlugin.class.DocumentSnapshot) {
      const filtered = snapshots.filter((snapshot) =>
        q.attachedTo === snapshot.attachedTo
        && (q.title === undefined || q.title === snapshot.title)
        && (q.createdOn === undefined || q.createdOn === snapshot.createdOn)
      )
      return Effect.succeed(toFindResult(filtered))
    }
    if (_class === tracker.class.ProjectTargetPreference) {
      return Effect.succeed(
        toFindResult(
          preference !== undefined && (q.attachedTo === project._id || q.attachedTo === undefined) ? [preference] : []
        )
      )
    }
    if (_class === tracker.class.Project) {
      const queriedIds = idInFilter(q._id)
      const matchesId = q._id === undefined || queriedIds.length === 0 || queriedIds.includes(project._id)
      return Effect.succeed(toFindResult(matchesId ? [project] : []))
    }
    if (_class === core.class.Space) {
      return Effect.succeed(toFindResult([space]))
    }
    if (_class === tracker.class.RelatedIssueTarget) {
      const filtered = relatedTargets.filter((target) =>
        (q["rule.kind"] === undefined || q["rule.kind"] === target.rule.kind)
        && (q["rule.space"] === undefined || target.rule.kind === "spaceRule" && q["rule.space"] === target.rule.space)
        && (q["rule.ofClass"] === undefined
          || target.rule.kind === "classRule" && q["rule.ofClass"] === target.rule.ofClass)
      )
      return Effect.succeed(toFindResult(filtered))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  // See findAll above: the implementation is class-dispatched and satisfies the generic port.
  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = recordFromPort(query)
    if (_class === documentPlugin.class.Teamspace) {
      return Effect.succeed(q.name === teamspace.name || q._id === teamspace._id ? teamspace : undefined)
    }
    if (_class === documentPlugin.class.Document) {
      return Effect.succeed(q.title === document.title || q._id === document._id ? document : undefined)
    }
    if (_class === documentPlugin.class.DocumentSnapshot) {
      return Effect.succeed(
        snapshots.find((snapshot) =>
          q.attachedTo === snapshot.attachedTo
          && (q._id === undefined || q._id === snapshot._id)
          && (q.title === undefined || q.title === snapshot.title)
        )
      )
    }
    if (_class === tracker.class.Project) {
      return Effect.succeed(q.identifier === project.identifier || q._id === project._id ? project : undefined)
    }
    if (_class === tracker.class.ProjectTargetPreference) {
      return Effect.succeed(preference !== undefined && q.attachedTo === project._id ? preference : undefined)
    }
    if (_class === tracker.class.RelatedIssueTarget) {
      return Effect.succeed(
        relatedTargets.find((target) =>
          (q["rule.kind"] === undefined || q["rule.kind"] === target.rule.kind)
          && (q["rule.space"] === undefined
            || target.rule.kind === "spaceRule" && q["rule.space"] === target.rule.space)
          && (q["rule.ofClass"] === undefined
            || target.rule.kind === "classRule" && q["rule.ofClass"] === target.rule.ofClass)
        )
      )
    }
    if (_class === core.class.Space) {
      return Effect.succeed(q._id === space._id ? space : undefined)
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  // See findAll above: the implementation captures writes and returns a valid SDK ref.
  const createDoc: HulyClientOperations["createDoc"] = ((_class: unknown, docSpace: unknown, attributes: unknown) => {
    if (captures.createDoc !== undefined) {
      captures.createDoc.attributes = recordFromPort(attributes)
      captures.createDoc.space = docSpace
    }
    return Effect.succeed(ref<Doc>("created-id"))
  }) as HulyClientOperations["createDoc"]

  // See findAll above: the implementation captures the generic update document payload.
  const updateDoc: HulyClientOperations["updateDoc"] =
    ((_class: unknown, _space: unknown, _id: unknown, operations: unknown) => {
      if (captures.updateDoc !== undefined) {
        captures.updateDoc.operations = recordFromPort(operations)
      }
      return Effect.succeed({} as never)
    }) as HulyClientOperations["updateDoc"]

  const removeDoc: HulyClientOperations["removeDoc"] = ((_class: unknown, docSpace: unknown, id: unknown) => {
    if (captures.removeDoc !== undefined) {
      captures.removeDoc.id = id
      captures.removeDoc.space = docSpace
    }
    return Effect.succeed({} as never)
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({
    createDoc,
    fetchMarkup: () => Effect.succeed("# Snapshot"),
    findAll,
    findOne,
    removeDoc,
    updateDoc
  })
}

describe("issue #102 operations", () => {
  it.effect("lists and gets document snapshots with markdown only on get", () =>
    Effect.gen(function*() {
      const listed = yield* listDocumentSnapshots({
        document: DocumentIdentifier.make("Spec"),
        teamspace: TeamspaceIdentifier.make("Docs")
      }).pipe(Effect.provide(testLayer()))
      expect(assertAt(listed.snapshots, 0)).toMatchObject({
        documentId: "doc-1",
        parentDocumentId: "doc-parent",
        snapshotId: "snapshot-1",
        teamspaceId: "teamspace-1",
        title: "Before release"
      })
      expect("markdown" in assertAt(listed.snapshots, 0)).toBe(false)

      const { createdOn: _createdOn, ...snapshotWithoutCreatedOn } = makeSnapshot()
      const listedWithoutCreatedOn = yield* listDocumentSnapshots({
        document: DocumentIdentifier.make("Spec"),
        teamspace: TeamspaceIdentifier.make("Docs")
      }).pipe(
        Effect.provide(testLayer({}, {
          snapshots: [snapshotWithoutCreatedOn]
        }))
      )
      expect(listedWithoutCreatedOn.snapshots[0]?.createdOn).toBeUndefined()

      const got = yield* getDocumentSnapshot({
        document: DocumentIdentifier.make("Spec"),
        snapshot: DocumentSnapshotIdentifier.make("snapshot-1"),
        teamspace: TeamspaceIdentifier.make("Docs")
      }).pipe(Effect.provide(testLayer()))
      expect(got.markdown).toBe("# Snapshot")
    }))

  it.effect("resolves document snapshots by title and createdOn and reports ambiguous or missing matches", () =>
    Effect.gen(function*() {
      const byTitle = yield* getDocumentSnapshot({
        document: DocumentIdentifier.make("Spec"),
        snapshot: DocumentSnapshotIdentifier.make("Before release"),
        teamspace: TeamspaceIdentifier.make("Docs")
      }).pipe(Effect.provide(testLayer()))
      expect(byTitle.snapshotId).toBe("snapshot-1")

      const byCreatedOn = yield* getDocumentSnapshot({
        document: DocumentIdentifier.make("Spec"),
        snapshot: DocumentSnapshotIdentifier.make("10"),
        teamspace: TeamspaceIdentifier.make("Docs")
      }).pipe(Effect.provide(testLayer()))
      expect(byCreatedOn.snapshotId).toBe("snapshot-1")

      const duplicateTitle = makeSnapshot({ _id: ref("snapshot-2") })
      const ambiguousTitle = yield* Effect.exit(
        getDocumentSnapshot({
          document: DocumentIdentifier.make("Spec"),
          snapshot: DocumentSnapshotIdentifier.make("Before release"),
          teamspace: TeamspaceIdentifier.make("Docs")
        }).pipe(Effect.provide(testLayer({}, { snapshots: [makeSnapshot(), duplicateTitle] })))
      )
      expect(Exit.isFailure(ambiguousTitle)).toBe(true)

      const duplicateDate = makeSnapshot({ _id: ref("snapshot-3"), title: "Other title" })
      const ambiguousDate = yield* Effect.exit(
        getDocumentSnapshot({
          document: DocumentIdentifier.make("Spec"),
          snapshot: DocumentSnapshotIdentifier.make("10"),
          teamspace: TeamspaceIdentifier.make("Docs")
        }).pipe(Effect.provide(testLayer({}, { snapshots: [makeSnapshot(), duplicateDate] })))
      )
      expect(Exit.isFailure(ambiguousDate)).toBe(true)

      const missing = yield* Effect.exit(
        getDocumentSnapshot({
          document: DocumentIdentifier.make("Spec"),
          snapshot: DocumentSnapshotIdentifier.make("missing"),
          teamspace: TeamspaceIdentifier.make("Docs")
        }).pipe(Effect.provide(testLayer()))
      )
      expect(Exit.isFailure(missing)).toBe(true)
    }))

  it.effect("lists and upserts project target preferences using Effect clock", () =>
    Effect.gen(function*() {
      const listedAll = yield* listProjectTargetPreferences({}).pipe(Effect.provide(testLayer()))
      expect(listedAll.total).toBe(1)

      const listed = yield* listProjectTargetPreferences({ project: ProjectIdentifier.make("PRJ") }).pipe(
        Effect.provide(testLayer())
      )
      expect(assertAt(listed.preferences, 0)).toMatchObject({
        attachedTo: "project-1",
        preferenceId: "pref-1",
        project: "PRJ",
        usedOn: 25
      })

      yield* TestClock.adjust("123 millis")
      const captures: Captures = { updateDoc: {} }
      const upserted = yield* upsertProjectTargetPreference({
        project: ProjectIdentifier.make("PRJ"),
        props: [{ key: TrackerPreferencePropertyKey.make("github:repo"), value: "repo-2" }]
      }).pipe(Effect.provide(testLayer(captures)))

      expect(upserted.created).toBe(false)
      expect(captures.updateDoc?.operations).toMatchObject({
        props: [{ key: "github:repo", value: "repo-2" }],
        usedOn: 123
      })

      const preserved = yield* upsertProjectTargetPreference({
        project: ProjectIdentifier.make("PRJ")
      }).pipe(Effect.provide(testLayer({ updateDoc: {} })))
      expect(preserved.preference.props).toEqual([{ key: "github:repo", value: "repo-1" }])

      const mixedPreference = makePreference({
        props: [
          { key: "github:repo", value: "repo-1" },
          { key: "view", value: "expanded" }
        ]
      })
      const mixed = yield* upsertProjectTargetPreference({
        project: ProjectIdentifier.make("PRJ"),
        props: [{ key: TrackerPreferencePropertyKey.make("github:repo"), value: "repo-2" }]
      }).pipe(Effect.provide(testLayer({ updateDoc: {} }, { preference: mixedPreference })))
      expect(mixed.preference.props).toEqual([
        { key: "view", value: "expanded" },
        { key: "github:repo", value: "repo-2" }
      ])
    }))

  it.effect("creates project target preferences when none exists", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust("456 millis")
      const captures: Captures = { createDoc: {} }
      const upserted = yield* upsertProjectTargetPreference({
        project: ProjectIdentifier.make("PRJ"),
        props: [{ key: TrackerPreferencePropertyKey.make("view"), value: { mode: "compact" } }]
      }).pipe(Effect.provide(testLayer(captures, { preference: undefined })))

      expect(upserted.created).toBe(true)
      expect(captures.createDoc?.space).toBe("project-1")
      expect(captures.createDoc?.attributes).toMatchObject({
        attachedTo: "project-1",
        props: [{ key: "view", value: { mode: "compact" } }],
        usedOn: 456
      })

      const empty = yield* listProjectTargetPreferences({}).pipe(
        Effect.provide(testLayer({}, { preference: undefined }))
      )
      expect(empty).toEqual({ preferences: [], total: 0 })

      const { props: _props, ...preferenceWithoutProps } = makePreference({
        attachedTo: ref("missing-project")
      })
      const unlinked = yield* listProjectTargetPreferences({}).pipe(
        Effect.provide(testLayer({}, {
          preference: preferenceWithoutProps
        }))
      )
      expect(assertAt(unlinked.preferences, 0)).toMatchObject({
        attachedTo: "missing-project",
        preferenceId: "pref-1",
        props: []
      })
      expect(unlinked.preferences[0]?.project).toBeUndefined()

      const createdWithoutProps = yield* upsertProjectTargetPreference({
        project: ProjectIdentifier.make("PRJ")
      }).pipe(Effect.provide(testLayer({}, { preference: undefined })))
      expect(createdWithoutProps.preference.props).toEqual([])
    }))

  it.effect("creates a related issue spaceRule but refuses to create a missing classRule", () =>
    Effect.gen(function*() {
      const captures: Captures = { createDoc: {} }
      const created = yield* setRelatedIssueTarget({
        space: SpaceIdentifier.make("space-1"),
        targetProject: ProjectIdentifier.make("PRJ")
      }).pipe(Effect.provide(testLayer(captures)))

      expect(created.created).toBe(true)
      expect(captures.createDoc?.space).toBe("space-1")
      expect(captures.createDoc?.attributes).toMatchObject({
        rule: { kind: "spaceRule", space: "space-1" },
        target: "project-1"
      })

      const classRuleExit = yield* Effect.exit(
        setRelatedIssueTarget({
          objectClass: ObjectClassName.make("document:class:Document"),
          targetProject: ProjectIdentifier.make("PRJ")
        }).pipe(Effect.provide(testLayer()))
      )
      expect(Exit.isFailure(classRuleExit)).toBe(true)
    }))

  it.effect("lists, updates, and deletes related issue targets", () =>
    Effect.gen(function*() {
      const spaceTarget = makeRelatedSpaceTarget()
      const classTarget = makeRelatedClassTarget()
      const rawTarget = makeRelatedClassTarget({
        _id: ref("related-class-target-2"),
        target: ref("missing-project")
      })
      const nullSpaceTarget = makeRelatedSpaceTarget({
        _id: ref("related-target-2"),
        target: null
      })
      const missingSpaceMetadataTarget = makeRelatedSpaceTarget({
        _id: ref("related-target-3"),
        rule: { kind: "spaceRule", space: ref("missing-space") }
      })

      const invalidFilter = yield* Effect.exit(
        parseListRelatedIssueTargetsParams({
          objectClass: "document:class:Document",
          space: "space-1"
        })
      )
      expect(Exit.isFailure(invalidFilter)).toBe(true)

      const validUnfiltered = yield* parseListRelatedIssueTargetsParams({})
      expect(validUnfiltered).toEqual({})

      const validSpaceLocator = yield* parseSetRelatedIssueTargetParams({
        space: "space-1",
        targetProject: null
      })
      expect(validSpaceLocator).toEqual({ space: "space-1", targetProject: null })

      const missingSetLocator = yield* Effect.exit(
        parseSetRelatedIssueTargetParams({ targetProject: null })
      )
      expect(Exit.isFailure(missingSetLocator)).toBe(true)

      const invalidSetLocator = yield* Effect.exit(
        parseSetRelatedIssueTargetParams({
          objectClass: "document:class:Document",
          space: "space-1",
          targetProject: null
        })
      )
      expect(Exit.isFailure(invalidSetLocator)).toBe(true)

      // This intentionally bypasses schema validation to exercise the operation's defensive guard
      // for callers that invoke the typed function directly with malformed data.
      const malformedSet = yield* Effect.exit(
        setRelatedIssueTarget({ targetProject: null } as Parameters<typeof setRelatedIssueTarget>[0]).pipe(
          Effect.provide(testLayer())
        )
      )
      expect(Exit.isFailure(malformedSet)).toBe(true)

      const listedAll = yield* listRelatedIssueTargets({}).pipe(
        Effect.provide(testLayer({}, { relatedTargets: [nullSpaceTarget, rawTarget, missingSpaceMetadataTarget] }))
      )
      expect(listedAll.targets.map((target) => target.targetProject)).toEqual([null, "missing-project", "PRJ"])
      expect(listedAll.targets[2]?.rule).toEqual({
        kind: "spaceRule",
        spaceId: "missing-space"
      })

      const listedSpace = yield* listRelatedIssueTargets({ space: SpaceIdentifier.make("space-1") }).pipe(
        Effect.provide(testLayer({}, { relatedTargets: [spaceTarget, classTarget] }))
      )
      expect(assertAt(listedSpace.targets, 0)).toMatchObject({
        rule: { kind: "spaceRule", spaceId: "space-1" },
        targetProject: "PRJ"
      })

      const listedClass = yield* listRelatedIssueTargets({
        objectClass: ObjectClassName.make("document:class:Document")
      }).pipe(Effect.provide(testLayer({}, { relatedTargets: [spaceTarget, classTarget] })))
      expect(assertAt(listedClass.targets, 0)).toMatchObject({
        rule: { kind: "classRule", objectClass: "document:class:Document" },
        targetProject: "PRJ"
      })

      const captures: Captures = { removeDoc: {}, updateDoc: {} }
      const updatedSpace = yield* setRelatedIssueTarget({
        space: SpaceIdentifier.make("space-1"),
        targetProject: null
      }).pipe(Effect.provide(testLayer(captures, { relatedTargets: [spaceTarget] })))
      expect(updatedSpace.created).toBe(false)
      expect(captures.updateDoc?.operations).toEqual({ target: null })

      const updatedClass = yield* setRelatedIssueTarget({
        objectClass: ObjectClassName.make("document:class:Document"),
        targetProject: ProjectIdentifier.make("PRJ")
      }).pipe(Effect.provide(testLayer(captures, { relatedTargets: [classTarget] })))
      expect(updatedClass.created).toBe(false)

      const deleted = yield* deleteRelatedIssueSpaceTarget({ space: SpaceIdentifier.make("space-1") }).pipe(
        Effect.provide(testLayer(captures, { relatedTargets: [spaceTarget] }))
      )
      expect(deleted).toEqual({ deleted: true, targetId: "related-target-1" })
      expect(captures.removeDoc).toMatchObject({ id: "related-target-1", space: "space-1" })

      const missingDelete = yield* Effect.exit(
        deleteRelatedIssueSpaceTarget({ space: SpaceIdentifier.make("space-1") }).pipe(
          Effect.provide(testLayer())
        )
      )
      expect(Exit.isFailure(missingDelete)).toBe(true)
    }))
})
