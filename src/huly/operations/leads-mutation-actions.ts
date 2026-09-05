import type { Contact } from "@hcengineering/contact"
import type { Attachment } from "@hcengineering/attachment"
import type { ChatMessage } from "@hcengineering/chunter"
import type { AttachedDoc, Doc, Space } from "@hcengineering/core"
import type { TagReference } from "@hcengineering/tags"
import { Effect } from "effect"

import { FunnelIdentifier, LeadIdentifier, type DeleteLeadParams } from "../../domain/schemas/leads.js"
import type {
  DeleteLeadResult,
  LeadImpact,
  LeadRelationCollection,
  MakePersonCustomerResult
} from "../../domain/schemas/leads-mutations.js"
import { Count, NonEmptyString, PersonId } from "../../domain/schemas/shared.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { LeadDeleteConflictError } from "../errors-leads.js"
import { HulyDataInvalidError } from "../errors.js"
import { attachment, chunter, tags } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import type { HulyFunnel } from "./funnels-shared.js"
import { funnelSpace } from "./funnels-shared.js"
import { customerMixinWriteAttributes, type HulyLead } from "./leads-mutations-boundary.js"
import { type CustomerMixinWrite, hasCustomerMixin, type LeadMutationError } from "./leads-mutations-shared.js"
import { hulyQuery } from "./query-helpers.js"
import { toClassRef, toMixinRef, toRef } from "./sdk-boundary.js"

const authoritativeRelationCount = Effect.fn("Lead.authoritativeRelationCount")((
  relation: LeadRelationCollection,
  result: { readonly total: number }
): Effect.Effect<Count, HulyDataInvalidError> => {
  if (!Number.isSafeInteger(result.total) || result.total < 0) {
    return Effect.fail(
      new HulyDataInvalidError({
        operation: "deleteLead",
        entity: `Lead ${relation} relation count`,
        cause: result.total
      })
    )
  }
  return Effect.succeed(Count.make(result.total))
})

const deletionImpact = Effect.fn("Lead.deletionImpact")(function* (
  client: HulyClient["Service"],
  lead: HulyLead
): Effect.fn.Return<LeadImpact, HulyClientError | HulyDataInvalidError> {
  const objectId = toRef<Doc>(lead._id)
  const objectClass = toClassRef<Doc>(lead._class)
  const objectSpace = toRef<Space>(lead.space)
  const [comments, attachments] = yield* Effect.all([
    client.findAll<ChatMessage>(
      chunter.class.ChatMessage,
      hulyQuery<ChatMessage>({
        attachedTo: objectId,
        attachedToClass: objectClass,
        space: objectSpace,
        collection: "comments"
      }),
      { limit: 1, total: true }
    ),
    client.findAll<Attachment>(
      attachment.class.Attachment,
      hulyQuery<Attachment>({
        attachedTo: objectId,
        attachedToClass: objectClass,
        space: objectSpace,
        collection: "attachments"
      }),
      { limit: 1, total: true }
    )
  ])
  const labels = yield* client.findAll<TagReference>(
    tags.class.TagReference,
    hulyQuery<TagReference>({
      attachedTo: objectId,
      attachedToClass: objectClass,
      space: objectSpace,
      collection: "labels"
    }),
    { limit: 1, total: true }
  )
  const commentsCount = yield* authoritativeRelationCount("comments", comments)
  const attachmentsCount = yield* authoritativeRelationCount("attachments", attachments)
  const labelsCount = yield* authoritativeRelationCount("labels", labels)
  return {
    comments: commentsCount,
    attachments: attachmentsCount,
    labels: labelsCount,
    totalAffected: Count.make(commentsCount + attachmentsCount + labelsCount)
  }
})

export const deleteResolvedLead = Effect.fn("Lead.deleteResolvedLead")(function* (
  client: HulyClient["Service"],
  source: { readonly funnel: HulyFunnel },
  lead: HulyLead,
  params: DeleteLeadParams
): Effect.fn.Return<DeleteLeadResult, LeadMutationError> {
  const identifier = LeadIdentifier.make(lead.identifier)
  const funnel = FunnelIdentifier.make(source.funnel._id)
  const impact = yield* deletionImpact(client, lead)
  if (params.execute !== true) return { identifier, funnel, impact, deleted: false }
  if (
    params.expectedComments !== impact.comments ||
    params.expectedAttachments !== impact.attachments ||
    params.expectedLabels !== impact.labels
  ) {
    return yield* new LeadDeleteConflictError({
      identifier,
      funnel,
      reason: NonEmptyString.make(
        `deletion impact changed; expected comments=${params.expectedComments}, attachments=${params.expectedAttachments}, labels=${params.expectedLabels}, current comments=${impact.comments}, attachments=${impact.attachments}, labels=${impact.labels}`
      )
    })
  }
  if (client.removeCollection === undefined) {
    return yield* new HulyDataInvalidError({ operation: "deleteLead", entity: "Huly Lead collection remover" })
  }
  yield* client.removeCollection(
    toClassRef<AttachedDoc>(String(leadClassIds.class.Lead)),
    funnelSpace(source.funnel),
    toRef<AttachedDoc>(lead._id),
    toRef<Doc>(lead.attachedTo),
    toClassRef<Doc>(lead.attachedToClass),
    lead.collection
  )
  return { identifier, funnel, impact, deleted: true }
})

export const applyPersonCustomer = Effect.fn("Lead.applyPersonCustomer")(function* (
  client: HulyClient["Service"],
  person: Parameters<typeof hasCustomerMixin>[0]
): Effect.fn.Return<MakePersonCustomerResult, HulyClientError | HulyDataInvalidError> {
  if (hasCustomerMixin(person)) return { id: PersonId.make(person._id), applied: false }
  const persistedCustomer = yield* client.findOne<CustomerMixinWrite>(
    toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
    hulyQuery<CustomerMixinWrite>({ _id: toRef<CustomerMixinWrite>(person._id) })
  )
  if (persistedCustomer !== undefined) return { id: PersonId.make(person._id), applied: false }
  const attributes = yield* customerMixinWriteAttributes({ customerDescription: null })
  yield* client.createMixin<Contact, CustomerMixinWrite>(
    toRef<Contact>(person._id),
    toClassRef<Contact>(person._class),
    toRef<Space>(person.space),
    toMixinRef<CustomerMixinWrite>(leadClassIds.mixin.Customer),
    attributes
  )
  return { id: PersonId.make(person._id), applied: true }
})
