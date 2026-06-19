import { describe, it } from "@effect/vitest"
import type { Class, Doc, FindOptions, FindResult, PersonId, Ref } from "@hcengineering/core"
import { SortingOrder, toFindResult } from "@hcengineering/core"
import type { IntlString, Resource } from "@hcengineering/platform"
import type {
  MessageTemplate as HulyMessageTemplate,
  TemplateCategory as HulyTemplateCategory,
  TemplateField as HulyTemplateField,
  TemplateFieldCategory as HulyTemplateFieldCategory,
  TemplateFieldFunc
} from "@hcengineering/templates"
import { Effect, Exit } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../utils/assertions.js"

import {
  MessageTemplateCategoryIdentifier,
  MessageTemplateIdentifier,
  TemplateFieldCategoryIdentifier
} from "../../domain/schemas/message-templates.js"
import type { ToolWarning } from "../../domain/schemas/tool-warnings.js"
import { HulyClient, type HulyClientOperations } from "../client.js"
import { Diagnostics, makeDiagnosticsScope } from "../diagnostics.js"
import {
  MessageTemplateCategoryIdentifierAmbiguousError,
  MessageTemplateCategoryNotFoundError,
  MessageTemplateIdentifierAmbiguousError,
  MessageTemplateNotFoundError,
  TemplateFieldCategoryIdentifierAmbiguousError,
  TemplateFieldCategoryNotFoundError
} from "../errors.js"
import { core, templates } from "../huly-plugins.js"
import { markdownToMarkupString, testMarkupUrlConfig } from "./markup.js"
import {
  getMessageTemplate,
  listMessageTemplateCategories,
  listMessageTemplateFields,
  listMessageTemplates
} from "./message-templates.js"

const person = "person-1" as PersonId
const workspace = core.space.Workspace
const ref = <T extends Doc>(id: string): Ref<T> => id as Ref<T>
const intl = (id: string): IntlString => id as IntlString
const resource = (id: string): Resource<TemplateFieldFunc> => id as Resource<TemplateFieldFunc>
const templateIdentifier = MessageTemplateIdentifier.make
const templateCategoryIdentifier = MessageTemplateCategoryIdentifier.make
const fieldCategoryIdentifier = TemplateFieldCategoryIdentifier.make

interface Store {
  readonly categories: ReadonlyArray<HulyTemplateCategory>
  readonly templates: ReadonlyArray<HulyMessageTemplate>
  readonly fieldCategories: ReadonlyArray<HulyTemplateFieldCategory>
  readonly fields: ReadonlyArray<HulyTemplateField>
}

const baseDoc = {
  space: workspace,
  modifiedBy: person,
  modifiedOn: 1,
  createdBy: person,
  createdOn: 1
}

const category = (id: string, name: string, modifiedOn = 1): HulyTemplateCategory => ({
  ...baseDoc,
  _id: ref<HulyTemplateCategory>(id),
  _class: templates.class.TemplateCategory,
  name,
  description: `${name} templates`,
  private: false,
  members: [],
  archived: false,
  modifiedOn
})

const messageTemplate = (
  id: string,
  title: string,
  templateCategory: HulyTemplateCategory,
  markdown: string,
  modifiedOn = 1
): HulyMessageTemplate => ({
  ...baseDoc,
  _id: ref<HulyMessageTemplate>(id),
  _class: templates.class.MessageTemplate,
  space: templateCategory._id,
  title,
  message: markdownToMarkupString(markdown, testMarkupUrlConfig),
  modifiedOn
})

const fieldCategory = (id: string, label: string): HulyTemplateFieldCategory => ({
  ...baseDoc,
  _id: ref<HulyTemplateFieldCategory>(id),
  _class: templates.class.TemplateFieldCategory,
  label: intl(label)
})

const field = (
  id: string,
  label: string,
  templateFieldCategory: HulyTemplateFieldCategory,
  resourceId: string
): HulyTemplateField => ({
  ...baseDoc,
  _id: ref<HulyTemplateField>(id),
  _class: templates.class.TemplateField,
  category: templateFieldCategory._id,
  label: intl(label),
  func: resource(resourceId)
})

type SupportedClass = "category" | "template" | "fieldCategory" | "field"

const supportedClass = (_class: Ref<Class<Doc>>): SupportedClass | undefined => {
  if (_class === templates.class.TemplateCategory) return "category"
  if (_class === templates.class.MessageTemplate) return "template"
  if (_class === templates.class.TemplateFieldCategory) return "fieldCategory"
  if (_class === templates.class.TemplateField) return "field"
  return undefined
}

const queryValue = (query: unknown, key: string): unknown =>
  typeof query === "object" && query !== null ? query[key as keyof typeof query] : undefined

const likeMatches = (text: string, filter: unknown): boolean => {
  if (typeof filter !== "object" || filter === null || !("$like" in filter)) return false
  const raw = String(filter.$like)
  const needle = raw.replaceAll("%", "").replaceAll("\\", "").toLowerCase()
  return text.toLowerCase().includes(needle)
}

const filterMatches = (actual: string, filter: unknown): boolean => {
  if (typeof filter === "object" && filter !== null && "$in" in filter) {
    const values = filter.$in
    return Array.isArray(values) && values.includes(actual)
  }
  if (typeof filter === "object" && filter !== null && "$like" in filter) {
    return likeMatches(actual, filter)
  }
  return filter === undefined || filter === actual
}

const matches = (doc: Doc, query: unknown): boolean =>
  ["_id", "name", "title", "space", "category", "label"].every((key) => {
    const filter = queryValue(query, key)
    const value = key in doc ? doc[key as keyof typeof doc] : undefined
    return filterMatches(String(value), filter)
  })

const applyOptions = <T extends Doc>(docs: ReadonlyArray<T>, options: FindOptions<T> | undefined): Array<T> => {
  const sorted = options?.sort?.modifiedOn === SortingOrder.Descending
    ? [...docs].sort((left, right) => right.modifiedOn - left.modifiedOn)
    : [...docs]
  return options?.limit === undefined ? sorted : sorted.slice(0, options.limit)
}

const docsFor = (store: Store, kind: SupportedClass): ReadonlyArray<Doc> => {
  switch (kind) {
    case "category":
      return store.categories
    case "template":
      return store.templates
    case "fieldCategory":
      return store.fieldCategories
    case "field":
      return store.fields
  }
}

const createLayer = (store: Store) => {
  const findAll: HulyClientOperations["findAll"] = ((
    _class: Ref<Class<Doc>>,
    query: unknown,
    options?: FindOptions<Doc>
  ): Effect.Effect<FindResult<Doc>> => {
    const kind = supportedClass(_class)
    const source = kind === undefined ? [] : docsFor(store, kind)
    return Effect.succeed(toFindResult(applyOptions(source.filter((doc) => matches(doc, query)), options)))
  }) as HulyClientOperations["findAll"]

  const findOne: HulyClientOperations["findOne"] =
    ((_class: Ref<Class<Doc>>, query: Parameters<HulyClientOperations["findAll"]>[1], options?: FindOptions<Doc>) =>
      Effect.map(findAll(_class, query, options), (result) => result.at(0))) as HulyClientOperations["findOne"]

  return HulyClient.testLayer({ findAll, findOne })
}

const runOperation = <A, E>(
  effect: Effect.Effect<A, E, HulyClient | Diagnostics>,
  store: Store = testStore()
): Effect.Effect<A, E> =>
  Effect.gen(function*() {
    const diagnostics = yield* makeDiagnosticsScope
    return yield* effect.pipe(
      Effect.provide(createLayer(store)),
      Effect.provideService(Diagnostics, diagnostics.service)
    )
  })

const runOperationWithWarnings = <A, E>(
  effect: Effect.Effect<A, E, HulyClient | Diagnostics>,
  store: Store = testStore()
): Effect.Effect<{ readonly result: A; readonly warnings: ReadonlyArray<ToolWarning> }, E> =>
  Effect.gen(function*() {
    const diagnostics = yield* makeDiagnosticsScope
    const result = yield* effect.pipe(
      Effect.provide(createLayer(store)),
      Effect.provideService(Diagnostics, diagnostics.service)
    )
    const warnings = yield* diagnostics.drainWarnings

    return { result, warnings }
  })

const testStore = (): Store => {
  const sales = category("cat-sales", "Sales", 3)
  const support = category("cat-support", "Support", 2)
  const contactFields = fieldCategory("field-cat-contact", "Contact")
  const orgFields = fieldCategory("field-cat-org", "Organization")

  return {
    categories: [sales, support],
    templates: [
      messageTemplate("tmpl-sales-welcome", "Welcome", sales, "Hello ${field-owner}, meet ${field-company}.", 4),
      messageTemplate("tmpl-support-welcome", "Welcome", support, "Support hello ${field-owner}.", 3),
      messageTemplate("tmpl-sales-follow-up", "Follow Up", sales, "Follow up with ${field-company}.", 2)
    ],
    fieldCategories: [contactFields, orgFields],
    fields: [
      field("field-owner", "Owner", contactFields, "contact:template-field:Owner"),
      field("field-company", "Company", orgFields, "contact:template-field:Company")
    ]
  }
}

const failureTag = (exit: Exit.Exit<unknown, unknown>): string | undefined => {
  if (!Exit.isFailure(exit)) return undefined
  return exit.cause._tag === "Fail" && typeof exit.cause.error === "object" && exit.cause.error !== null
      && "_tag" in exit.cause.error
    ? String(exit.cause.error._tag)
    : undefined
}

describe("message template operations", () => {
  it.effect("lists template categories", () =>
    Effect.gen(function*() {
      const result = yield* runOperation(listMessageTemplateCategories({}))

      expect(result.map((item) => item.name)).toEqual(["Sales", "Support"])
      expect(result.at(0)).toMatchObject({
        id: "cat-sales",
        description: "Sales templates",
        archived: false,
        private: false,
        modifiedOn: 3,
        createdOn: 1
      })
    }))

  it.effect("uses stable category fallback values for sparse category documents", () =>
    Effect.gen(function*() {
      const withCreatedOn = category("cat-unnamed", "", 5)
      const { createdOn: _createdOn, ...withoutCreatedOn } = withCreatedOn
      const { result, warnings } = yield* runOperationWithWarnings(
        listMessageTemplateCategories({}),
        { ...testStore(), categories: [withoutCreatedOn] }
      )

      expect(result).toEqual([
        {
          id: "cat-unnamed",
          name: "cat-unnamed",
          description: " templates",
          archived: false,
          private: false,
          modifiedOn: 5
        }
      ])
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).code).toBe("message_template_metadata_degraded")
    }))

  it.effect("lists templates by category and title search with placeholders", () =>
    Effect.gen(function*() {
      const result = yield* runOperation(listMessageTemplates({
        category: templateCategoryIdentifier("Sales"),
        search: "welcome"
      }))

      expect(result).toHaveLength(1)
      expect(result.at(0)).toMatchObject({
        id: "tmpl-sales-welcome",
        title: "Welcome",
        category: { id: "cat-sales", name: "Sales" },
        placeholderFieldIds: ["field-owner", "field-company"]
      })
    }))

  it.effect("supports category ID filters and fallback category summaries", () =>
    Effect.gen(function*() {
      const store = testStore()
      const orphanCategory = category("cat-orphan", "Orphan")
      const result = yield* runOperation(
        listMessageTemplates({
          category: templateCategoryIdentifier("cat-sales")
        }),
        store
      )
      const withFallback = yield* runOperationWithWarnings(
        listMessageTemplates({ search: "   " }),
        {
          ...store,
          templates: [
            ...store.templates,
            messageTemplate("tmpl-orphan", "Orphan", orphanCategory, "No category doc.")
          ]
        }
      )

      expect(result.map((template) => template.id)).toEqual(["tmpl-sales-welcome", "tmpl-sales-follow-up"])
      expect(withFallback.result.find((template) => template.id === "tmpl-orphan")?.category).toEqual({
        id: "cat-orphan",
        name: "cat-orphan"
      })
      expect(withFallback.warnings).toHaveLength(1)
      expect(assertAt(withFallback.warnings, 0).code).toBe("message_template_metadata_degraded")
    }))

  it.effect("uses template ID fallback values for blank template titles", () =>
    Effect.gen(function*() {
      const store = testStore()
      const { result, warnings } = yield* runOperationWithWarnings(
        listMessageTemplates({}),
        {
          ...store,
          templates: [messageTemplate("tmpl-blank-title", "", assertAt(store.categories, 0), "Hello ${field-owner}.")]
        }
      )

      expect(result).toHaveLength(1)
      expect(assertAt(result, 0).title).toBe("tmpl-blank-title")
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).code).toBe("message_template_metadata_degraded")
    }))

  it.effect("does not emit metadata warnings when template search matches no rows", () =>
    Effect.gen(function*() {
      const { result, warnings } = yield* runOperationWithWarnings(
        listMessageTemplates({ search: "not a live template title" })
      )

      expect(result).toEqual([])
      expect(warnings).toEqual([])
    }))

  it.effect("reports not found and ambiguous category locators for template listing", () =>
    Effect.gen(function*() {
      const store = testStore()
      const missing = yield* Effect.exit(
        runOperation(listMessageTemplates({ category: templateCategoryIdentifier("Missing") }), store)
      )
      const ambiguous = yield* Effect.exit(
        runOperation(
          listMessageTemplates({ category: templateCategoryIdentifier("Sales") }),
          {
            ...store,
            categories: [...store.categories, category("cat-sales-copy", "Sales")]
          }
        )
      )

      expect(missing).toSatisfy((exit: Exit.Exit<unknown, unknown>) =>
        Exit.isFailure(exit)
        && exit.cause._tag === "Fail"
        && exit.cause.error instanceof MessageTemplateCategoryNotFoundError
      )
      expect(ambiguous).toSatisfy((exit: Exit.Exit<unknown, unknown>) =>
        Exit.isFailure(exit)
        && exit.cause._tag === "Fail"
        && exit.cause.error instanceof MessageTemplateCategoryIdentifierAmbiguousError
      )
    }))

  it.effect("gets a template by ID and converts markup to Markdown", () =>
    Effect.gen(function*() {
      const result = yield* runOperation(getMessageTemplate({ template: templateIdentifier("tmpl-sales-welcome") }))

      expect(result.title).toBe("Welcome")
      expect(result.message).toContain("Hello ${field-owner}")
      expect(result.placeholderFieldIds).toEqual(["field-owner", "field-company"])
    }))

  it.effect("gets a blank-title template with title fallback and warning", () =>
    Effect.gen(function*() {
      const store = testStore()
      const { result, warnings } = yield* runOperationWithWarnings(
        getMessageTemplate({ template: templateIdentifier("tmpl-blank-title") }),
        {
          ...store,
          templates: [messageTemplate("tmpl-blank-title", "", assertAt(store.categories, 0), "Hello ${field-owner}.")]
        }
      )

      expect(result.title).toBe("tmpl-blank-title")
      expect(result.placeholderFieldIds).toEqual(["field-owner"])
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).code).toBe("message_template_metadata_degraded")
    }))

  it.effect("rejects ambiguous template titles unless category is provided", () =>
    Effect.gen(function*() {
      const ambiguous = yield* Effect.exit(
        runOperation(getMessageTemplate({ template: templateIdentifier("Welcome") }))
      )
      const resolved = yield* runOperation(getMessageTemplate({
        template: templateIdentifier("Welcome"),
        category: templateCategoryIdentifier("Support")
      }))

      expect(failureTag(ambiguous)).toBe("MessageTemplateIdentifierAmbiguousError")
      expect(ambiguous).toSatisfy((exit: Exit.Exit<unknown, unknown>) =>
        Exit.isFailure(exit)
        && exit.cause._tag === "Fail"
        && exit.cause.error instanceof MessageTemplateIdentifierAmbiguousError
      )
      expect(resolved.id).toBe("tmpl-support-welcome")
    }))

  it.effect("reports not found for missing template IDs", () =>
    Effect.gen(function*() {
      const missing = yield* Effect.exit(
        runOperation(getMessageTemplate({ template: templateIdentifier("missing") }))
      )
      const missingInCategory = yield* Effect.exit(
        runOperation(getMessageTemplate({
          template: templateIdentifier("missing"),
          category: templateCategoryIdentifier("Sales")
        }))
      )

      expect(failureTag(missing)).toBe("MessageTemplateNotFoundError")
      expect(failureTag(missingInCategory)).toBe("MessageTemplateNotFoundError")
      expect(missing).toSatisfy((exit: Exit.Exit<unknown, unknown>) =>
        Exit.isFailure(exit)
        && exit.cause._tag === "Fail"
        && exit.cause.error instanceof MessageTemplateNotFoundError
      )
    }))

  it.effect("supports field category ID filters and fallback field category summaries", () =>
    Effect.gen(function*() {
      const store = testStore()
      const orphanFieldCategory = fieldCategory("field-cat-orphan", "Orphan")
      const blankFieldCategory = fieldCategory("field-cat-blank", "")
      const result = yield* runOperation(
        listMessageTemplateFields({
          category: fieldCategoryIdentifier("field-cat-contact")
        }),
        store
      )
      const withFallback = yield* runOperationWithWarnings(
        listMessageTemplateFields({ search: "   " }),
        {
          ...store,
          fields: [
            ...store.fields,
            field("field-orphan", "Orphan", orphanFieldCategory, "contact:template-field:Orphan")
          ]
        }
      )
      const withBlankLabelFallback = yield* runOperationWithWarnings(
        listMessageTemplateFields({ search: "blank" }),
        {
          ...store,
          fieldCategories: [...store.fieldCategories, blankFieldCategory],
          fields: [
            ...store.fields,
            field("field-blank", "Blank", blankFieldCategory, "contact:template-field:Blank")
          ]
        }
      )

      expect(result.map((templateField) => templateField.id)).toEqual(["field-owner"])
      expect(withFallback.result.find((templateField) => templateField.id === "field-orphan")?.category).toEqual({
        id: "field-cat-orphan",
        label: "field-cat-orphan"
      })
      expect(withFallback.warnings).toHaveLength(1)
      expect(assertAt(withFallback.warnings, 0).code).toBe("message_template_metadata_degraded")
      expect(assertAt(withBlankLabelFallback.result, 0).category).toEqual({
        id: "field-cat-blank",
        label: "field-cat-blank"
      })
      expect(withBlankLabelFallback.warnings).toHaveLength(1)
      expect(assertAt(withBlankLabelFallback.warnings, 0).code).toBe("message_template_metadata_degraded")
    }))

  it.effect("uses field ID fallback values for blank template field labels", () =>
    Effect.gen(function*() {
      const store = testStore()
      const { result, warnings } = yield* runOperationWithWarnings(
        listMessageTemplateFields({ search: "   " }),
        {
          ...store,
          fields: [field("field-blank-label", "", assertAt(store.fieldCategories, 0), "contact:template-field:Blank")]
        }
      )

      expect(result).toEqual([
        {
          id: "field-blank-label",
          label: "field-blank-label",
          category: { id: "field-cat-contact", label: "Contact" },
          resourceId: "contact:template-field:Blank"
        }
      ])
      expect(warnings).toHaveLength(1)
      expect(assertAt(warnings, 0).code).toBe("message_template_metadata_degraded")
    }))

  it.effect("does not emit metadata warnings when field search matches no rows", () =>
    Effect.gen(function*() {
      const { result, warnings } = yield* runOperationWithWarnings(
        listMessageTemplateFields({ search: "not a live template field label" })
      )

      expect(result).toEqual([])
      expect(warnings).toEqual([])
    }))

  it.effect("reports not found and ambiguous field category locators for field listing", () =>
    Effect.gen(function*() {
      const store = testStore()
      const missing = yield* Effect.exit(
        runOperation(listMessageTemplateFields({ category: fieldCategoryIdentifier("Missing") }), store)
      )
      const ambiguous = yield* Effect.exit(
        runOperation(
          listMessageTemplateFields({ category: fieldCategoryIdentifier("Contact") }),
          {
            ...store,
            fieldCategories: [...store.fieldCategories, fieldCategory("field-cat-contact-copy", "Contact")]
          }
        )
      )

      expect(missing).toSatisfy((exit: Exit.Exit<unknown, unknown>) =>
        Exit.isFailure(exit)
        && exit.cause._tag === "Fail"
        && exit.cause.error instanceof TemplateFieldCategoryNotFoundError
      )
      expect(ambiguous).toSatisfy((exit: Exit.Exit<unknown, unknown>) =>
        Exit.isFailure(exit)
        && exit.cause._tag === "Fail"
        && exit.cause.error instanceof TemplateFieldCategoryIdentifierAmbiguousError
      )
    }))

  it.effect("lists fields with field category summaries and resource IDs", () =>
    Effect.gen(function*() {
      const result = yield* runOperation(listMessageTemplateFields({
        category: fieldCategoryIdentifier("Contact"),
        search: "own"
      }))

      expect(result).toEqual([
        {
          id: "field-owner",
          label: "Owner",
          category: { id: "field-cat-contact", label: "Contact" },
          resourceId: "contact:template-field:Owner"
        }
      ])
    }))
})
