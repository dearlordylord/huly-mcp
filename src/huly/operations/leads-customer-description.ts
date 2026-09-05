import type { MarkupFormat } from "@hcengineering/api-client"
import type { Contact } from "@hcengineering/contact"
import type { Doc, MarkupBlobRef, Space } from "@hcengineering/core"
import { Effect } from "effect"

import { NonEmptyString } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import type { HulyDataInvalidError, HulyError } from "../errors.js"
import { leadClassIds } from "../lead-plugin.js"
import { customerMixinWriteAttributes, toMarkupBlobRef } from "./leads-mutations-boundary.js"
import {
  type CustomerMixinWrite,
  customerClass,
  findLeadCustomer,
  hasCustomerMixin,
  type HulyCustomer,
  type HulyLead,
  renderLeadMutationMarkup
} from "./leads-mutations-shared.js"
import { markupToMarkdownString } from "./markup.js"
import { hulyQuery } from "./query-helpers.js"
import { markupBlobRefAsMarkupRef } from "./recruiting-shared.js"
import { toClassRef, toMixinRef, toRef } from "./sdk-boundary.js"

type PreparedCustomerDescription =
  | { readonly _tag: "unchanged" }
  | { readonly _tag: "clear"; readonly customer: HulyCustomer }
  | { readonly _tag: "update"; readonly customer: HulyCustomer; readonly markup: string; readonly format: MarkupFormat }
  | {
      readonly _tag: "upload"
      readonly customer: HulyCustomer
      readonly markup: string
      readonly format: MarkupFormat
      readonly updateExisting: boolean
    }

const customerDescriptionRef = Effect.fn("Lead.customerDescriptionRef")(function* (
  client: HulyClient["Service"],
  customer: HulyCustomer
): Effect.fn.Return<MarkupBlobRef | null | undefined, HulyClientError | HulyDataInvalidError> {
  if (hasCustomerMixin(customer)) {
    const projectedMixin = Reflect.get(customer, String(leadClassIds.mixin.Customer))
    return (yield* customerMixinWriteAttributes(projectedMixin)).customerDescription
  }
  const persistedMixin = yield* client.findOne<CustomerMixinWrite>(
    toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
    hulyQuery<CustomerMixinWrite>({ _id: toRef<CustomerMixinWrite>(customer._id) })
  )
  if (persistedMixin === undefined) return undefined
  const rawMixin = Object.hasOwn(persistedMixin, String(leadClassIds.mixin.Customer))
    ? Reflect.get(persistedMixin, String(leadClassIds.mixin.Customer))
    : { customerDescription: Reflect.get(persistedMixin, "customerDescription") }
  return (yield* customerMixinWriteAttributes(rawMixin)).customerDescription
})

const clearedPlan = (
  customer: HulyCustomer,
  existing: MarkupBlobRef | null | undefined
): PreparedCustomerDescription =>
  existing === undefined || existing === null ? { _tag: "unchanged" } : { _tag: "clear", customer }

export const prepareCustomerDescription = Effect.fn("Lead.prepareCustomerDescription")(function* (
  client: HulyClient["Service"],
  lead: HulyLead,
  content: string | null | undefined,
  resolveCustomer: typeof findLeadCustomer = findLeadCustomer
): Effect.fn.Return<PreparedCustomerDescription, HulyClientError | HulyError | HulyDataInvalidError> {
  if (content === undefined) return { _tag: "unchanged" }
  const customer = yield* resolveCustomer(client, lead)
  const existing = yield* customerDescriptionRef(client, customer)
  if (content === null) return clearedPlan(customer, existing)
  const rendered = yield* renderLeadMutationMarkup(client, content, "customerDescription")
  if (existing === undefined || existing === null) {
    return { _tag: "upload", customer, updateExisting: existing !== undefined, ...rendered }
  }
  const currentMarkdown = yield* client.fetchMarkup(
    toClassRef<Doc>(String(leadClassIds.mixin.Customer)),
    toRef<Doc>(customer._id),
    "customerDescription",
    markupBlobRefAsMarkupRef(existing),
    "markdown"
  )
  const requestedMarkdown = yield* markupToMarkdownString(rendered.markup, client.markupUrlConfig, {
    operation: "updateLead",
    entity: "customerDescription"
  })
  return currentMarkdown === requestedMarkdown ? { _tag: "unchanged" } : { _tag: "update", customer, ...rendered }
})

export const executeCustomerDescription = Effect.fn("Lead.executeCustomerDescription")(function* (
  client: HulyClient["Service"],
  plan: PreparedCustomerDescription
): Effect.fn.Return<boolean, HulyClientError> {
  if (plan._tag === "unchanged") return false
  if (plan._tag === "update") {
    yield* client.updateMarkup(
      toClassRef<Doc>(String(leadClassIds.mixin.Customer)),
      toRef<Doc>(plan.customer._id),
      "customerDescription",
      plan.markup,
      plan.format
    )
    return true
  }
  const attributes =
    plan._tag === "clear"
      ? { customerDescription: null }
      : {
          customerDescription: toMarkupBlobRef(
            NonEmptyString.make(
              yield* client.uploadMarkup(
                toClassRef<Doc>(String(leadClassIds.mixin.Customer)),
                toRef<Doc>(plan.customer._id),
                "customerDescription",
                plan.markup,
                plan.format
              )
            )
          )
        }
  const writeMixin = plan._tag === "clear" || plan.updateExisting ? client.updateMixin : client.createMixin
  yield* writeMixin<Contact, CustomerMixinWrite>(
    toRef<Contact>(plan.customer._id),
    customerClass(plan.customer),
    toRef<Space>(plan.customer.space),
    toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
    attributes
  )
  return true
})
