import { SortingOrder } from "@hcengineering/core"
import type {
  MessageTemplate as HulyMessageTemplate,
  TemplateCategory as HulyTemplateCategory,
  TemplateField as HulyTemplateField
} from "@hcengineering/templates"
import { Effect } from "effect"

import type {
  GetMessageTemplateParams,
  ListMessageTemplateCategoriesParams,
  ListMessageTemplateFieldsParams,
  ListMessageTemplatesParams,
  MessageTemplate,
  MessageTemplateCategorySummary,
  MessageTemplateField,
  MessageTemplateSummary
} from "../../domain/schemas/message-templates.js"
import { Count } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { templates } from "../huly-plugins.js"
import {
  categoryMapFor,
  categorySummaryFor,
  fieldCategoryMapFor,
  hasBlankCategoryName,
  hasBlankTemplateFieldLabel,
  hasBlankTemplateTitle,
  resolveCategory,
  type ResolveCategoryError,
  resolveFieldCategory,
  type ResolveFieldCategoryError,
  resolveTemplate,
  type ResolveTemplateError,
  searchLike,
  templateDetailFor,
  templateFieldFor,
  templateSummaryFor,
  warnMetadataFallbacks
} from "./message-templates-support.js"
import { clampLimit, hulyQuery, type StrictDocumentQuery } from "./query-helpers.js"

type ListMessageTemplateCategoriesError = HulyClientError
type ListMessageTemplatesError = ResolveCategoryError
type GetMessageTemplateError = ResolveTemplateError
type ListMessageTemplateFieldsError = ResolveFieldCategoryError

export const listMessageTemplateCategories = (
  params: ListMessageTemplateCategoriesParams
): Effect.Effect<Array<MessageTemplateCategorySummary>, ListMessageTemplateCategoriesError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const categories = yield* client.findAll<HulyTemplateCategory>(
      templates.class.TemplateCategory,
      hulyQuery<HulyTemplateCategory>({}),
      {
        limit: clampLimit(params.limit),
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )

    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(categories.filter(hasBlankCategoryName).length),
      "message template category row(s)",
      "category IDs as names"
    )

    return categories.map(categorySummaryFor)
  })

export const listMessageTemplates = (
  params: ListMessageTemplatesParams
): Effect.Effect<Array<MessageTemplateSummary>, ListMessageTemplatesError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const category = params.category === undefined ? undefined : yield* resolveCategory(client, params.category)
    const titleLike = searchLike(params.search)
    const categoryFilter = category === undefined ? {} : { space: category._id }
    const titleFilter = titleLike === undefined ? {} : { title: titleLike }
    const query: StrictDocumentQuery<HulyMessageTemplate> = {
      ...categoryFilter,
      ...titleFilter
    }

    const found = yield* client.findAll<HulyMessageTemplate>(
      templates.class.MessageTemplate,
      hulyQuery(query),
      {
        limit: clampLimit(params.limit),
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )
    const categories = yield* categoryMapFor(client, found.map((template) => template.space))
    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(found.filter(hasBlankTemplateTitle).length),
      "message template title row(s)",
      "template IDs as titles"
    )

    return found.map((template) => templateSummaryFor(template, client, categories))
  })

export const getMessageTemplate = (
  params: GetMessageTemplateParams
): Effect.Effect<MessageTemplate, GetMessageTemplateError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const template = yield* resolveTemplate(client, params)
    const categories = yield* categoryMapFor(client, [template.space])
    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(hasBlankTemplateTitle(template) ? 1 : 0),
      "message template title row(s)",
      "template IDs as titles"
    )

    return templateDetailFor(template, client, categories)
  })

export const listMessageTemplateFields = (
  params: ListMessageTemplateFieldsParams
): Effect.Effect<Array<MessageTemplateField>, ListMessageTemplateFieldsError, HulyClient | Diagnostics> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const diagnostics = yield* Diagnostics
    const category = params.category === undefined ? undefined : yield* resolveFieldCategory(client, params.category)
    const labelLike = searchLike(params.search)
    const categoryFilter = category === undefined ? {} : { category: category._id }
    const labelFilter = labelLike === undefined ? {} : { label: labelLike }
    const query: StrictDocumentQuery<HulyTemplateField> = {
      ...categoryFilter,
      ...labelFilter
    }

    const fields = yield* client.findAll<HulyTemplateField>(
      templates.class.TemplateField,
      hulyQuery(query),
      {
        limit: clampLimit(params.limit),
        sort: { modifiedOn: SortingOrder.Descending }
      }
    )
    const categories = yield* fieldCategoryMapFor(client, fields.map((field) => field.category))
    yield* warnMetadataFallbacks(
      diagnostics,
      Count.make(fields.filter(hasBlankTemplateFieldLabel).length),
      "template field row(s)",
      "field IDs as labels"
    )

    return fields.map((field) => templateFieldFor(field, categories))
  })
