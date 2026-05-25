import { describe, it } from "@effect/vitest"
import type {
  Association as HulyAssociation,
  Doc,
  FindResult,
  PersonId,
  Ref,
  Relation as HulyRelation,
  Space
} from "@hcengineering/core"
import { SortingOrder, toFindResult } from "@hcengineering/core"
import type { Document as HulyDocument } from "@hcengineering/document"
import type { Issue as HulyIssue } from "@hcengineering/tracker"
import { Effect } from "effect"
import { expect } from "vitest"

import { AssociationIdentifier } from "../../../src/domain/schemas/generic-associations.js"
import { MAX_LIMIT, ObjectClassName } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  AssociationIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  RelationEndpointClassMismatchError,
  RelationMutationUnsupportedError
} from "../../../src/huly/errors.js"
import { core, documentPlugin, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createRelation,
  deleteRelation,
  listAssociations,
  listRelations
} from "../../../src/huly/operations/generic-associations.js"
import { docId, documentIdentifier, issueIdentifier } from "../../helpers/brands.js"

const person = "person-1" as PersonId
const space = "space-1" as Ref<Space>
const assocId = AssociationIdentifier.make("assoc-1")
const relatesAssociation = AssociationIdentifier.make("relates")
const issueClass = ObjectClassName.make(tracker.class.Issue)
const documentClass = ObjectClassName.make(documentPlugin.class.Document)

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK fixture builder
const association = (overrides: Partial<HulyAssociation>): HulyAssociation => ({
  _id: "assoc-1" as Ref<HulyAssociation>,
  _class: core.class.Association,
  space,
  modifiedBy: person,
  modifiedOn: 100,
  createdBy: person,
  createdOn: 100,
  classA: tracker.class.Issue,
  classB: tracker.class.Issue,
  nameA: "relates",
  nameB: "relates",
  type: "N:N",
  ...overrides
} as HulyAssociation)

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK fixture builder
const relation = (overrides: Partial<HulyRelation>): HulyRelation => ({
  _id: "rel-1" as Ref<HulyRelation>,
  _class: core.class.Relation,
  space,
  modifiedBy: person,
  modifiedOn: 200,
  createdBy: person,
  createdOn: 200,
  docA: "issue-1" as Ref<Doc>,
  docB: "issue-2" as Ref<Doc>,
  association: "assoc-1" as Ref<HulyAssociation>,
  ...overrides
} as HulyRelation)

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK fixture builder
const issue = (id: string, identifier: string): HulyIssue => ({
  _id: id as Ref<HulyIssue>,
  _class: tracker.class.Issue,
  space,
  modifiedBy: person,
  modifiedOn: 100,
  createdBy: person,
  createdOn: 100,
  title: identifier,
  identifier,
  number: 1
} as HulyIssue)

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK fixture builder
const documentDoc = (id: string, title: string): HulyDocument => ({
  _id: id as Ref<HulyDocument>,
  _class: documentPlugin.class.Document,
  space,
  modifiedBy: person,
  modifiedOn: 100,
  createdBy: person,
  createdOn: 100,
  title
} as HulyDocument)

interface TestData {
  readonly associations?: ReadonlyArray<HulyAssociation>
  readonly relations?: ReadonlyArray<HulyRelation>
  readonly issues?: ReadonlyArray<HulyIssue>
  readonly documents?: ReadonlyArray<HulyDocument>
}

type FindAllObserver = (
  request: {
    readonly _class: unknown
    readonly query: unknown
    readonly options: unknown
  }
) => void

const matchesQuery = (doc: Doc, query: Record<string, unknown>): boolean =>
  Object.entries(query).every(([key, value]) => {
    if (typeof value === "object" && value !== null && "$in" in value) {
      const values = Reflect.get(value, "$in")
      return Array.isArray(values) && values.includes(Reflect.get(doc, key))
    }
    return Reflect.get(doc, key) === value
  })

const getProperty = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined

const resultFor = <T extends Doc>(
  docs: ReadonlyArray<T>,
  query: unknown,
  options: unknown
): FindResult<T> => {
  const q = query as Record<string, unknown>
  const opts = options as { limit?: number; sort?: { modifiedOn?: SortingOrder } } | undefined
  const matches = docs.filter((doc) => matchesQuery(doc, q))
  const sorted = opts?.sort?.modifiedOn === SortingOrder.Descending
    ? [...matches].sort((left, right) => right.modifiedOn - left.modifiedOn)
    : matches
  return toFindResult(sorted.slice(0, opts?.limit), matches.length)
}

const testLayer = (data: TestData, onFindAll?: FindAllObserver) => {
  const associations = data.associations ?? []
  const relations = data.relations ?? []
  const issues = data.issues ?? []
  const documents = data.documents ?? []

  const findAll: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    onFindAll?.({ _class, query, options })
    if (_class === core.class.Association) {
      return Effect.succeed(resultFor(associations, query, options))
    }
    if (_class === core.class.Relation) {
      return Effect.succeed(resultFor(relations, query, options))
    }
    if (_class === tracker.class.Issue) {
      return Effect.succeed(resultFor(issues, query, options))
    }
    if (_class === documentPlugin.class.Document) {
      return Effect.succeed(resultFor(documents, query, options))
    }
    return Effect.succeed(toFindResult([]))
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] = ((_class: unknown, query: unknown) => {
    const q = query as Record<string, unknown>
    if (_class === core.class.Association) {
      return Effect.succeed(associations.find((doc) => matchesQuery(doc, q)))
    }
    if (_class === tracker.class.Issue) {
      return Effect.succeed(issues.find((doc) => matchesQuery(doc, q)))
    }
    if (_class === documentPlugin.class.Document) {
      return Effect.succeed(documents.find((doc) => matchesQuery(doc, q)))
    }
    if (_class === core.class.Relation) {
      return Effect.succeed(relations.find((doc) => matchesQuery(doc, q)))
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({ findAll, findOne })
}

describe("listAssociations", () => {
  it.effect("lists visible associations and hides core system associations by default", () =>
    Effect.gen(function*() {
      const visible = association({ _id: "assoc-visible" as Ref<HulyAssociation> })
      const system = association({
        _id: "assoc-system" as Ref<HulyAssociation>,
        classA: core.class.Doc,
        classB: core.class.Doc
      })

      const result = yield* listAssociations({}).pipe(
        Effect.provide(testLayer({ associations: [visible, system] }))
      )

      expect(result.associations.map((item) => item.associationId)).toEqual(["assoc-visible"])
      expect(result.associations[0].sourceClassLabel).toBe("Issue")
      expect(result.associations[0].targetClassLabel).toBe("Issue")
      expect(result.associations[0].canListRelations).toBe(true)
      expect(result.associations[0].canCreateRelation).toBe(false)
    }))

  it.effect("applies limit after hiding system associations", () =>
    Effect.gen(function*() {
      const system1 = association({
        _id: "assoc-system-1" as Ref<HulyAssociation>,
        classA: core.class.Doc,
        classB: core.class.Doc
      })
      const system2 = association({
        _id: "assoc-system-2" as Ref<HulyAssociation>,
        classA: core.class.Doc,
        classB: core.class.Doc
      })
      const visible = association({ _id: "assoc-visible" as Ref<HulyAssociation> })

      const result = yield* listAssociations({ limit: 1 }).pipe(
        Effect.provide(testLayer({ associations: [system1, system2, visible] }))
      )

      expect(result.associations.map((item) => item.associationId)).toEqual(["assoc-visible"])
      expect(result.total).toBe(1)
    }))

  it.effect("maps SDK association type to public cardinality", () =>
    Effect.gen(function*() {
      const result = yield* listAssociations({}).pipe(
        Effect.provide(testLayer({
          associations: [
            association({ _id: "assoc-1-1" as Ref<HulyAssociation>, type: "1:1" }),
            association({ _id: "assoc-1-n" as Ref<HulyAssociation>, type: "1:N" }),
            association({ _id: "assoc-n-n" as Ref<HulyAssociation>, type: "N:N" })
          ]
        }))
      )

      expect(result.associations.map((item) => item.cardinality)).toEqual([
        "one-to-one",
        "one-to-many",
        "many-to-many"
      ])
    }))

  it.effect("returns no writable associations until a write allowlist exists", () =>
    Effect.gen(function*() {
      const result = yield* listAssociations({ writableOnly: true }).pipe(
        Effect.provide(testLayer({ associations: [association({})] }))
      )

      expect(result.associations).toEqual([])
      expect(result.total).toBe(0)
    }))

  it.effect("resolves a selected association before applying writableOnly filtering", () =>
    Effect.gen(function*() {
      const result = yield* listAssociations({ association: assocId, writableOnly: true }).pipe(
        Effect.provide(testLayer({ associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })] }))
      )

      expect(result.associations).toEqual([])
      expect(result.total).toBe(0)
    }))

  it.effect("resolves a selected association ID beyond the discovery window", () =>
    Effect.gen(function*() {
      const nonMatches = Array.from({ length: 205 }, (_, index) =>
        association({
          _id: `assoc-other-${index}` as Ref<HulyAssociation>,
          nameA: `other-${index}`,
          nameB: `other-${index}`
        }))
      const target = association({
        _id: "assoc-target" as Ref<HulyAssociation>,
        nameA: "outside-window",
        nameB: "outside-window"
      })

      const result = yield* listAssociations({ association: AssociationIdentifier.make("assoc-target") }).pipe(
        Effect.provide(testLayer({ associations: [...nonMatches, target] }))
      )

      expect(result.associations.map((item) => item.associationId)).toEqual(["assoc-target"])
    }))

  it.effect("resolves a selected association name beyond the discovery window", () =>
    Effect.gen(function*() {
      const nonMatches = Array.from({ length: 205 }, (_, index) =>
        association({
          _id: `assoc-other-${index}` as Ref<HulyAssociation>,
          nameA: `other-${index}`,
          nameB: `other-${index}`
        }))
      const target = association({
        _id: "assoc-target" as Ref<HulyAssociation>,
        nameA: "outside-window",
        nameB: "outside-window"
      })

      const result = yield* listAssociations({ association: AssociationIdentifier.make("outside-window") }).pipe(
        Effect.provide(testLayer({ associations: [...nonMatches, target] }))
      )

      expect(result.associations.map((item) => item.associationId)).toEqual(["assoc-target"])
    }))

  it.effect("applies class filters before limiting selected association name lookups", () =>
    Effect.gen(function*() {
      const target = association({
        _id: "assoc-target" as Ref<HulyAssociation>,
        classA: documentPlugin.class.Document,
        classB: documentPlugin.class.Document
      })

      const result = yield* listAssociations({
        association: relatesAssociation,
        sourceClass: documentClass,
        targetClass: documentClass
      }).pipe(
        Effect.provide(testLayer({
          associations: [
            association({ _id: "assoc-issue-1" as Ref<HulyAssociation> }),
            association({ _id: "assoc-issue-2" as Ref<HulyAssociation> }),
            target
          ]
        }))
      )

      expect(result.associations.map((item) => item.associationId)).toEqual(["assoc-target"])
      expect(result.associations[0].sourceClassLabel).toBe("Document")
      expect(result.associations[0].targetClassLabel).toBe("Document")
    }))

  it.effect("fails on ambiguous association names", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listAssociations({ association: relatesAssociation }).pipe(
          Effect.provide(testLayer({
            associations: [
              association({ _id: "assoc-1" as Ref<HulyAssociation> }),
              association({ _id: "assoc-2" as Ref<HulyAssociation> })
            ]
          }))
        )
      )

      expect(error).toBeInstanceOf(AssociationIdentifierAmbiguousError)
    }))

  it.effect("caps exact-name lookup queries while detecting ambiguity", () =>
    Effect.gen(function*() {
      const lookupLimits: Array<number | undefined> = []
      const error = yield* Effect.flip(
        listAssociations({ association: relatesAssociation }).pipe(
          Effect.provide(testLayer(
            {
              associations: [
                association({ _id: "assoc-1" as Ref<HulyAssociation> }),
                association({ _id: "assoc-2" as Ref<HulyAssociation> }),
                association({ _id: "assoc-3" as Ref<HulyAssociation> })
              ]
            },
            ({ _class, options }) => {
              if (_class === core.class.Association) {
                const limit = typeof options === "object" && options !== null
                  ? Reflect.get(options, "limit")
                  : undefined
                lookupLimits.push(typeof limit === "number" ? limit : undefined)
              }
            }
          ))
        )
      )

      expect(error).toBeInstanceOf(AssociationIdentifierAmbiguousError)
      expect(lookupLimits).toEqual([2, 2])
    }))
})

describe("listRelations", () => {
  it.effect("lists relation instances with resolved endpoint display", () =>
    Effect.gen(function*() {
      const assoc = association({ _id: "assoc-1" as Ref<HulyAssociation> })
      const rel = relation({})

      const result = yield* listRelations({
        association: assocId,
        source: { kind: "raw", id: docId("issue-1"), class: issueClass },
        target: { kind: "raw", id: docId("issue-2"), class: issueClass }
      }).pipe(
        Effect.provide(testLayer({
          associations: [assoc],
          relations: [rel],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].relationId).toBe("rel-1")
      expect(result.relations[0].source.display).toBe("HULY-1")
      expect(result.relations[0].target.display).toBe("HULY-2")
    }))

  it.effect("matches symmetric associations in either direction", () =>
    Effect.gen(function*() {
      const assoc = association({ _id: "assoc-1" as Ref<HulyAssociation> })
      const rel = relation({})

      const result = yield* listRelations({
        association: assocId,
        source: { kind: "raw", id: docId("issue-2"), class: issueClass },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass },
        direction: "either"
      }).pipe(
        Effect.provide(testLayer({
          associations: [assoc],
          relations: [rel],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].relationId).toBe("rel-1")
    }))

  it.effect("validates reversed endpoints against asymmetric association classes", () =>
    Effect.gen(function*() {
      const issueToDocument = association({
        _id: "assoc-1" as Ref<HulyAssociation>,
        classA: tracker.class.Issue,
        classB: documentPlugin.class.Document,
        nameA: "issue",
        nameB: "document",
        type: "1:N"
      })
      const rel = relation({
        docA: "issue-1" as Ref<Doc>,
        docB: "doc-1" as Ref<Doc>
      })

      const result = yield* listRelations({
        association: assocId,
        source: { kind: "raw", id: docId("doc-1"), class: documentClass },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass },
        direction: "target-to-source"
      }).pipe(
        Effect.provide(testLayer({
          associations: [issueToDocument],
          relations: [rel],
          issues: [issue("issue-1", "HULY-1")],
          documents: [documentDoc("doc-1", "Spec")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].source.display).toBe("HULY-1")
      expect(result.relations[0].target.display).toBe("Spec")
    }))

  it.effect("matches asymmetric associations in either direction", () =>
    Effect.gen(function*() {
      const issueToDocument = association({
        _id: "assoc-1" as Ref<HulyAssociation>,
        classA: tracker.class.Issue,
        classB: documentPlugin.class.Document,
        nameA: "issue",
        nameB: "document",
        type: "1:N"
      })
      const rel = relation({
        docA: "issue-1" as Ref<Doc>,
        docB: "doc-1" as Ref<Doc>
      })

      const result = yield* listRelations({
        association: assocId,
        source: { kind: "raw", id: docId("doc-1"), class: documentClass },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass },
        direction: "either"
      }).pipe(
        Effect.provide(testLayer({
          associations: [issueToDocument],
          relations: [rel],
          issues: [issue("issue-1", "HULY-1")],
          documents: [documentDoc("doc-1", "Spec")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].relationId).toBe("rel-1")
      expect(result.relations[0].source.display).toBe("HULY-1")
      expect(result.relations[0].target.display).toBe("Spec")
    }))

  it.effect("matches omitted asymmetric associations in either direction", () =>
    Effect.gen(function*() {
      const issueToDocument = association({
        _id: "assoc-1" as Ref<HulyAssociation>,
        classA: tracker.class.Issue,
        classB: documentPlugin.class.Document,
        nameA: "issue",
        nameB: "document",
        type: "1:N"
      })
      const rel = relation({
        docA: "issue-1" as Ref<Doc>,
        docB: "doc-1" as Ref<Doc>
      })

      const result = yield* listRelations({
        source: { kind: "raw", id: docId("doc-1"), class: documentClass },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass },
        direction: "either"
      }).pipe(
        Effect.provide(testLayer({
          associations: [issueToDocument],
          relations: [rel],
          issues: [issue("issue-1", "HULY-1")],
          documents: [documentDoc("doc-1", "Spec")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].relationId).toBe("rel-1")
      expect(result.relations[0].source.display).toBe("HULY-1")
      expect(result.relations[0].target.display).toBe("Spec")
    }))

  it.effect("deduplicates omitted same-class association discovery in either direction", () =>
    Effect.gen(function*() {
      const findAllRequests: Array<Parameters<FindAllObserver>[0]> = []
      const rel = relation({})

      const result = yield* listRelations({
        source: { kind: "raw", id: docId("issue-1"), class: issueClass },
        target: { kind: "raw", id: docId("issue-2"), class: issueClass },
        direction: "either"
      }).pipe(
        Effect.provide(testLayer({
          associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
          relations: [rel],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }, (request) => {
          findAllRequests.push(request)
        }))
      )

      expect(result.total).toBe(1)
      expect(findAllRequests.filter((request) => request._class === core.class.Association)).toHaveLength(1)
      expect(findAllRequests.filter((request) => request._class === core.class.Relation)).toHaveLength(2)
    }))

  it.effect("skips incompatible associations when association is omitted", () =>
    Effect.gen(function*() {
      const documentAssociation = association({
        _id: "assoc-doc" as Ref<HulyAssociation>,
        classA: documentPlugin.class.Document,
        classB: documentPlugin.class.Document
      })
      const issueAssociation = association({ _id: "assoc-1" as Ref<HulyAssociation> })
      const rel = relation({})

      const result = yield* listRelations({
        source: { kind: "raw", id: docId("issue-1"), class: issueClass }
      }).pipe(
        Effect.provide(testLayer({
          associations: [documentAssociation, issueAssociation],
          relations: [rel],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].associationId).toBe("assoc-1")
    }))

  it.effect("does not fan out relation queries by discovered associations when association is omitted", () =>
    Effect.gen(function*() {
      const findAllRequests: Array<Parameters<FindAllObserver>[0]> = []
      const associations = Array.from({ length: 20 }, (_, index) =>
        association({
          _id: `assoc-extra-${index}` as Ref<HulyAssociation>,
          classA: tracker.class.Issue,
          classB: tracker.class.Issue
        }))
      const issueAssociation = association({ _id: "assoc-1" as Ref<HulyAssociation> })
      const rel = relation({})

      const result = yield* listRelations({
        source: { kind: "raw", id: docId("issue-1"), class: issueClass }
      }).pipe(
        Effect.provide(testLayer({
          associations: [...associations, issueAssociation],
          relations: [rel],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }, (request) => {
          findAllRequests.push(request)
        }))
      )

      const associationRequests = findAllRequests.filter((request) => request._class === core.class.Association)
      const relationRequests = findAllRequests.filter((request) => request._class === core.class.Relation)
      const issueRequests = findAllRequests.filter((request) => request._class === tracker.class.Issue)
      const associationFilter = getProperty(relationRequests[0]?.query, "association")

      expect(result.total).toBe(1)
      expect(relationRequests).toHaveLength(1)
      expect(associationRequests).toHaveLength(1)
      expect(issueRequests).toHaveLength(1)
      expect(getProperty(associationRequests[0]?.query, "classA")).toBe(tracker.class.Issue)
      expect(getProperty(associationRequests[0]?.query, "classB")).toBeUndefined()
      expect(getProperty(associationFilter, "$in")).toContain("assoc-1")
    }))

  it.effect("applies the relation limit after filtering hidden associations when association is omitted", () =>
    Effect.gen(function*() {
      const systemAssociation = association({
        _id: "assoc-system" as Ref<HulyAssociation>,
        classA: tracker.class.Issue,
        classB: core.class.Doc
      })
      const visibleAssociation = association({ _id: "assoc-1" as Ref<HulyAssociation> })
      const hiddenRelation = relation({
        _id: "rel-hidden" as Ref<HulyRelation>,
        association: "assoc-system" as Ref<HulyAssociation>,
        docB: "core-doc-1" as Ref<Doc>,
        modifiedOn: 300
      })
      const visibleRelation = relation({
        _id: "rel-visible" as Ref<HulyRelation>,
        association: "assoc-1" as Ref<HulyAssociation>,
        modifiedOn: 100
      })

      const result = yield* listRelations({
        source: { kind: "raw", id: docId("issue-1"), class: issueClass },
        limit: 1
      }).pipe(
        Effect.provide(testLayer({
          associations: [systemAssociation, visibleAssociation],
          relations: [hiddenRelation, visibleRelation],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].associationId).toBe("assoc-1")
    }))

  it.effect("discovers newest compatible associations before applying the association window", () =>
    Effect.gen(function*() {
      const olderAssociations = Array.from({ length: MAX_LIMIT }, (_, index) =>
        association({
          _id: `assoc-old-${index}` as Ref<HulyAssociation>,
          modifiedOn: index
        }))
      const visibleAssociation = association({
        _id: "assoc-1" as Ref<HulyAssociation>,
        modifiedOn: MAX_LIMIT + 1
      })
      const rel = relation({})

      const result = yield* listRelations({
        source: { kind: "raw", id: docId("issue-1"), class: issueClass },
        limit: 1
      }).pipe(
        Effect.provide(testLayer({
          associations: [...olderAssociations, visibleAssociation],
          relations: [rel],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].associationId).toBe("assoc-1")
    }))

  it.effect("warns when omitted-association discovery reaches the association cap", () =>
    Effect.gen(function*() {
      const cappedAssociations = Array.from({ length: MAX_LIMIT }, (_, index) =>
        association({
          _id: `assoc-${index}` as Ref<HulyAssociation>,
          modifiedOn: MAX_LIMIT - index
        }))
      const rel = relation({ association: "assoc-0" as Ref<HulyAssociation> })

      const result = yield* listRelations({
        source: { kind: "raw", id: docId("issue-1"), class: issueClass }
      }).pipe(
        Effect.provide(testLayer({
          associations: cappedAssociations,
          relations: [rel],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings?.[0]).toContain(`${MAX_LIMIT}-association cap`)
    }))

  it.effect("does not warn when an explicit association is provided", () =>
    Effect.gen(function*() {
      const cappedAssociations = Array.from({ length: MAX_LIMIT }, (_, index) =>
        association({
          _id: `assoc-${index}` as Ref<HulyAssociation>,
          modifiedOn: MAX_LIMIT - index
        }))
      const rel = relation({})

      const result = yield* listRelations({
        association: assocId,
        source: { kind: "raw", id: docId("issue-1"), class: issueClass }
      }).pipe(
        Effect.provide(testLayer({
          associations: cappedAssociations,
          relations: [rel],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.warnings).toBeUndefined()
    }))

  it.effect("chunks endpoint hydration by class instead of hydrating per relation", () =>
    Effect.gen(function*() {
      const findAllRequests: Array<Parameters<FindAllObserver>[0]> = []
      const relations = Array.from({ length: MAX_LIMIT }, (_, index) =>
        relation({
          _id: `rel-${index}` as Ref<HulyRelation>,
          docA: "issue-0" as Ref<Doc>,
          docB: `issue-${index + 1}` as Ref<Doc>,
          modifiedOn: 300 - index
        }))
      const issues = Array.from({ length: MAX_LIMIT + 1 }, (_, index) => issue(`issue-${index}`, `HULY-${index}`))

      const result = yield* listRelations({
        association: assocId,
        source: { kind: "raw", id: docId("issue-0"), class: issueClass },
        limit: MAX_LIMIT
      }).pipe(
        Effect.provide(testLayer({
          associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
          relations,
          issues
        }, (request) => {
          findAllRequests.push(request)
        }))
      )

      const issueHydrationRequests = findAllRequests.filter((request) => request._class === tracker.class.Issue)
      const chunkSizes = issueHydrationRequests.map((request) => {
        const ids = getProperty(getProperty(request.query, "_id"), "$in")
        return Array.isArray(ids) ? ids.length : 0
      })

      expect(result.total).toBe(MAX_LIMIT)
      expect(issueHydrationRequests).toHaveLength(2)
      expect(chunkSizes.sort((left, right) => left - right)).toEqual([1, MAX_LIMIT])
      expect(findAllRequests.filter((request) => request._class === core.class.Relation)).toHaveLength(1)
    }))

  it.effect("fails when a locator resolves to the wrong endpoint class", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          association: assocId,
          source: { kind: "raw", id: docId("doc-1"), class: documentClass }
        }).pipe(
          Effect.provide(testLayer({
            associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
            documents: [documentDoc("doc-1", "Spec")]
          }))
        )
      )

      expect(error).toBeInstanceOf(RelationEndpointClassMismatchError)
    }))

  it.effect("fails with typed invalid locator error for raw locators without a known class", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: { kind: "raw", id: docId("issue-1") }
        }).pipe(Effect.provide(testLayer({ associations: [association({})] })))
      )

      expect(error).toBeInstanceOf(GenericObjectLocatorInvalidError)
    }))

  it.effect("fails with typed not found error for missing raw objects", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          association: assocId,
          source: { kind: "raw", id: docId("missing-issue"), class: issueClass }
        }).pipe(Effect.provide(testLayer({ associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })] })))
      )

      expect(error).toBeInstanceOf(GenericObjectNotFoundError)
    }))

  it.effect("fails with typed invalid locator error for issue locators without project or full key", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: { kind: "issue", issue: issueIdentifier("123") }
        }).pipe(Effect.provide(testLayer({ associations: [association({})] })))
      )

      expect(error).toBeInstanceOf(GenericObjectLocatorInvalidError)
    }))

  it.effect("fails with typed not found error for missing documents without teamspace", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: { kind: "document", document: documentIdentifier("Missing Spec") }
        }).pipe(Effect.provide(testLayer({ associations: [association({})] })))
      )

      expect(error).toBeInstanceOf(GenericObjectNotFoundError)
    }))
})

describe("relation mutations", () => {
  it.effect("createRelation fails clearly while writes are unsupported", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("issue-2"), class: issueClass }
        }).pipe(Effect.provide(testLayer({ associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })] })))
      )

      expect(error).toBeInstanceOf(RelationMutationUnsupportedError)
    }))

  it.effect("deleteRelation rejects validated association deletes while writes are unsupported", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        deleteRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("issue-2"), class: issueClass }
        }).pipe(Effect.provide(testLayer({ associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })] })))
      )

      expect(error).toBeInstanceOf(RelationMutationUnsupportedError)
    }))
})
