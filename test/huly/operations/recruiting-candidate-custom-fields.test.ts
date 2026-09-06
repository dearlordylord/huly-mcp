import { describe, it } from "@effect/vitest"
import type { Person } from "@hcengineering/contact"
import { AvatarType } from "@hcengineering/contact"
import type {
  AnyAttribute,
  Class,
  Doc,
  DocumentQuery,
  DocumentUpdate,
  FindOptions,
  Mixin,
  MixinUpdate,
  Ref,
  Space
} from "@hcengineering/core"
import { Effect, Layer } from "effect"
import { expect } from "vitest"

import { CustomFieldId, ObjectClassName } from "../../../src/domain/schemas/shared.js"
import { CandidateIdentifier } from "../../../src/domain/schemas/recruiting-common.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { Diagnostics } from "../../../src/huly/diagnostics.js"
import {
  CustomFieldMetadataMalformedError,
  InvalidCustomFieldBooleanValueError,
  InvalidCustomFieldNumberValueError,
  RecruitingCandidateCustomFieldOwnerError,
  RecruitingCandidateCustomFieldTypeUnsupportedError
} from "../../../src/huly/errors.js"
import { contact, core } from "../../../src/huly/huly-plugins.js"
import {
  getRecruitingCandidateCustomFieldValues,
  listRecruitingCandidateCustomFields,
  setRecruitingCandidateCustomField
} from "../../../src/huly/operations/recruiting-candidate-custom-fields.js"
import { toCustomFieldInfos } from "../../../src/huly/operations/custom-fields-metadata.js"
import { recruitIds } from "../../../src/huly/recruit-plugin.js"
import type { Candidate } from "../../../src/huly/types/recruiting.js"
import type { ToolWarning } from "../../../src/domain/schemas/tool-warnings.js"
import {
  customFieldAttribute,
  customFieldDocument,
  type CustomFieldAttributeFixture,
  documentForTestClass,
  findResultForTestClass,
  corePersonId,
  personRef,
  spaceRef
} from "../../helpers/huly-sdk.js"

const candidateIdentifier = CandidateIdentifier.make("person-1")
const candidateOwner = ObjectClassName.make(String(recruitIds.mixin.Candidate))
const personOwner = ObjectClassName.make(String(contact.class.Person))

const makePerson = (id: string = "person-1", name = "Ada Lovelace"): Person => ({
  _id: personRef(id),
  _class: contact.class.Person,
  space: contact.space.Contacts,
  modifiedBy: corePersonId("user-1"),
  modifiedOn: 1700000000000,
  createdBy: corePersonId("user-1"),
  createdOn: 1699000000000,
  name,
  city: "",
  avatarType: AvatarType.COLOR
})

const makeCandidate = (overrides: Record<string, unknown> = {}): Candidate =>
  Object.assign(makePerson(), { title: "Engineer", source: "Referral", ...overrides })

const makeEnum = (enumValues: ReadonlyArray<unknown> = ["Low", "High"]): Doc =>
  customFieldDocument({
    _id: "enum:priority",
    _class: core.class.Enum,
    space: String(core.space.Model),
    modifiedBy: "user-1",
    modifiedOn: 1700000000000,
    createdBy: "user-1",
    createdOn: 1699000000000,
    name: "Priority",
    enumValues
  })

const makeAttribute = (overrides: Partial<CustomFieldAttributeFixture> = {}): AnyAttribute =>
  customFieldAttribute({
    _id: "field-1",
    _class: core.class.Attribute,
    space: spaceRef("workspace"),
    name: "yearsExperience",
    label: "recruit:field:Years Experience",
    attributeOf: String(recruitIds.mixin.Candidate),
    type: { _class: "core:class:TypeNumber" },
    isCustom: true,
    modifiedBy: "user-1",
    modifiedOn: 1700000000000,
    createdBy: "user-1",
    createdOn: 1699000000000,
    ...overrides
  })

const makeClassInfo = (id: string, label: string): Doc =>
  customFieldDocument({
    _id: id,
    _class: String(core.class.Class),
    space: String(core.space.Model),
    modifiedBy: "user-1",
    modifiedOn: 1700000000000,
    createdBy: "user-1",
    createdOn: 1699000000000,
    label
  })

interface Captures {
  readonly updateDocs: Array<{ readonly class: string; readonly operations: unknown }>
  readonly updateMixins: Array<{ readonly mixin: string; readonly operations: unknown }>
  readonly warnings?: Array<ToolWarning>
}

interface TestConfig {
  readonly people?: ReadonlyArray<Person>
  readonly person?: Person | undefined
  readonly candidate?: Candidate | undefined
  readonly attributes?: ReadonlyArray<AnyAttribute>
  readonly classDocs?: ReadonlyArray<Doc>
  readonly enums?: ReadonlyArray<Doc>
}

const createTestLayer = (config: TestConfig, captures: Captures = { updateDocs: [], updateMixins: [] }) => {
  const person = config.person ?? makePerson()
  const people = config.people ?? [person]
  const attributes = config.attributes ?? []
  const classDocs = config.classDocs ?? []
  const enums = config.enums ?? []

  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    _options?: FindOptions<T>
  ) => {
    const classId = String(_class)
    if (classId === String(core.class.Attribute)) {
      return Effect.succeed(findResultForTestClass<T>(attributes))
    }
    if (classId === String(core.class.Class)) {
      return Effect.succeed(findResultForTestClass<T>(classDocs))
    }
    if (classId === String(core.class.Enum)) {
      return Effect.succeed(findResultForTestClass<T>(enums))
    }
    if (classId === String(contact.class.Person)) {
      const name = query.name
      const matches = typeof name === "string" ? people.filter((candidate) => candidate.name === name) : people
      return Effect.succeed(findResultForTestClass<T>(matches))
    }
    return Effect.succeed(findResultForTestClass<T>([]))
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>,
    _options?: FindOptions<T>
  ) => {
    const classId = String(_class)
    const queryId = query["_id"]
    const identifier = typeof queryId === "string" ? queryId : undefined
    if (classId === String(contact.class.Person)) {
      return Effect.succeed(documentForTestClass<T>(people.find((candidate) => String(candidate._id) === identifier)))
    }
    if (classId === String(recruitIds.mixin.Candidate)) {
      return Effect.succeed(documentForTestClass<T>(config.candidate))
    }
    if (classId === String(core.class.Attribute)) {
      return Effect.succeed(
        documentForTestClass<T>(attributes.find((attribute) => String(attribute._id) === identifier))
      )
    }
    if (classId === String(core.class.Class)) {
      return Effect.succeed(documentForTestClass<T>(classDocs.find((doc) => String(doc._id) === identifier)))
    }
    if (classId === String(core.class.Enum)) {
      return Effect.succeed(
        documentForTestClass<T>(enums.find((enumDocument) => String(enumDocument._id) === identifier))
      )
    }
    return Effect.succeed(undefined)
  }

  const updateDoc: HulyClientOperations["updateDoc"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    _space: Ref<Space>,
    _objectId: Ref<T>,
    operations: DocumentUpdate<T>
  ) => {
    captures.updateDocs.push({ class: String(_class), operations })
    return Effect.succeed({})
  }

  const updateMixin: HulyClientOperations["updateMixin"] = <D extends Doc, M extends D>(
    _objectId: Ref<D>,
    _objectClass: Ref<Class<D>>,
    _objectSpace: Ref<Space>,
    mixin: Ref<Mixin<M>>,
    operations: MixinUpdate<D, M>
  ) => {
    captures.updateMixins.push({ mixin: String(mixin), operations })
    return Effect.succeed({})
  }

  const warnings = captures.warnings ?? []
  const diagnostics = {
    warnAgent: (warning: ToolWarning) => Effect.sync(() => warnings.push(warning)),
    trail: (_message: string) => Effect.void
  }
  return {
    captures,
    layer: Layer.mergeAll(
      HulyClient.testLayer({ findAll, findOne, updateDoc, updateMixin }),
      Layer.succeed(Diagnostics, diagnostics)
    )
  }
}

const listParams = { candidate: candidateIdentifier }

describe("recruiting candidate custom-field operations", () => {
  it.effect("lists Candidate and Person definitions only for an existing Candidate", () =>
    Effect.gen(function* () {
      const captures: Captures = { updateDocs: [], updateMixins: [], warnings: [] }
      const attrs = [
        makeAttribute({ _id: "candidate-field", name: "yearsExperience" }),
        makeAttribute({
          _id: "person-field",
          name: "preferredName",
          label: "contact:field:Preferred Name",
          attributeOf: String(contact.class.Person),
          type: { _class: "core:class:TypeString" }
        }),
        makeAttribute({ _id: "unrelated", attributeOf: "tracker:class:Issue" })
      ]
      const result = yield* listRecruitingCandidateCustomFields(listParams).pipe(
        Effect.provide(createTestLayer({ candidate: makeCandidate(), attributes: attrs }, captures).layer)
      )

      expect(result.map((field) => [field.id, field.ownerClassId, field.type])).toEqual([
        ["candidate-field", candidateOwner, "number"],
        ["person-field", personOwner, "string"]
      ])
      expect(captures.warnings?.map((warning) => warning.code)).toEqual([
        "recruiting_candidate_custom_field_metadata_degraded"
      ])
    })
  )

  it.effect("reads nested Candidate values, projected Person values, and unset definitions", () =>
    Effect.gen(function* () {
      const candidate = makeCandidate({
        [String(recruitIds.mixin.Candidate)]: { yearsExperience: 8 },
        preferredName: "Ada"
      })
      const attrs = [
        makeAttribute({ _id: "candidate-field", name: "yearsExperience" }),
        makeAttribute({
          _id: "person-field",
          name: "preferredName",
          label: "contact:field:Preferred Name",
          attributeOf: String(contact.class.Person),
          type: { _class: "core:class:TypeString" }
        }),
        makeAttribute({ _id: "unset-field", name: "missingValue", type: { _class: "core:class:TypeBoolean" } })
      ]

      const result = yield* getRecruitingCandidateCustomFieldValues(listParams).pipe(
        Effect.provide(createTestLayer({ candidate, attributes: attrs }).layer)
      )

      expect(result).toEqual([
        {
          fieldId: "candidate-field",
          name: "yearsExperience",
          label: "Years Experience",
          ownerClassId: candidateOwner,
          ownerLabel: String(recruitIds.mixin.Candidate),
          type: "number",
          value: 8
        },
        {
          fieldId: "person-field",
          name: "preferredName",
          label: "Preferred Name",
          ownerClassId: personOwner,
          ownerLabel: String(contact.class.Person),
          type: "string",
          value: "Ada"
        },
        {
          fieldId: "unset-field",
          name: "missingValue",
          label: "Years Experience",
          ownerClassId: candidateOwner,
          ownerLabel: String(recruitIds.mixin.Candidate),
          type: "boolean"
        }
      ])
    })
  )

  it.effect("decodes runtime Date values to CustomFieldDateTimestamp", () =>
    Effect.gen(function* () {
      const runtimeDate = new Date("2026-07-24T00:00:00.000Z")
      const candidate = makeCandidate({ [String(recruitIds.mixin.Candidate)]: { availableFrom: runtimeDate } })
      const attr = makeAttribute({
        _id: "candidate-date",
        name: "availableFrom",
        type: { _class: "core:class:TypeDate" }
      })
      const result = yield* getRecruitingCandidateCustomFieldValues(listParams).pipe(
        Effect.provide(createTestLayer({ candidate, attributes: [attr] }).layer)
      )

      expect(result).toContainEqual({
        fieldId: "candidate-date",
        name: "availableFrom",
        label: "Years Experience",
        ownerClassId: candidateOwner,
        ownerLabel: String(recruitIds.mixin.Candidate),
        type: "date",
        value: runtimeDate.getTime()
      })
    })
  )

  it.effect("writes Candidate-owned values through the Candidate mixin with parsed numbers", () =>
    Effect.gen(function* () {
      const captures: Captures = { updateDocs: [], updateMixins: [] }
      const result = yield* setRecruitingCandidateCustomField({
        candidate: candidateIdentifier,
        fieldId: CustomFieldId.make("candidate-field"),
        value: "8"
      }).pipe(
        Effect.provide(
          createTestLayer(
            { candidate: makeCandidate(), attributes: [makeAttribute({ _id: "candidate-field" })] },
            captures
          ).layer
        )
      )

      expect(result).toMatchObject({ candidate: { id: candidateIdentifier }, fieldId: "candidate-field", value: 8 })
      expect(captures.updateMixins).toEqual([
        { mixin: String(recruitIds.mixin.Candidate), operations: { yearsExperience: 8 } }
      ])
      expect(captures.updateDocs).toEqual([])
    })
  )

  it.effect("writes Person-owned date values through the base Person class", () =>
    Effect.gen(function* () {
      const captures: Captures = { updateDocs: [], updateMixins: [] }
      const result = yield* setRecruitingCandidateCustomField({
        candidate: candidateIdentifier,
        fieldId: CustomFieldId.make("person-field"),
        value: "2026-07-24"
      }).pipe(
        Effect.provide(
          createTestLayer(
            {
              candidate: makeCandidate(),
              attributes: [
                makeAttribute({
                  _id: "person-field",
                  name: "availableFrom",
                  attributeOf: String(contact.class.Person),
                  type: { _class: "core:class:TypeDate" }
                })
              ]
            },
            captures
          ).layer
        )
      )

      expect(result.value).toBe(1784851200000)
      expect(captures.updateDocs).toEqual([
        { class: String(contact.class.Person), operations: { availableFrom: 1784851200000 } }
      ])
      expect(captures.updateMixins).toEqual([])
    })
  )

  it.effect("validates enum writes against the native Huly enum values", () =>
    Effect.gen(function* () {
      const enumAttribute = makeAttribute({
        _id: "priority-field",
        name: "priority",
        type: { _class: core.class.EnumOf, of: "enum:priority" }
      })
      const captures: Captures = { updateDocs: [], updateMixins: [] }
      const result = yield* setRecruitingCandidateCustomField({
        candidate: candidateIdentifier,
        fieldId: CustomFieldId.make("priority-field"),
        value: "High"
      }).pipe(
        Effect.provide(
          createTestLayer({ candidate: makeCandidate(), attributes: [enumAttribute], enums: [makeEnum()] }, captures)
            .layer
        )
      )
      expect(result).toMatchObject({ fieldId: "priority-field", type: "enum", value: "High", updated: true })
      expect(captures.updateMixins).toEqual([
        { mixin: String(recruitIds.mixin.Candidate), operations: { priority: "High" } }
      ])
    })
  )

  it.effect("rejects enum values absent from the native Huly enum before mutation", () =>
    Effect.gen(function* () {
      const captures: Captures = { updateDocs: [], updateMixins: [] }
      const error = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: candidateIdentifier,
          fieldId: CustomFieldId.make("priority-field"),
          value: "Urgent"
        }).pipe(
          Effect.provide(
            createTestLayer(
              {
                candidate: makeCandidate(),
                attributes: [
                  makeAttribute({
                    _id: "priority-field",
                    name: "priority",
                    type: { _class: core.class.EnumOf, of: "enum:priority" }
                  })
                ],
                enums: [makeEnum()]
              },
              captures
            ).layer
          )
        )
      )
      expect(error._tag).toBe("InvalidCustomFieldEnumValueError")
      expect(captures.updateDocs).toEqual([])
      expect(captures.updateMixins).toEqual([])
    })
  )

  it.effect("rejects malformed native enum payloads with a typed metadata error", () =>
    Effect.gen(function* () {
      const captures: Captures = { updateDocs: [], updateMixins: [] }
      const malformedEnum = makeEnum([42])
      const error = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: candidateIdentifier,
          fieldId: CustomFieldId.make("priority-field"),
          value: "High"
        }).pipe(
          Effect.provide(
            createTestLayer(
              {
                candidate: makeCandidate(),
                attributes: [
                  makeAttribute({
                    _id: "priority-field",
                    name: "priority",
                    type: { _class: core.class.EnumOf, of: "enum:priority" }
                  })
                ],
                enums: [malformedEnum]
              },
              captures
            ).layer
          )
        )
      )
      expect(error).toBeInstanceOf(CustomFieldMetadataMalformedError)
      expect(captures.updateDocs).toEqual([])
      expect(captures.updateMixins).toEqual([])
    })
  )

  it.effect("rejects invalid number and boolean strings before either mutation path", () =>
    Effect.gen(function* () {
      const numberCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const numberError = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: candidateIdentifier,
          fieldId: CustomFieldId.make("number-field"),
          value: "not-a-number"
        }).pipe(
          Effect.provide(
            createTestLayer(
              { candidate: makeCandidate(), attributes: [makeAttribute({ _id: "number-field" })] },
              numberCaptures
            ).layer
          )
        )
      )
      expect(numberError).toBeInstanceOf(InvalidCustomFieldNumberValueError)
      expect(numberCaptures.updateDocs).toEqual([])
      expect(numberCaptures.updateMixins).toEqual([])

      const booleanCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const booleanError = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: candidateIdentifier,
          fieldId: CustomFieldId.make("boolean-field"),
          value: "maybe"
        }).pipe(
          Effect.provide(
            createTestLayer(
              {
                candidate: makeCandidate(),
                attributes: [makeAttribute({ _id: "boolean-field", type: { _class: "core:class:TypeBoolean" } })]
              },
              booleanCaptures
            ).layer
          )
        )
      )
      expect(booleanError).toBeInstanceOf(InvalidCustomFieldBooleanValueError)
      expect(booleanCaptures.updateDocs).toEqual([])
      expect(booleanCaptures.updateMixins).toEqual([])
    })
  )

  it.effect("rejects unrelated owners and unsupported types before mutation", () =>
    Effect.gen(function* () {
      const ownerCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const ownerError = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: candidateIdentifier,
          fieldId: CustomFieldId.make("unrelated"),
          value: "x"
        }).pipe(
          Effect.provide(
            createTestLayer(
              {
                candidate: makeCandidate(),
                attributes: [makeAttribute({ _id: "unrelated", attributeOf: "tracker:class:Issue" })]
              },
              ownerCaptures
            ).layer
          )
        )
      )
      expect(ownerError).toBeInstanceOf(RecruitingCandidateCustomFieldOwnerError)
      expect(ownerCaptures.updateDocs).toEqual([])
      expect(ownerCaptures.updateMixins).toEqual([])

      const typeCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const typeError = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: candidateIdentifier,
          fieldId: CustomFieldId.make("array-field"),
          value: "x"
        }).pipe(
          Effect.provide(
            createTestLayer(
              {
                candidate: makeCandidate(),
                attributes: [
                  makeAttribute({
                    _id: "array-field",
                    type: { _class: "core:class:ArrOf", of: { _class: "core:class:TypeString" } }
                  })
                ]
              },
              typeCaptures
            ).layer
          )
        )
      )
      expect(typeError).toBeInstanceOf(RecruitingCandidateCustomFieldTypeUnsupportedError)
      expect(typeCaptures.updateDocs).toEqual([])
      expect(typeCaptures.updateMixins).toEqual([])
    })
  )

  it.effect("rejects missing or ambiguous candidates and malformed applicable metadata without mutation", () =>
    Effect.gen(function* () {
      const missingCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const missingError = yield* Effect.flip(
        listRecruitingCandidateCustomFields(listParams).pipe(
          Effect.provide(
            createTestLayer(
              { person: makePerson(), candidate: undefined, attributes: [makeAttribute()] },
              missingCaptures
            ).layer
          )
        )
      )
      expect(missingError._tag).toBe("RecruitingCandidateNotFoundError")
      expect(missingCaptures.updateDocs).toEqual([])
      expect(missingCaptures.updateMixins).toEqual([])

      const ambiguousCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const duplicatePeople = [makePerson("person-1", "Ada Lovelace"), makePerson("person-2", "Ada Lovelace")]
      const ambiguousError = yield* Effect.flip(
        listRecruitingCandidateCustomFields({ candidate: CandidateIdentifier.make("Ada Lovelace") }).pipe(
          Effect.provide(
            createTestLayer(
              {
                person: makePerson("ghost"),
                people: duplicatePeople,
                candidate: makeCandidate(),
                attributes: [makeAttribute()]
              },
              ambiguousCaptures
            ).layer
          )
        )
      )
      expect(ambiguousError._tag).toBe("PersonIdentifierAmbiguousError")

      const malformed = makeAttribute({ name: "" })
      const malformedError = yield* Effect.flip(
        listRecruitingCandidateCustomFields(listParams).pipe(
          Effect.provide(createTestLayer({ candidate: makeCandidate(), attributes: [malformed] }).layer)
        )
      )
      expect(malformedError).toBeInstanceOf(CustomFieldMetadataMalformedError)

      for (const type of [
        { _class: core.class.EnumOf },
        { _class: core.class.EnumOf, of: 42 },
        { _class: core.class.ArrOf },
        { _class: core.class.ArrOf, of: { _class: 42 } },
        { _class: core.class.RefTo },
        { _class: core.class.RefTo, to: 42 }
      ]) {
        const metadataError = yield* Effect.flip(
          listRecruitingCandidateCustomFields(listParams).pipe(
            Effect.provide(createTestLayer({ candidate: makeCandidate(), attributes: [makeAttribute({ type })] }).layer)
          )
        )
        expect(metadataError).toBeInstanceOf(CustomFieldMetadataMalformedError)
      }
    })
  )

  it.effect("warns when runtime values disagree with field metadata", () =>
    Effect.gen(function* () {
      const captures: Captures = { updateDocs: [], updateMixins: [], warnings: [] }
      const candidate = makeCandidate({ [String(recruitIds.mixin.Candidate)]: { yearsExperience: "eight" } })
      const result = yield* getRecruitingCandidateCustomFieldValues(listParams).pipe(
        Effect.provide(
          createTestLayer(
            { candidate, attributes: [makeAttribute({ _id: "candidate-field", name: "yearsExperience" })] },
            captures
          ).layer
        )
      )
      expect(result[0]).not.toHaveProperty("value")
      expect(captures.warnings?.map((warning) => warning.code)).toEqual([
        "recruiting_candidate_custom_field_metadata_degraded"
      ])
    })
  )

  it.effect("does not mutate when the setter cannot resolve a unique Candidate locator", () =>
    Effect.gen(function* () {
      const missingCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const missingError = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: candidateIdentifier,
          fieldId: CustomFieldId.make("candidate-field"),
          value: "8"
        }).pipe(
          Effect.provide(
            createTestLayer(
              { person: makePerson(), candidate: undefined, attributes: [makeAttribute()] },
              missingCaptures
            ).layer
          )
        )
      )
      expect(missingError._tag).toBe("RecruitingCandidateNotFoundError")
      expect(missingCaptures.updateDocs).toEqual([])
      expect(missingCaptures.updateMixins).toEqual([])

      const ambiguousCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const duplicatePeople = [makePerson("person-1", "Ada Lovelace"), makePerson("person-2", "Ada Lovelace")]
      const ambiguousError = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: CandidateIdentifier.make("Ada Lovelace"),
          fieldId: CustomFieldId.make("candidate-field"),
          value: "8"
        }).pipe(
          Effect.provide(
            createTestLayer(
              {
                person: makePerson("ghost"),
                people: duplicatePeople,
                candidate: makeCandidate(),
                attributes: [makeAttribute()]
              },
              ambiguousCaptures
            ).layer
          )
        )
      )
      expect(ambiguousError._tag).toBe("PersonIdentifierAmbiguousError")
      expect(ambiguousCaptures.updateDocs).toEqual([])
      expect(ambiguousCaptures.updateMixins).toEqual([])
    })
  )

  it.effect("projects every supported runtime shape and reports only genuine type mismatches", () =>
    Effect.gen(function* () {
      const values = {
        badArray: { not: "an array" },
        badDate: "not-a-date",
        badRef: 42,
        badString: 42,
        badUnknown: Symbol("not-json"),
        enabled: true,
        markup: "<p>Senior engineer</p>",
        priority: "High",
        reviewers: ["person-2", 3, null],
        sponsor: "person-3",
        structured: { source: "conference", verified: true }
      }
      const candidate = makeCandidate({ [String(recruitIds.mixin.Candidate)]: values })
      const attributes = [
        makeAttribute({
          _id: "bad-string",
          name: "badString",
          label: "recruit:field:Bad String",
          type: { _class: String(core.class.TypeString) }
        }),
        makeAttribute({
          _id: "markup",
          name: "markup",
          label: "recruit:field:Markup",
          type: { _class: String(core.class.TypeMarkup) }
        }),
        makeAttribute({
          _id: "priority",
          name: "priority",
          label: "recruit:field:Priority",
          type: { _class: String(core.class.EnumOf), of: "enum:priority" }
        }),
        makeAttribute({
          _id: "bad-date",
          name: "badDate",
          label: "recruit:field:Bad Date",
          type: { _class: String(core.class.TypeDate) }
        }),
        makeAttribute({
          _id: "enabled",
          name: "enabled",
          label: "recruit:field:Enabled",
          type: { _class: String(core.class.TypeBoolean) }
        }),
        makeAttribute({
          _id: "reviewers",
          name: "reviewers",
          label: "recruit:field:Reviewers",
          type: { _class: String(core.class.ArrOf), of: { _class: String(core.class.TypeString) } }
        }),
        makeAttribute({
          _id: "bad-array",
          name: "badArray",
          label: "recruit:field:Bad Array",
          type: { _class: String(core.class.ArrOf), of: { _class: String(core.class.TypeString) } }
        }),
        makeAttribute({
          _id: "sponsor",
          name: "sponsor",
          label: "recruit:field:Sponsor",
          type: { _class: String(core.class.RefTo), to: String(contact.class.Person) }
        }),
        makeAttribute({
          _id: "bad-ref",
          name: "badRef",
          label: "recruit:field:Bad Ref",
          type: { _class: String(core.class.RefTo), to: String(contact.class.Person) }
        }),
        makeAttribute({
          _id: "structured",
          name: "structured",
          label: "recruit:field:Structured",
          type: { _class: String(core.class.TypeAny) }
        }),
        makeAttribute({
          _id: "bad-unknown",
          name: "badUnknown",
          label: "recruit:field:Bad Unknown",
          type: { _class: String(core.class.TypeAny) }
        })
      ]
      const captures: Captures = { updateDocs: [], updateMixins: [], warnings: [] }
      const result = yield* getRecruitingCandidateCustomFieldValues(listParams).pipe(
        Effect.provide(
          createTestLayer(
            {
              candidate,
              attributes,
              classDocs: [makeClassInfo(String(recruitIds.mixin.Candidate), "recruit:class:Candidate")]
            },
            captures
          ).layer
        )
      )
      const valueFor = (fieldId: string) => result.find((value) => value.fieldId === fieldId)

      expect(valueFor("markup")).toMatchObject({ type: "markup", value: "<p>Senior engineer</p>" })
      expect(valueFor("priority")).toMatchObject({ type: "enum", value: "High" })
      expect(valueFor("enabled")).toMatchObject({ type: "boolean", value: true })
      expect(valueFor("reviewers")).toMatchObject({ type: "array", value: ["person-2", 3, null] })
      expect(valueFor("sponsor")).toMatchObject({ type: "ref", value: "person-3" })
      expect(valueFor("structured")).toMatchObject({ type: "unknown", value: { source: "conference", verified: true } })
      for (const fieldId of ["bad-string", "bad-date", "bad-array", "bad-ref", "bad-unknown"]) {
        expect(valueFor(fieldId)).not.toHaveProperty("value")
      }
      expect(captures.warnings).toHaveLength(1)
      expect(captures.warnings?.[0]?.message).toContain(
        "runtime values were omitted for 5 field(s) because their types disagreed with metadata"
      )
      expect(captures.warnings?.[0]?.message).not.toContain("fallback labels/owners")
    })
  )

  it.effect("keeps clean metadata silent and exposes the simple markup definition through the shared converter", () =>
    Effect.gen(function* () {
      const attribute = makeAttribute({
        _id: "bio",
        name: "bio",
        label: "recruit:field:Bio",
        type: { _class: String(core.class.TypeMarkup) }
      })
      const classDocs = [makeClassInfo(String(recruitIds.mixin.Candidate), "recruit:class:Candidate")]
      const captures: Captures = { updateDocs: [], updateMixins: [], warnings: [] }
      const layer = createTestLayer({ candidate: makeCandidate(), attributes: [attribute], classDocs }, captures).layer
      const listed = yield* listRecruitingCandidateCustomFields({ ...listParams, limit: 1 }).pipe(Effect.provide(layer))
      const converted = yield* Effect.gen(function* () {
        const client = yield* HulyClient
        return yield* toCustomFieldInfos(client, [attribute])
      }).pipe(Effect.provide(layer))

      expect(listed).toMatchObject([{ id: "bio", type: "markup", label: "Bio", ownerLabel: "Candidate" }])
      expect(converted).toEqual(listed)
      expect(captures.warnings).toEqual([])
    })
  )

  it.effect("writes string, markup, and boolean values with their exact native representations", () =>
    Effect.gen(function* () {
      const attributes = [
        makeAttribute({ _id: "title-field", name: "candidateTitle", type: { _class: String(core.class.TypeString) } }),
        makeAttribute({ _id: "bio-field", name: "bio", type: { _class: String(core.class.TypeMarkup) } }),
        makeAttribute({ _id: "remote-field", name: "remote", type: { _class: String(core.class.TypeBoolean) } })
      ]
      const captures: Captures = { updateDocs: [], updateMixins: [] }
      const layer = createTestLayer({ candidate: makeCandidate(), attributes }, captures).layer

      const title = yield* setRecruitingCandidateCustomField({
        candidate: candidateIdentifier,
        fieldId: CustomFieldId.make("title-field"),
        value: "Principal Engineer"
      }).pipe(Effect.provide(layer))
      const bio = yield* setRecruitingCandidateCustomField({
        candidate: candidateIdentifier,
        fieldId: CustomFieldId.make("bio-field"),
        value: "**Distributed systems**"
      }).pipe(Effect.provide(layer))
      const remote = yield* setRecruitingCandidateCustomField({
        candidate: candidateIdentifier,
        fieldId: CustomFieldId.make("remote-field"),
        value: "true"
      }).pipe(Effect.provide(layer))

      expect([title, bio, remote].map(({ type, value }) => [type, value])).toEqual([
        ["string", "Principal Engineer"],
        ["markup", "**Distributed systems**"],
        ["boolean", true]
      ])
      expect(captures.updateMixins.map(({ operations }) => operations)).toEqual([
        { candidateTitle: "Principal Engineer" },
        { bio: "**Distributed systems**" },
        { remote: true }
      ])
    })
  )

  it.effect("fails without mutation when a field or its native enum document is missing", () =>
    Effect.gen(function* () {
      const missingFieldCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const missingField = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: candidateIdentifier,
          fieldId: CustomFieldId.make("missing-field"),
          value: "anything"
        }).pipe(
          Effect.provide(createTestLayer({ candidate: makeCandidate(), attributes: [] }, missingFieldCaptures).layer)
        )
      )

      const missingEnumCaptures: Captures = { updateDocs: [], updateMixins: [] }
      const missingEnum = yield* Effect.flip(
        setRecruitingCandidateCustomField({
          candidate: candidateIdentifier,
          fieldId: CustomFieldId.make("priority-field"),
          value: "High"
        }).pipe(
          Effect.provide(
            createTestLayer(
              {
                candidate: makeCandidate(),
                attributes: [
                  makeAttribute({
                    _id: "priority-field",
                    name: "priority",
                    type: { _class: String(core.class.EnumOf), of: "enum:priority" }
                  })
                ]
              },
              missingEnumCaptures
            ).layer
          )
        )
      )

      expect(missingField._tag).toBe("CustomFieldNotFoundError")
      expect(missingEnum).toMatchObject({ _tag: "CustomFieldMetadataMalformedError", identifier: "priority-field" })
      expect(missingEnum.message).toContain("references missing native enum 'enum:priority'")
      expect(missingFieldCaptures.updateMixins).toEqual([])
      expect(missingEnumCaptures.updateMixins).toEqual([])
    })
  )
})
