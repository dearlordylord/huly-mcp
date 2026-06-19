import type { Doc, Ref } from "@hcengineering/core"
import type {
  MessageTemplate as HulyMessageTemplate,
  TemplateCategory as HulyTemplateCategory,
  TemplateField as HulyTemplateField,
  TemplateFieldCategory as HulyTemplateFieldCategory
} from "@hcengineering/templates"
import { templateFieldRegexp } from "@hcengineering/templates"
import { Effect } from "effect"

import type {
  GetMessageTemplateParams,
  MessageTemplate,
  MessageTemplateCategoryRef,
  MessageTemplateCategorySummary,
  MessageTemplateField,
  MessageTemplateSummary,
  TemplateFieldCategoryIdentifier,
  TemplateFieldCategoryRef
} from "../../domain/schemas/message-templates.js"
import {
  MessageTemplateCategoryId,
  MessageTemplateCategoryIdentifier,
  MessageTemplateId,
  MessageTemplateMarkdown,
  TemplateFieldCategoryId,
  TemplateFieldId
} from "../../domain/schemas/message-templates.js"
import { Count, type NonEmptyString, Timestamp } from "../../domain/schemas/shared.js"
import { MessageTemplateMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import { assertAt } from "../../utils/assertions.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import {
  MessageTemplateCategoryIdentifierAmbiguousError,
  MessageTemplateCategoryNotFoundError,
  MessageTemplateIdentifierAmbiguousError,
  MessageTemplateNotFoundError,
  TemplateFieldCategoryIdentifierAmbiguousError,
  TemplateFieldCategoryNotFoundError
} from "../errors.js"
import { templates } from "../huly-plugins.js"
import { markupToMarkdownString } from "./markup.js"
import { escapeLikeWildcards, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const AMBIGUOUS_LOOKUP_LIMIT = 2

type MetadataFallbackResource =
  | "message template category ref(s)"
  | "message template category row(s)"
  | "message template title row(s)"
  | "template field category ref(s)"
  | "template field row(s)"

type MetadataFallbackValue =
  | "category IDs as names"
  | "field category IDs as labels"
  | "field IDs as labels"
  | "template IDs as titles"

type Timestamps = {
  readonly createdOn?: Timestamp
  readonly modifiedOn?: Timestamp
}

export type ResolveCategoryError =
  | HulyClientError
  | MessageTemplateCategoryIdentifierAmbiguousError
  | MessageTemplateCategoryNotFoundError

export type ResolveTemplateError =
  | ResolveCategoryError
  | MessageTemplateIdentifierAmbiguousError
  | MessageTemplateNotFoundError

export type ResolveFieldCategoryError =
  | HulyClientError
  | TemplateFieldCategoryIdentifierAmbiguousError
  | TemplateFieldCategoryNotFoundError

const timestampsFor = (doc: { readonly createdOn?: number; readonly modifiedOn: number }): Timestamps => {
  const modified = { modifiedOn: Timestamp.make(doc.modifiedOn) }
  return doc.createdOn === undefined ? modified : { ...modified, createdOn: Timestamp.make(doc.createdOn) }
}

export const hasBlankCategoryName = (category: HulyTemplateCategory): boolean => category.name.trim().length === 0

const hasBlankFieldCategoryLabel = (category: HulyTemplateFieldCategory): boolean =>
  String(category.label).trim().length === 0

export const hasBlankTemplateTitle = (template: HulyMessageTemplate): boolean => template.title.trim().length === 0

export const hasBlankTemplateFieldLabel = (field: HulyTemplateField): boolean => String(field.label).trim().length === 0

const categoryNameFor = (category: HulyTemplateCategory): NonEmptyString =>
  hasBlankCategoryName(category) ? String(category._id) : category.name

const fieldCategoryLabelFor = (category: HulyTemplateFieldCategory): NonEmptyString =>
  hasBlankFieldCategoryLabel(category) ? String(category._id) : String(category.label)

const templateTitleFor = (template: HulyMessageTemplate): NonEmptyString =>
  hasBlankTemplateTitle(template) ? String(template._id) : template.title

const templateFieldLabelFor = (field: HulyTemplateField): NonEmptyString =>
  hasBlankTemplateFieldLabel(field) ? String(field._id) : String(field.label)

const categoryRefFor = (category: HulyTemplateCategory): MessageTemplateCategoryRef => {
  const name = categoryNameFor(category)

  return {
    id: MessageTemplateCategoryId.make(category._id),
    name
  }
}

const fieldCategoryRefFor = (category: HulyTemplateFieldCategory): TemplateFieldCategoryRef => {
  const label = fieldCategoryLabelFor(category)

  return {
    id: TemplateFieldCategoryId.make(category._id),
    label
  }
}

export const categorySummaryFor = (category: HulyTemplateCategory): MessageTemplateCategorySummary => ({
  ...categoryRefFor(category),
  description: category.description,
  archived: category.archived,
  private: category.private,
  ...timestampsFor(category)
})

const placeholderFieldIds = (markdown: string): Array<TemplateFieldId> => {
  const regexp = new RegExp(templateFieldRegexp.source, templateFieldRegexp.flags)
  const ids = [...markdown.matchAll(regexp)]
    .flatMap((match) => {
      const id = assertAt(match, 1)
      return [id]
    })
    .filter((id, index, allIds) => id.length > 0 && allIds.indexOf(id) === index)

  return ids.map((id) => TemplateFieldId.make(id))
}

const markdownForTemplate = (
  template: HulyMessageTemplate,
  client: HulyClient["Type"]
): MessageTemplateMarkdown =>
  MessageTemplateMarkdown.make(markupToMarkdownString(template.message, client.markupUrlConfig))

export const searchLike = (search: string | undefined): { readonly $like: string } | undefined => {
  const trimmed = search?.trim() ?? ""
  return trimmed.length === 0 ? undefined : { $like: `%${escapeLikeWildcards(trimmed)}%` }
}

export const warnMetadataFallbacks = (
  diagnostics: Diagnostics["Type"],
  count: Count,
  resourceLabel: MetadataFallbackResource,
  fallbackLabel: MetadataFallbackValue
): Effect.Effect<void> =>
  count === 0
    ? Effect.void
    : diagnostics.warnAgent({
      code: MessageTemplateMetadataDegradedWarningCode,
      message: `Huly did not return complete metadata for ${count} ${resourceLabel}. `
        + `The tool result uses ${fallbackLabel}; do not infer human-readable names from those fallback values.`
    })

const refMetadataMapFor = <T extends Doc, V>(
  diagnostics: Diagnostics["Type"],
  ids: ReadonlyArray<Ref<T>>,
  docs: ReadonlyArray<T>,
  isBlank: (doc: T) => boolean,
  toValue: (doc: T) => V,
  resourceLabel: MetadataFallbackResource,
  fallbackLabel: MetadataFallbackValue
): Effect.Effect<ReadonlyMap<Ref<T>, V>> =>
  Effect.gen(function*() {
    const docsById = new Map(docs.map((doc) => [doc._id, doc]))
    const missingCount = ids.filter((id) => !docsById.has(id)).length
    const blankCount = docs.filter(isBlank).length
    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(missingCount + blankCount),
      resourceLabel,
      fallbackLabel
    )

    return new Map(docs.map((doc) => [doc._id, toValue(doc)]))
  })

const findCategoryMatches = (
  client: HulyClient["Type"],
  identifier: MessageTemplateCategoryIdentifier
): Effect.Effect<Array<HulyTemplateCategory>, HulyClientError> =>
  Effect.map(
    client.findAll<HulyTemplateCategory>(
      templates.class.TemplateCategory,
      hulyQuery<HulyTemplateCategory>({ name: identifier }),
      { limit: AMBIGUOUS_LOOKUP_LIMIT }
    ),
    (result) => [...result]
  )

export const resolveCategory = (
  client: HulyClient["Type"],
  identifier: MessageTemplateCategoryIdentifier
): Effect.Effect<HulyTemplateCategory, ResolveCategoryError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulyTemplateCategory>(
      templates.class.TemplateCategory,
      hulyQuery<HulyTemplateCategory>({ _id: toRef<HulyTemplateCategory>(identifier) })
    )

    if (byId !== undefined) return byId

    const matches = yield* findCategoryMatches(client, identifier)
    if (matches.length === 0) {
      return yield* new MessageTemplateCategoryNotFoundError({ identifier })
    }
    if (matches.length > 1) {
      return yield* new MessageTemplateCategoryIdentifierAmbiguousError({
        identifier,
        matches: Count.make(matches.length)
      })
    }
    return assertAt(matches, 0)
  })

export const categoryMapFor = (
  client: HulyClient["Type"],
  categoryIds: ReadonlyArray<Ref<HulyTemplateCategory>>
): Effect.Effect<ReadonlyMap<Ref<HulyTemplateCategory>, MessageTemplateCategoryRef>, HulyClientError, Diagnostics> =>
  Effect.gen(function*() {
    const diagnostics = yield* Diagnostics
    const ids = [...new Set(categoryIds)]
    if (ids.length === 0) return new Map<Ref<HulyTemplateCategory>, MessageTemplateCategoryRef>()

    const categories = yield* client.findAll<HulyTemplateCategory>(
      templates.class.TemplateCategory,
      hulyQuery<HulyTemplateCategory>({ _id: { $in: ids } }),
      { limit: ids.length }
    )

    return yield* refMetadataMapFor(
      diagnostics,
      ids,
      categories,
      hasBlankCategoryName,
      categoryRefFor,
      "message template category ref(s)",
      "category IDs as names"
    )
  })

const categoryRefFromMap = (
  categoryId: Ref<HulyTemplateCategory>,
  categories: ReadonlyMap<Ref<HulyTemplateCategory>, MessageTemplateCategoryRef>
): MessageTemplateCategoryRef =>
  categories.get(categoryId) ?? {
    id: MessageTemplateCategoryId.make(categoryId),
    name: String(categoryId)
  }

export const templateSummaryFor = (
  template: HulyMessageTemplate,
  client: HulyClient["Type"],
  categories: ReadonlyMap<Ref<HulyTemplateCategory>, MessageTemplateCategoryRef>
): MessageTemplateSummary => {
  const message = markdownForTemplate(template, client)

  return {
    id: MessageTemplateId.make(template._id),
    title: templateTitleFor(template),
    category: categoryRefFromMap(template.space, categories),
    placeholderFieldIds: placeholderFieldIds(message),
    ...timestampsFor(template)
  }
}

export const templateDetailFor = (
  template: HulyMessageTemplate,
  client: HulyClient["Type"],
  categories: ReadonlyMap<Ref<HulyTemplateCategory>, MessageTemplateCategoryRef>
): MessageTemplate => {
  const message = markdownForTemplate(template, client)

  return {
    ...templateSummaryFor(template, client, categories),
    message
  }
}

export const resolveTemplate = (
  client: HulyClient["Type"],
  params: GetMessageTemplateParams
): Effect.Effect<HulyMessageTemplate, ResolveTemplateError> =>
  Effect.gen(function*() {
    const category = params.category === undefined ? undefined : yield* resolveCategory(client, params.category)
    const categoryFilter = category === undefined ? {} : { space: category._id }

    const byId = yield* client.findOne<HulyMessageTemplate>(
      templates.class.MessageTemplate,
      hulyQuery<HulyMessageTemplate>({
        _id: toRef<HulyMessageTemplate>(params.template),
        ...categoryFilter
      })
    )

    if (byId !== undefined) return byId

    const matches = yield* client.findAll<HulyMessageTemplate>(
      templates.class.MessageTemplate,
      hulyQuery<HulyMessageTemplate>({
        title: params.template,
        ...categoryFilter
      }),
      { limit: AMBIGUOUS_LOOKUP_LIMIT }
    )

    if (matches.length === 0) {
      return yield* new MessageTemplateNotFoundError({
        identifier: params.template,
        category: category === undefined ? undefined : MessageTemplateCategoryIdentifier.make(categoryNameFor(category))
      })
    }
    if (matches.length > 1) {
      return yield* new MessageTemplateIdentifierAmbiguousError({
        identifier: params.template,
        matches: Count.make(matches.length)
      })
    }
    return assertAt(matches, 0)
  })

export const resolveFieldCategory = (
  client: HulyClient["Type"],
  identifier: TemplateFieldCategoryIdentifier
): Effect.Effect<HulyTemplateFieldCategory, ResolveFieldCategoryError> =>
  Effect.gen(function*() {
    const byId = yield* client.findOne<HulyTemplateFieldCategory>(
      templates.class.TemplateFieldCategory,
      hulyQuery<HulyTemplateFieldCategory>({ _id: toRef<HulyTemplateFieldCategory>(identifier) })
    )

    if (byId !== undefined) return byId

    const categories = yield* client.findAll<HulyTemplateFieldCategory>(
      templates.class.TemplateFieldCategory,
      hulyQuery<HulyTemplateFieldCategory>({})
    )
    const matches = categories
      .filter((category) => String(category.label) === identifier)
      .slice(0, AMBIGUOUS_LOOKUP_LIMIT)

    if (matches.length === 0) {
      return yield* new TemplateFieldCategoryNotFoundError({ identifier })
    }
    if (matches.length > 1) {
      return yield* new TemplateFieldCategoryIdentifierAmbiguousError({
        identifier,
        matches: Count.make(matches.length)
      })
    }
    return assertAt(matches, 0)
  })

export const fieldCategoryMapFor = (
  client: HulyClient["Type"],
  categoryIds: ReadonlyArray<Ref<HulyTemplateFieldCategory>>
): Effect.Effect<ReadonlyMap<Ref<HulyTemplateFieldCategory>, TemplateFieldCategoryRef>, HulyClientError, Diagnostics> =>
  Effect.gen(function*() {
    const diagnostics = yield* Diagnostics
    const ids = [...new Set(categoryIds)]
    if (ids.length === 0) return new Map<Ref<HulyTemplateFieldCategory>, TemplateFieldCategoryRef>()

    const categories = yield* client.findAll<HulyTemplateFieldCategory>(
      templates.class.TemplateFieldCategory,
      hulyQuery<HulyTemplateFieldCategory>({ _id: { $in: ids } }),
      { limit: ids.length }
    )

    return yield* refMetadataMapFor(
      diagnostics,
      ids,
      categories,
      hasBlankFieldCategoryLabel,
      fieldCategoryRefFor,
      "template field category ref(s)",
      "field category IDs as labels"
    )
  })

const fieldCategoryRefFromMap = (
  categoryId: Ref<HulyTemplateFieldCategory>,
  categories: ReadonlyMap<Ref<HulyTemplateFieldCategory>, TemplateFieldCategoryRef>
): TemplateFieldCategoryRef =>
  categories.get(categoryId) ?? {
    id: TemplateFieldCategoryId.make(categoryId),
    label: String(categoryId)
  }

export const templateFieldFor = (
  field: HulyTemplateField,
  categories: ReadonlyMap<Ref<HulyTemplateFieldCategory>, TemplateFieldCategoryRef>
): MessageTemplateField => ({
  id: TemplateFieldId.make(field._id),
  label: templateFieldLabelFor(field),
  category: fieldCategoryRefFromMap(field.category, categories),
  resourceId: String(field.func)
})
