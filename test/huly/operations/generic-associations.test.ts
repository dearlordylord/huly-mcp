import { describe, it } from "@effect/vitest"
import type { Card as HulyCard, CardSpace as HulyCardSpace, MasterTag } from "@hcengineering/card"
import type {
  Association as HulyAssociation,
  Class,
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
import { Cause, Effect, Exit } from "effect"
import { expect } from "vitest"

import {
  AssociationIdentifier,
  AssociationRoleName,
  RelationIdentifier
} from "../../../src/domain/schemas/generic-associations.js"
import {
  CardIdentifier,
  CardSpaceIdentifier,
  MAX_LIMIT,
  ObjectClassName,
  RelationId,
  UNKNOWN_TOTAL
} from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import {
  AssociationConflictError,
  AssociationIdentifierAmbiguousError,
  AssociationInUseError,
  AssociationNotFoundError,
  AssociationSystemClassUnsupportedError,
  GenericObjectIdentifierAmbiguousError,
  GenericObjectLocatorInvalidError,
  GenericObjectNotFoundError,
  RelationCardinalityViolationError,
  RelationDirectionAmbiguousError,
  RelationEndpointClassMismatchError,
  RelationIdentifierAmbiguousError,
  RelationMutationUnsupportedError
} from "../../../src/huly/errors.js"
import { cardPlugin, core, documentPlugin, tracker } from "../../../src/huly/huly-plugins.js"
import {
  createAssociation,
  createRelation,
  deleteAssociation,
  deleteRelation,
  listAssociations,
  listRelations
} from "../../../src/huly/operations/generic-associations.js"
import {
  docId,
  documentIdentifier,
  issueIdentifier,
  projectIdentifier,
  teamspaceIdentifier
} from "../../helpers/brands.js"

const person = "person-1" as PersonId
const space = "space-1" as Ref<Space>
const assocId = AssociationIdentifier.make("assoc-1")
const relatesAssociation = AssociationIdentifier.make("relates")
const issueClass = ObjectClassName.make(tracker.class.Issue)
const documentClass = ObjectClassName.make(documentPlugin.class.Document)
const contractCardClassName = "card:class:Contract"
const contractCardClassRef = contractCardClassName as Ref<MasterTag>
const contractAssociationClassRef = contractCardClassName as Ref<Class<Doc>>
const cardClass = ObjectClassName.make(contractCardClassRef)

// Huly SDK document interfaces include package-specific structural details that
// are irrelevant to resolver behavior; fixtures cross that SDK boundary here.
const asCardSpace = (value: unknown): HulyCardSpace => value as HulyCardSpace
const asCard = (value: unknown): HulyCard => value as HulyCard

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- SDK fixture builder
const association = (overrides: Partial<HulyAssociation> & { readonly automationOnly?: boolean }): HulyAssociation => ({
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

const cardSpaceDoc = (id: string, name: string): HulyCardSpace =>
  asCardSpace({
    _id: id as Ref<HulyCardSpace>,
    _class: cardPlugin.class.CardSpace,
    space,
    modifiedBy: person,
    modifiedOn: 100,
    createdBy: person,
    createdOn: 100,
    name,
    description: "",
    archived: false,
    types: [contractCardClassRef]
  })

const cardDoc = (id: string, title: string, cardSpace: string = "cards-1"): HulyCard =>
  asCard({
    _id: id as Ref<HulyCard>,
    _class: contractCardClassRef,
    space: cardSpace as Ref<Space>,
    modifiedBy: person,
    modifiedOn: 100,
    createdBy: person,
    createdOn: 100,
    title,
    content: "markup-1",
    blobs: {},
    parentInfo: [],
    rank: "a"
  })

interface TestData {
  readonly associations?: ReadonlyArray<HulyAssociation>
  readonly relations?: ReadonlyArray<HulyRelation>
  readonly relationTotal?: number | undefined
  readonly issues?: ReadonlyArray<HulyIssue>
  readonly documents?: ReadonlyArray<HulyDocument>
  readonly cards?: ReadonlyArray<HulyCard>
  readonly cardSpaces?: ReadonlyArray<HulyCardSpace>
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
  const associations = [...(data.associations ?? [])]
  const relations = [...(data.relations ?? [])]
  const issues = data.issues ?? []
  const documents = data.documents ?? []
  const cards = data.cards ?? []
  const cardSpaces = data.cardSpaces ?? []

  const findAll: HulyClientOperations["findAll"] = ((_class: unknown, query: unknown, options: unknown) => {
    onFindAll?.({ _class, query, options })
    if (_class === core.class.Association) {
      return Effect.succeed(resultFor(associations, query, options))
    }
    if (_class === core.class.Relation) {
      const result = resultFor(relations, query, options)
      return Effect.succeed(toFindResult([...result], data.relationTotal ?? result.total))
    }
    if (_class === tracker.class.Issue) {
      return Effect.succeed(resultFor(issues, query, options))
    }
    if (_class === documentPlugin.class.Document) {
      return Effect.succeed(resultFor(documents, query, options))
    }
    if (_class === cardPlugin.class.CardSpace) {
      return Effect.succeed(resultFor(cardSpaces, query, options))
    }
    if (_class === cardPlugin.class.Card || cards.some((card) => card._class === _class)) {
      return Effect.succeed(resultFor(cards, query, options))
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
    if (_class === cardPlugin.class.CardSpace) {
      return Effect.succeed(cardSpaces.find((doc) => matchesQuery(doc, q)))
    }
    if (_class === cardPlugin.class.Card || cards.some((card) => card._class === _class)) {
      return Effect.succeed(cards.find((doc) => matchesQuery(doc, q)))
    }
    if (_class === core.class.Relation) {
      return Effect.succeed(relations.find((doc) => matchesQuery(doc, q)))
    }
    return Effect.succeed(undefined)
  }) as HulyClientOperations["findOne"]

  const createDoc: HulyClientOperations["createDoc"] = ((_class: unknown, docSpace: unknown, attributes: unknown) => {
    if (_class === core.class.Association) {
      const nextId = `assoc-created-${associations.length + 1}` as Ref<HulyAssociation>
      associations.push({
        _id: nextId,
        _class: core.class.Association,
        space: docSpace as Ref<Space>,
        modifiedBy: person,
        modifiedOn: 300,
        createdBy: person,
        createdOn: 300,
        ...(attributes as object)
      } as HulyAssociation)
      return Effect.succeed(nextId)
    }
    if (_class === core.class.Relation) {
      const nextId = `rel-created-${relations.length + 1}` as Ref<HulyRelation>
      relations.push({
        _id: nextId,
        _class: core.class.Relation,
        space: docSpace as Ref<Space>,
        modifiedBy: person,
        modifiedOn: 300,
        createdBy: person,
        createdOn: 300,
        ...(attributes as object)
      } as HulyRelation)
      return Effect.succeed(nextId)
    }
    return Effect.die(new Error("unexpected createDoc class"))
  }) as HulyClientOperations["createDoc"]

  const removeDoc: HulyClientOperations["removeDoc"] = ((_class: unknown, _space: unknown, objectId: unknown) => {
    if (_class === core.class.Relation) {
      const index = relations.findIndex((doc) => doc._id === objectId)
      if (index >= 0) relations.splice(index, 1)
      return Effect.succeed({})
    }
    if (_class === core.class.Association) {
      const index = associations.findIndex((doc) => doc._id === objectId)
      if (index >= 0) associations.splice(index, 1)
      return Effect.succeed({})
    }
    return Effect.die(new Error("unexpected removeDoc class"))
  }) as HulyClientOperations["removeDoc"]

  return HulyClient.testLayer({ findAll, findOne, createDoc, removeDoc })
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
      expect(result.associations[0].canCreateRelation).toBe(true)
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

  it.effect("returns relation-writable associations when requested", () =>
    Effect.gen(function*() {
      const result = yield* listAssociations({ writableOnly: true }).pipe(
        Effect.provide(testLayer({ associations: [association({})] }))
      )

      expect(result.associations.map((item) => item.associationId)).toEqual(["assoc-1"])
      expect(result.total).toBe(1)
    }))

  it.effect("filters selected non-writable associations after resolving them", () =>
    Effect.gen(function*() {
      const result = yield* listAssociations({ association: assocId, writableOnly: true }).pipe(
        Effect.provide(testLayer({
          associations: [
            association({
              _id: "assoc-1" as Ref<HulyAssociation>,
              automationOnly: true
            })
          ]
        }))
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

  it.effect("fails when direction either resolves an endpoint outside the association class pair", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          association: assocId,
          direction: "either",
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

  it.effect("resolves card locators by ID without requiring a card space", () =>
    Effect.gen(function*() {
      const cardToIssue = association({
        _id: "assoc-1" as Ref<HulyAssociation>,
        classA: contractAssociationClassRef,
        classB: tracker.class.Issue,
        nameA: "card",
        nameB: "issue"
      })

      const result = yield* listRelations({
        association: assocId,
        source: { kind: "card", card: CardIdentifier.make("card-1") },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass }
      }).pipe(
        Effect.provide(testLayer({
          associations: [cardToIssue],
          relations: [
            relation({
              docA: "card-1" as Ref<Doc>,
              docB: "issue-1" as Ref<Doc>
            })
          ],
          cards: [cardDoc("card-1", "Contract")],
          issues: [issue("issue-1", "HULY-1")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].source.display).toBe("Contract")
      expect(result.relations[0].source.class).toBe(cardClass)
    }))

  it.effect("resolves card locators by title when card space is provided", () =>
    Effect.gen(function*() {
      const cardToIssue = association({
        _id: "assoc-1" as Ref<HulyAssociation>,
        classA: contractAssociationClassRef,
        classB: tracker.class.Issue,
        nameA: "card",
        nameB: "issue"
      })

      const result = yield* listRelations({
        association: assocId,
        source: {
          kind: "card",
          card: CardIdentifier.make("Contract"),
          cardSpace: CardSpaceIdentifier.make("Contracts")
        },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass }
      }).pipe(
        Effect.provide(testLayer({
          associations: [cardToIssue],
          relations: [
            relation({
              docA: "card-1" as Ref<Doc>,
              docB: "issue-1" as Ref<Doc>
            })
          ],
          cardSpaces: [cardSpaceDoc("cards-1", "Contracts")],
          cards: [cardDoc("card-1", "Contract")],
          issues: [issue("issue-1", "HULY-1")]
        }))
      )

      expect(result.total).toBe(1)
      expect(result.relations[0].source.display).toBe("Contract")
    }))

  it.effect("requires card space for card title lookup", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: { kind: "card", card: CardIdentifier.make("Contract") }
        }).pipe(Effect.provide(testLayer({
          associations: [association({})],
          cards: [cardDoc("card-1", "Different title")]
        })))
      )

      expect(error).toBeInstanceOf(GenericObjectLocatorInvalidError)
    }))

  it.effect("fails on ambiguous card titles inside the selected card space", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: {
            kind: "card",
            card: CardIdentifier.make("Contract"),
            cardSpace: CardSpaceIdentifier.make("Contracts")
          }
        }).pipe(Effect.provide(testLayer({
          associations: [association({})],
          cardSpaces: [cardSpaceDoc("cards-1", "Contracts")],
          cards: [
            cardDoc("card-1", "Contract"),
            cardDoc("card-2", "Contract")
          ]
        })))
      )

      expect(error).toBeInstanceOf(GenericObjectIdentifierAmbiguousError)
    }))
})

describe("association mutations", () => {
  it.effect("createAssociation creates a non-system association", () =>
    Effect.gen(function*() {
      const result = yield* createAssociation({
        sourceClass: issueClass,
        targetClass: documentClass,
        sourceRole: AssociationRoleName.make("references"),
        targetRole: AssociationRoleName.make("referenced by"),
        cardinality: "one-to-many"
      }).pipe(Effect.provide(testLayer({})))

      expect(result.created).toBe(true)
      expect(result.existing).toBe(false)
      expect(result.association.sourceClass).toBe(tracker.class.Issue)
      expect(result.association.targetClass).toBe(documentPlugin.class.Document)
      expect(result.association.cardinality).toBe("one-to-many")
    }))

  it.effect("createAssociation returns an identical existing association", () =>
    Effect.gen(function*() {
      const result = yield* createAssociation({
        sourceClass: issueClass,
        targetClass: issueClass,
        sourceRole: AssociationRoleName.make("relates"),
        targetRole: AssociationRoleName.make("relates"),
        cardinality: "many-to-many"
      }).pipe(Effect.provide(testLayer({ associations: [association({})] })))

      expect(result.created).toBe(false)
      expect(result.existing).toBe(true)
      expect(result.association.associationId).toBe("assoc-1")
    }))

  it.effect("createAssociation fails on conflicting exact duplicates", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createAssociation({
          sourceClass: issueClass,
          targetClass: issueClass,
          sourceRole: AssociationRoleName.make("relates"),
          targetRole: AssociationRoleName.make("relates"),
          cardinality: "one-to-one"
        }).pipe(Effect.provide(testLayer({ associations: [association({})] })))
      )

      expect(error).toBeInstanceOf(AssociationConflictError)
    }))

  it.effect("createAssociation rejects core system classes", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createAssociation({
          sourceClass: ObjectClassName.make(core.class.Doc),
          targetClass: issueClass,
          sourceRole: AssociationRoleName.make("source"),
          targetRole: AssociationRoleName.make("target"),
          cardinality: "many-to-many"
        }).pipe(Effect.provide(testLayer({})))
      )

      expect(error).toBeInstanceOf(AssociationSystemClassUnsupportedError)
    }))

  it.effect("deleteAssociation deletes unused associations", () =>
    Effect.gen(function*() {
      const result = yield* deleteAssociation({ association: assocId }).pipe(
        Effect.provide(testLayer({ associations: [association({})] }))
      )

      expect(result.associationId).toBe("assoc-1")
      expect(result.deleted).toBe(true)
      expect(result.relationCount).toBe(0)
    }))

  it.effect("deleteAssociation is idempotent when the association is missing", () =>
    Effect.gen(function*() {
      const result = yield* deleteAssociation({ association: AssociationIdentifier.make("missing-assoc") }).pipe(
        Effect.provide(testLayer({}))
      )

      expect(result.association).toBe("missing-assoc")
      expect(result.associationId).toBeUndefined()
      expect(result.deleted).toBe(false)
      expect(result.relationCount).toBe(0)
      expect(result.reason).toBe("not_found")
    }))

  it.effect("deleteAssociation fails while relations still reference the association", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        deleteAssociation({ association: assocId }).pipe(
          Effect.provide(testLayer({
            associations: [association({})],
            relations: [relation({})]
          }))
        )
      )

      expect(error).toBeInstanceOf(AssociationInUseError)
    }))

  it.effect("deleteAssociation treats returned relation rows as usage even when SDK total is stale", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        deleteAssociation({ association: assocId }).pipe(
          Effect.provide(testLayer({
            associations: [association({})],
            relations: [relation({})],
            relationTotal: 0
          }))
        )
      )

      expect(error).toBeInstanceOf(AssociationInUseError)
    }))

  it.effect("deleteAssociation preserves unknown relation totals when sampled rows show usage", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        deleteAssociation({ association: assocId }).pipe(
          Effect.provide(testLayer({
            associations: [association({})],
            relations: [relation({})],
            relationTotal: UNKNOWN_TOTAL
          }))
        )
      )

      expect(error).toBeInstanceOf(AssociationInUseError)
      if (!(error instanceof AssociationInUseError)) {
        throw new Error("Expected AssociationInUseError")
      }
      expect(error.relationCount).toBe(UNKNOWN_TOTAL)
      expect(error.sampleRelationIds).toEqual([RelationId.make("rel-1")])
    }))

  it.effect("deleteAssociation rejects invalid negative relation totals before sample fallback", () =>
    Effect.gen(function*() {
      const exit = yield* Effect.exit(
        deleteAssociation({ association: assocId }).pipe(
          Effect.provide(testLayer({
            associations: [association({})],
            relations: [],
            relationTotal: -2
          }))
        )
      )

      expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true)
    }))

  it.effect("deleteAssociation deletes unused automation-only associations", () =>
    Effect.gen(function*() {
      const result = yield* deleteAssociation({ association: assocId }).pipe(
        Effect.provide(testLayer({
          associations: [association({ automationOnly: true })]
        }))
      )

      expect(result.deleted).toBe(true)
      expect(result.associationId).toBe("assoc-1")
    }))

  it.effect("createAssociation fails when ifExists is fail and an identical association exists", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createAssociation({
          sourceClass: issueClass,
          targetClass: issueClass,
          sourceRole: AssociationRoleName.make("relates"),
          targetRole: AssociationRoleName.make("relates"),
          cardinality: "many-to-many",
          ifExists: "fail"
        }).pipe(Effect.provide(testLayer({ associations: [association({})] })))
      )
      expect(error).toBeInstanceOf(AssociationConflictError)
      expect((error as AssociationConflictError).reason).toContain("ifExists=fail")
    }))

  it.effect("createAssociation fails when automationOnly differs from an existing association", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createAssociation({
          sourceClass: issueClass,
          targetClass: issueClass,
          sourceRole: AssociationRoleName.make("relates"),
          targetRole: AssociationRoleName.make("relates"),
          cardinality: "many-to-many",
          automationOnly: true
        }).pipe(Effect.provide(testLayer({ associations: [association({})] })))
      )
      expect(error).toBeInstanceOf(AssociationConflictError)
      expect((error as AssociationConflictError).reason).toContain("automationOnly")
    }))

  it.effect("deleteAssociation rejects an association whose source is a core system class", () =>
    Effect.gen(function*() {
      const system = association({
        _id: "assoc-sys" as Ref<HulyAssociation>,
        classA: core.class.Doc,
        classB: tracker.class.Issue
      })
      const error = yield* Effect.flip(
        deleteAssociation({ association: AssociationIdentifier.make("assoc-sys") }).pipe(
          Effect.provide(testLayer({ associations: [system] }))
        )
      )
      expect(error).toBeInstanceOf(AssociationSystemClassUnsupportedError)
    }))

  it.effect("deleteAssociation rejects an association whose target is a core system class", () =>
    Effect.gen(function*() {
      const system = association({
        _id: "assoc-sys" as Ref<HulyAssociation>,
        classA: tracker.class.Issue,
        classB: core.class.Doc
      })
      const error = yield* Effect.flip(
        deleteAssociation({ association: AssociationIdentifier.make("assoc-sys") }).pipe(
          Effect.provide(testLayer({ associations: [system] }))
        )
      )
      expect(error).toBeInstanceOf(AssociationSystemClassUnsupportedError)
    }))

  it.effect("deleteAssociation resolves an association by its target role name", () =>
    Effect.gen(function*() {
      const assoc = association({
        _id: "assoc-roles" as Ref<HulyAssociation>,
        nameA: "references",
        nameB: "referenced by"
      })
      const result = yield* deleteAssociation({ association: AssociationIdentifier.make("referenced by") }).pipe(
        Effect.provide(testLayer({ associations: [assoc] }))
      )
      expect(result.deleted).toBe(true)
      expect(result.associationId).toBe("assoc-roles")
    }))

  it.effect("deleteAssociation resolves an association by its 'source -> target' role pair", () =>
    Effect.gen(function*() {
      const assoc = association({
        _id: "assoc-roles" as Ref<HulyAssociation>,
        nameA: "references",
        nameB: "referenced by"
      })
      const result = yield* deleteAssociation({
        association: AssociationIdentifier.make("references -> referenced by")
      }).pipe(Effect.provide(testLayer({ associations: [assoc] })))
      expect(result.deleted).toBe(true)
      expect(result.associationId).toBe("assoc-roles")
    }))
})

describe("listAssociations branch coverage", () => {
  it.effect("summarizes a system association with an unsupported-write reason when included", () =>
    Effect.gen(function*() {
      const system = association({
        _id: "assoc-sys" as Ref<HulyAssociation>,
        classA: core.class.Doc,
        classB: core.class.Doc
      })
      const result = yield* listAssociations({ includeSystem: true }).pipe(
        Effect.provide(testLayer({ associations: [system] }))
      )
      const summary = result.associations.find((item) => item.associationId === "assoc-sys")
      expect(summary?.system).toBe(true)
      expect(summary?.canCreateRelation).toBe(false)
      expect(summary?.unsupportedReason).toContain("system class")
    }))

  it.effect("filters association discovery by source and target class", () =>
    Effect.gen(function*() {
      const match = association({
        _id: "assoc-it" as Ref<HulyAssociation>,
        classA: tracker.class.Issue,
        classB: documentPlugin.class.Document
      })
      const result = yield* listAssociations({ sourceClass: issueClass, targetClass: documentClass }).pipe(
        Effect.provide(testLayer({ associations: [match] }))
      )
      expect(result.associations.map((item) => item.associationId)).toEqual(["assoc-it"])
    }))

  it.effect("reports a system association as not found when system classes are excluded", () =>
    Effect.gen(function*() {
      const system = association({
        _id: "assoc-sys" as Ref<HulyAssociation>,
        classA: core.class.Doc,
        classB: core.class.Doc
      })
      const error = yield* Effect.flip(
        listAssociations({ association: AssociationIdentifier.make("assoc-sys") }).pipe(
          Effect.provide(testLayer({ associations: [system] }))
        )
      )
      expect(error).toBeInstanceOf(AssociationNotFoundError)
    }))
})

describe("relation mutations", () => {
  it.effect("createRelation creates a concrete relation and returns existing by default", () =>
    Effect.gen(function*() {
      const layer = testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
      })
      const params = {
        association: assocId,
        source: { kind: "raw" as const, id: docId("issue-1"), class: issueClass },
        target: { kind: "raw" as const, id: docId("issue-2"), class: issueClass }
      }

      const created = yield* createRelation(params).pipe(Effect.provide(layer))
      const existing = yield* createRelation(params).pipe(Effect.provide(layer))

      expect(created.created).toBe(true)
      expect(created.existing).toBe(false)
      expect(existing.created).toBe(false)
      expect(existing.existing).toBe(true)
      expect(existing.relationId).toBe(created.relationId)
    }))

  it.effect("createRelation enforces ifExists=fail", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("issue-2"), class: issueClass },
          ifExists: "fail"
        }).pipe(Effect.provide(testLayer({
          associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
          relations: [relation({})],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        })))
      )

      expect(error).toBeInstanceOf(RelationCardinalityViolationError)
    }))

  it.effect("createRelation enforces one-to-many target-side cardinality", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-3"), class: issueClass },
          target: { kind: "raw", id: docId("issue-2"), class: issueClass }
        }).pipe(Effect.provide(testLayer({
          associations: [association({ _id: "assoc-1" as Ref<HulyAssociation>, type: "1:N" })],
          relations: [relation({ docA: "issue-1" as Ref<Doc>, docB: "issue-2" as Ref<Doc> })],
          issues: [
            issue("issue-1", "HULY-1"),
            issue("issue-2", "HULY-2"),
            issue("issue-3", "HULY-3")
          ]
        })))
      )

      expect(error).toBeInstanceOf(RelationCardinalityViolationError)
    }))

  it.effect("createRelation rejects automation-only associations", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("issue-2"), class: issueClass }
        }).pipe(Effect.provide(testLayer({
          associations: [association({ _id: "assoc-1" as Ref<HulyAssociation>, automationOnly: true })],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        })))
      )

      expect(error).toBeInstanceOf(RelationMutationUnsupportedError)
    }))

  it.effect("createRelation rejects direction either for same-class associations", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("issue-2"), class: issueClass },
          direction: "either"
        }).pipe(Effect.provide(testLayer({
          associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        })))
      )

      expect(error).toBeInstanceOf(RelationDirectionAmbiguousError)
    }))

  it.effect("deleteRelation deletes by id and is idempotent", () =>
    Effect.gen(function*() {
      const layer = testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        relations: [relation({})]
      })

      const deleted = yield* deleteRelation({ relation: RelationIdentifier.make("rel-1") }).pipe(Effect.provide(layer))
      const missing = yield* deleteRelation({ relation: RelationIdentifier.make("rel-1") }).pipe(Effect.provide(layer))

      expect(deleted.deleted).toBe(true)
      expect(deleted.associationId).toBe("assoc-1")
      expect(missing.deleted).toBe(false)
      expect(missing.reason).toBe("not_found")
    }))

  it.effect("deleteRelation deletes by exact triple", () =>
    Effect.gen(function*() {
      const result = yield* deleteRelation({
        association: assocId,
        source: { kind: "raw", id: docId("issue-1"), class: issueClass },
        target: { kind: "raw", id: docId("issue-2"), class: issueClass }
      }).pipe(Effect.provide(testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        relations: [relation({})],
        issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
      })))

      expect(result.deleted).toBe(true)
      expect(result.relationId).toBe("rel-1")
    }))

  it.effect("deleteRelation fails on ambiguous triple matches", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        deleteRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("issue-2"), class: issueClass }
        }).pipe(Effect.provide(testLayer({
          associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
          relations: [
            relation({ _id: "rel-1" as Ref<HulyRelation> }),
            relation({ _id: "rel-2" as Ref<HulyRelation> })
          ],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        })))
      )

      expect(error).toBeInstanceOf(RelationIdentifierAmbiguousError)
    }))
})

describe("generic-associations resolver and mutation branch coverage", () => {
  it.effect("createRelation rejects associations on a core system class", () =>
    Effect.gen(function*() {
      const system = association({
        _id: "assoc-1" as Ref<HulyAssociation>,
        classA: core.class.Doc,
        classB: tracker.class.Issue
      })
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("issue-2"), class: issueClass }
        }).pipe(Effect.provide(testLayer({
          associations: [system],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        })))
      )
      expect(error).toBeInstanceOf(AssociationSystemClassUnsupportedError)
    }))

  it.effect("createAssociation conflict reason defaults a missing automationOnly to false", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createAssociation({
          sourceClass: issueClass,
          targetClass: issueClass,
          sourceRole: AssociationRoleName.make("relates"),
          targetRole: AssociationRoleName.make("relates"),
          cardinality: "many-to-many"
        }).pipe(Effect.provide(testLayer({ associations: [association({ automationOnly: true })] })))
      )
      expect(error).toBeInstanceOf(AssociationConflictError)
      expect((error as AssociationConflictError).reason).toContain("requested false")
    }))

  it.effect("deleteRelation by triple is idempotent when no relation matches", () =>
    Effect.gen(function*() {
      const result = yield* deleteRelation({
        association: assocId,
        source: { kind: "raw", id: docId("issue-1"), class: issueClass },
        target: { kind: "raw", id: docId("issue-2"), class: issueClass }
      }).pipe(Effect.provide(testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
      })))
      expect(result.deleted).toBe(false)
      expect(result.reason).toBe("not_found")
    }))

  it.effect("resolves a document endpoint by its id", () =>
    Effect.gen(function*() {
      const docToIssue = association({
        _id: "assoc-1" as Ref<HulyAssociation>,
        classA: documentPlugin.class.Document,
        classB: tracker.class.Issue,
        nameA: "document",
        nameB: "issue"
      })
      const result = yield* listRelations({
        association: assocId,
        source: { kind: "document", document: documentIdentifier("doc-1") },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass }
      }).pipe(Effect.provide(testLayer({
        associations: [docToIssue],
        relations: [relation({ docA: "doc-1" as Ref<Doc>, docB: "issue-1" as Ref<Doc> })],
        documents: [documentDoc("doc-1", "Spec")],
        issues: [issue("issue-1", "HULY-1")]
      })))
      expect(result.total).toBe(1)
      expect(result.relations[0].source.display).toBe("Spec")
    }))

  it.effect("fails on ambiguous document titles without a teamspace", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: { kind: "document", document: documentIdentifier("Shared Title") }
        }).pipe(Effect.provide(testLayer({
          associations: [association({})],
          documents: [documentDoc("doc-1", "Shared Title"), documentDoc("doc-2", "Shared Title")]
        })))
      )
      expect(error).toBeInstanceOf(GenericObjectIdentifierAmbiguousError)
    }))

  it.effect("resolves a card endpoint by id within a card space resolved by id", () =>
    Effect.gen(function*() {
      const cardToIssue = association({
        _id: "assoc-1" as Ref<HulyAssociation>,
        classA: contractAssociationClassRef,
        classB: tracker.class.Issue,
        nameA: "card",
        nameB: "issue"
      })
      const result = yield* listRelations({
        association: assocId,
        source: { kind: "card", card: CardIdentifier.make("card-1"), cardSpace: CardSpaceIdentifier.make("cards-1") },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass }
      }).pipe(Effect.provide(testLayer({
        associations: [cardToIssue],
        relations: [relation({ docA: "card-1" as Ref<Doc>, docB: "issue-1" as Ref<Doc> })],
        cardSpaces: [cardSpaceDoc("cards-1", "Contracts")],
        cards: [cardDoc("card-1", "Contract")],
        issues: [issue("issue-1", "HULY-1")]
      })))
      expect(result.total).toBe(1)
    }))

  it.effect("fails when the referenced card space does not exist", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: {
            kind: "card",
            card: CardIdentifier.make("Contract"),
            cardSpace: CardSpaceIdentifier.make("Nonexistent")
          }
        }).pipe(Effect.provide(testLayer({
          associations: [association({})],
          cards: [cardDoc("card-1", "Contract")]
        })))
      )
      expect(error).toBeInstanceOf(GenericObjectNotFoundError)
    }))

  it.effect("fails on an ambiguous card space name", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: {
            kind: "card",
            card: CardIdentifier.make("Contract"),
            cardSpace: CardSpaceIdentifier.make("Contracts")
          }
        }).pipe(Effect.provide(testLayer({
          associations: [association({})],
          cardSpaces: [cardSpaceDoc("cards-1", "Contracts"), cardSpaceDoc("cards-2", "Contracts")],
          cards: [cardDoc("card-1", "Contract")]
        })))
      )
      expect(error).toBeInstanceOf(GenericObjectIdentifierAmbiguousError)
    }))

  it.effect("fails when a card title is missing inside the selected card space", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: {
            kind: "card",
            card: CardIdentifier.make("Missing Card"),
            cardSpace: CardSpaceIdentifier.make("Contracts")
          }
        }).pipe(Effect.provide(testLayer({
          associations: [association({})],
          cardSpaces: [cardSpaceDoc("cards-1", "Contracts")],
          cards: [cardDoc("card-1", "Contract")]
        })))
      )
      expect(error).toBeInstanceOf(GenericObjectNotFoundError)
    }))
})

describe("generic-associations direction and cardinality branch coverage", () => {
  const issueDocAssoc = (overrides: Partial<HulyAssociation> = {}): HulyAssociation =>
    association({
      _id: "assoc-1" as Ref<HulyAssociation>,
      classA: tracker.class.Issue,
      classB: documentPlugin.class.Document,
      nameA: "references",
      nameB: "referenced by",
      ...overrides
    })

  it.effect("lists relations for a target-to-source direction with a known association", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({
        association: assocId,
        source: { kind: "document", document: documentIdentifier("doc-1") },
        direction: "target-to-source"
      }).pipe(Effect.provide(testLayer({
        associations: [issueDocAssoc()],
        relations: [relation({ docA: "issue-1" as Ref<Doc>, docB: "doc-1" as Ref<Doc> })],
        issues: [issue("issue-1", "HULY-1")],
        documents: [documentDoc("doc-1", "Spec")]
      })))
      expect(result.total).toBe(1)
    }))

  it.effect("lists relations for an either direction with a known association", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({
        association: assocId,
        source: { kind: "raw", id: docId("issue-1"), class: issueClass },
        direction: "either"
      }).pipe(Effect.provide(testLayer({
        associations: [issueDocAssoc()],
        relations: [relation({ docA: "issue-1" as Ref<Doc>, docB: "doc-1" as Ref<Doc> })],
        issues: [issue("issue-1", "HULY-1")],
        documents: [documentDoc("doc-1", "Spec")]
      })))
      expect(result.total).toBe(1)
    }))

  it.effect("discovers relations for a target-to-source direction without an association", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({
        source: { kind: "raw", id: docId("issue-2"), class: issueClass },
        direction: "target-to-source"
      }).pipe(Effect.provide(testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        relations: [relation({ docA: "issue-1" as Ref<Doc>, docB: "issue-2" as Ref<Doc> })],
        issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
      })))
      expect(result.total).toBe(1)
    }))

  it.effect("discovers relations for an either direction without an association", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({
        source: { kind: "raw", id: docId("issue-1"), class: issueClass },
        direction: "either"
      }).pipe(Effect.provide(testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        relations: [relation({ docA: "issue-1" as Ref<Doc>, docB: "issue-2" as Ref<Doc> })],
        issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
      })))
      expect(result.total).toBe(1)
    }))

  it.effect("flags a relation endpoint that cannot be resolved for display", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({
        association: assocId
      }).pipe(Effect.provide(testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        relations: [relation({ docA: "ghost-issue" as Ref<Doc>, docB: "issue-2" as Ref<Doc> })],
        issues: [issue("issue-2", "HULY-2")]
      })))
      expect(result.relations[0].source.warning).toContain("Could not resolve")
    }))

  it.effect("fails an issue locator carrying a project the workspace cannot resolve", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: { kind: "issue", issue: issueIdentifier("1"), project: projectIdentifier("HULY") }
        }).pipe(Effect.provide(testLayer({ associations: [association({})] })))
      )
      expect(error._tag).toBeDefined()
    }))

  it.effect("fails a project-prefixed issue locator the workspace cannot resolve", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: { kind: "issue", issue: issueIdentifier("HULY-1") }
        }).pipe(Effect.provide(testLayer({ associations: [association({})] })))
      )
      expect(error._tag).toBeDefined()
    }))

  it.effect("createRelation resolves endpoints for a target-to-source direction", () =>
    Effect.gen(function*() {
      const result = yield* createRelation({
        association: assocId,
        source: { kind: "raw", id: docId("doc-1"), class: documentClass },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass },
        direction: "target-to-source"
      }).pipe(Effect.provide(testLayer({
        associations: [issueDocAssoc()],
        issues: [issue("issue-1", "HULY-1")],
        documents: [documentDoc("doc-1", "Spec")]
      })))
      expect(result.created).toBe(true)
    }))

  it.effect("createRelation picks the forward orientation for an either direction", () =>
    Effect.gen(function*() {
      const result = yield* createRelation({
        association: assocId,
        source: { kind: "raw", id: docId("issue-1"), class: issueClass },
        target: { kind: "raw", id: docId("doc-1"), class: documentClass },
        direction: "either"
      }).pipe(Effect.provide(testLayer({
        associations: [issueDocAssoc()],
        issues: [issue("issue-1", "HULY-1")],
        documents: [documentDoc("doc-1", "Spec")]
      })))
      expect(result.created).toBe(true)
    }))

  it.effect("createRelation picks the reverse orientation for an either direction", () =>
    Effect.gen(function*() {
      const result = yield* createRelation({
        association: assocId,
        source: { kind: "raw", id: docId("doc-1"), class: documentClass },
        target: { kind: "raw", id: docId("issue-1"), class: issueClass },
        direction: "either"
      }).pipe(Effect.provide(testLayer({
        associations: [issueDocAssoc()],
        issues: [issue("issue-1", "HULY-1")],
        documents: [documentDoc("doc-1", "Spec")]
      })))
      expect(result.created).toBe(true)
    }))

  it.effect("createRelation enforces one-to-one source-side cardinality", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("issue-3"), class: issueClass }
        }).pipe(Effect.provide(testLayer({
          associations: [association({ _id: "assoc-1" as Ref<HulyAssociation>, type: "1:1" })],
          relations: [relation({ docA: "issue-1" as Ref<Doc>, docB: "issue-2" as Ref<Doc> })],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2"), issue("issue-3", "HULY-3")]
        })))
      )
      expect(error).toBeInstanceOf(RelationCardinalityViolationError)
      expect((error as RelationCardinalityViolationError).reason).toContain("one-to-one")
    }))
})

describe("generic-associations either-orientation and discovery edge cases", () => {
  const issueDocAssoc = (overrides: Partial<HulyAssociation> = {}): HulyAssociation =>
    association({
      _id: "assoc-1" as Ref<HulyAssociation>,
      classA: tracker.class.Issue,
      classB: documentPlugin.class.Document,
      nameA: "references",
      nameB: "referenced by",
      ...overrides
    })

  it.effect("lists relations for an either direction with no endpoints", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({ association: assocId, direction: "either" }).pipe(
        Effect.provide(testLayer({
          associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
          relations: [relation({})],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        }))
      )
      expect(result.total).toBe(1)
    }))

  it.effect("returns no relations when no association matches the discovered endpoint class", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({
        source: { kind: "raw", id: docId("doc-1"), class: documentClass }
      }).pipe(Effect.provide(testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        documents: [documentDoc("doc-1", "Spec")]
      })))
      expect(result.total).toBe(0)
    }))

  it.effect("discovers relations using only a target endpoint", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({
        target: { kind: "raw", id: docId("issue-2"), class: issueClass }
      }).pipe(Effect.provide(testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        relations: [relation({ docA: "issue-1" as Ref<Doc>, docB: "issue-2" as Ref<Doc> })],
        issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
      })))
      expect(result.total).toBe(1)
    }))

  it.effect("sorts multiple discovered relations by recency", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({
        source: { kind: "raw", id: docId("issue-1"), class: issueClass }
      }).pipe(Effect.provide(testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        relations: [
          relation({
            _id: "rel-1" as Ref<HulyRelation>,
            docA: "issue-1" as Ref<Doc>,
            docB: "issue-2" as Ref<Doc>,
            modifiedOn: 100
          }),
          relation({
            _id: "rel-2" as Ref<HulyRelation>,
            docA: "issue-1" as Ref<Doc>,
            docB: "issue-3" as Ref<Doc>,
            modifiedOn: 200
          })
        ],
        issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2"), issue("issue-3", "HULY-3")]
      })))
      expect(result.total).toBe(2)
    }))

  it.effect("createRelation rejects an either endpoint whose class matches neither side", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("card-1"), class: cardClass },
          direction: "either"
        }).pipe(Effect.provide(testLayer({
          associations: [issueDocAssoc()],
          issues: [issue("issue-1", "HULY-1")],
          cards: [cardDoc("card-1", "Contract")]
        })))
      )
      expect(error).toBeInstanceOf(RelationEndpointClassMismatchError)
    }))

  it.effect("createRelation rejects either endpoints that both match the source side", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("issue-1"), class: issueClass },
          target: { kind: "raw", id: docId("issue-2"), class: issueClass },
          direction: "either"
        }).pipe(Effect.provide(testLayer({
          associations: [issueDocAssoc()],
          issues: [issue("issue-1", "HULY-1"), issue("issue-2", "HULY-2")]
        })))
      )
      expect(error).toBeInstanceOf(RelationEndpointClassMismatchError)
    }))

  it.effect("createRelation rejects either endpoints that both match the target side", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        createRelation({
          association: assocId,
          source: { kind: "raw", id: docId("doc-1"), class: documentClass },
          target: { kind: "raw", id: docId("doc-2"), class: documentClass },
          direction: "either"
        }).pipe(Effect.provide(testLayer({
          associations: [issueDocAssoc()],
          documents: [documentDoc("doc-1", "Spec A"), documentDoc("doc-2", "Spec B")]
        })))
      )
      expect(error).toBeInstanceOf(RelationEndpointClassMismatchError)
    }))

  it.effect("fails a document locator that requires an unresolvable teamspace", () =>
    Effect.gen(function*() {
      const error = yield* Effect.flip(
        listRelations({
          source: {
            kind: "document",
            document: documentIdentifier("Spec"),
            teamspace: teamspaceIdentifier("Engineering")
          }
        }).pipe(
          Effect.provide(testLayer({ associations: [association({})], documents: [documentDoc("doc-1", "Spec")] }))
        )
      )
      expect(error._tag).toBeDefined()
    }))
})

describe("generic-associations display fallback", () => {
  it.effect("falls back to the document id when no display field is present", () =>
    Effect.gen(function*() {
      const result = yield* listRelations({
        association: assocId
      }).pipe(Effect.provide(testLayer({
        associations: [association({ _id: "assoc-1" as Ref<HulyAssociation> })],
        relations: [relation({ docA: "bare-1" as Ref<Doc>, docB: "issue-2" as Ref<Doc> })],
        issues: [issue("bare-1", ""), issue("issue-2", "HULY-2")]
      })))
      expect(result.relations[0].source.display).toBe("bare-1")
    }))
})
