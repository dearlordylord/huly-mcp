import type { Attachment as HulyAttachment } from "@hcengineering/attachment"
import type { Doc, Space } from "@hcengineering/core"
import type { TagReference } from "@hcengineering/tags"
import { Effect } from "effect"

import type {
  AddLeadAttachmentParams,
  AddLeadCommentParams,
  AddLeadLabelParams,
  DeleteLeadAttachmentParams,
  DeleteLeadCommentParams,
  GetLeadAttachmentParams,
  ListLeadAttachmentsParams,
  ListLeadCommentsParams,
  ListLeadLabelDefinitionsParams,
  ListLeadLabelsParams,
  RemoveLeadLabelParams,
  UpdateLeadAttachmentParams,
  UpdateLeadCommentParams,
  UpdateLeadLabelParams
} from "../../domain/schemas/lead-collaboration.js"
import type { ModuleLabelDefinition } from "../../domain/schemas/module-labels.js"
import { NonEmptyString, PositiveInteger, TagElementId } from "../../domain/schemas/shared.js"
import { TagTargetClass } from "../../domain/schemas/tags.js"
import { HulyClient } from "../client.js"
import { LeadCommentNotFoundError } from "../errors-leads.js"
import { attachment, tags } from "../huly-plugins.js"
import { leadClassIds } from "../lead-plugin.js"
import { HulyStorageClient } from "../storage.js"
import {
  addAttachedComment,
  type AttachedCommentTarget,
  deleteAttachedComment,
  listAttachedCommentsPage,
  updateAttachedComment
} from "./attached-comments.js"
import {
  findAttachmentForScope,
  getAttachmentForScope,
  listAttachmentPageForScope,
  updateAttachmentForScope
} from "./attachments-shared.js"
import { uploadAndAttach } from "./attachments-upload.js"
import { resolveFunnel } from "./funnels-shared.js"
import { findLead, type HulyLead } from "./leads-mutations-shared.js"
import { toRef } from "./sdk-boundary.js"
import {
  attachTagReference,
  detachTagReference,
  ensureTagElement,
  findTagElementOrFail,
  listTagReferencesForObject,
  toAttachedTagSummary,
  toResolvedTagElement
} from "./tags-shared.js"
import { listTags } from "./tags.js"

type LeadTargetLocator = Pick<ListLeadCommentsParams, "funnel" | "identifier">

const LEAD_LABEL_TARGET_CLASS = TagTargetClass.make(String(leadClassIds.class.Lead))
const TRUE: true = true
const FALSE: false = false
const ZERO: 0 = 0

const resolveLeadTarget = Effect.fn("LeadCollaboration.resolveTarget")(function* (params: LeadTargetLocator) {
  const client = yield* HulyClient
  const funnel = yield* resolveFunnel(client, params.funnel)
  const lead = yield* findLead(client, funnel, params.identifier)
  return { client, lead }
})

const commentTarget = (client: HulyClient["Service"], lead: HulyLead): AttachedCommentTarget => ({
  client,
  space: toRef<Space>(lead.space),
  attachedTo: toRef<Doc>(lead._id),
  attachedToClass: leadClassIds.class.Lead,
  collection: "comments",
  includeSpaceInQuery: true
})

const attachmentScope = (lead: HulyLead) => ({
  classRef: attachment.class.Attachment,
  attachedTo: toRef<Doc>(lead._id),
  attachedToClass: leadClassIds.class.Lead,
  collection: "attachments"
})

const labelObject = (lead: HulyLead) => ({
  objectId: lead._id,
  objectClass: String(leadClassIds.class.Lead),
  space: lead.space,
  collection: "labels"
})

export const listLeadComments = Effect.fn("LeadCollaboration.listComments")(function* (params: ListLeadCommentsParams) {
  const target = yield* resolveLeadTarget(params)
  const page = yield* listAttachedCommentsPage(commentTarget(target.client, target.lead), params.limit, "Lead")
  return { identifier: target.lead.identifier, comments: page.comments, total: page.total }
})

export const addLeadComment = Effect.fn("LeadCollaboration.addComment")(function* (params: AddLeadCommentParams) {
  const target = yield* resolveLeadTarget(params)
  const commentId = yield* addAttachedComment(commentTarget(target.client, target.lead), params.body)
  return { identifier: target.lead.identifier, commentId, changed: true }
})

const commentNotFound = (lead: HulyLead, commentId: DeleteLeadCommentParams["commentId"]) => () =>
  new LeadCommentNotFoundError({ identifier: lead.identifier, commentId })

export const updateLeadComment = Effect.fn("LeadCollaboration.updateComment")(function* (
  params: UpdateLeadCommentParams
) {
  const target = yield* resolveLeadTarget(params)
  const changed = yield* updateAttachedComment(
    commentTarget(target.client, target.lead),
    params.commentId,
    params.body,
    commentNotFound(target.lead, params.commentId)
  )
  return { identifier: target.lead.identifier, commentId: params.commentId, changed }
})

export const deleteLeadComment = Effect.fn("LeadCollaboration.deleteComment")(function* (
  params: DeleteLeadCommentParams
) {
  const target = yield* resolveLeadTarget(params)
  yield* deleteAttachedComment(
    commentTarget(target.client, target.lead),
    params.commentId,
    commentNotFound(target.lead, params.commentId)
  )
  return { identifier: target.lead.identifier, commentId: params.commentId, changed: true }
})

export const listLeadAttachments = Effect.fn("LeadCollaboration.listAttachments")(function* (
  params: ListLeadAttachmentsParams
) {
  const target = yield* resolveLeadTarget(params)
  const page = yield* listAttachmentPageForScope(target.client, attachmentScope(target.lead), params.limit)
  return { identifier: target.lead.identifier, attachments: page.attachments, total: page.total }
})

export const addLeadAttachment = Effect.fn("LeadCollaboration.addAttachment")(function* (
  params: AddLeadAttachmentParams
) {
  const target = yield* resolveLeadTarget(params)
  const result = yield* uploadAndAttach(params, {
    spaceRef: toRef<Space>(target.lead.space),
    objectRef: toRef<Doc>(target.lead._id),
    objectClassRef: leadClassIds.class.Lead,
    collection: "attachments"
  })
  return { identifier: target.lead.identifier, ...result }
})

export const getLeadAttachment = Effect.fn("LeadCollaboration.getAttachment")(function* (
  params: GetLeadAttachmentParams
) {
  const target = yield* resolveLeadTarget(params)
  const storage = yield* HulyStorageClient
  const value = yield* getAttachmentForScope(target.client, storage, params.attachmentId, attachmentScope(target.lead))
  return { identifier: target.lead.identifier, attachment: value }
})

export const updateLeadAttachment = Effect.fn("LeadCollaboration.updateAttachment")(function* (
  params: UpdateLeadAttachmentParams
) {
  const target = yield* resolveLeadTarget(params)
  yield* updateAttachmentForScope(target.client, params.attachmentId, params, attachmentScope(target.lead))
  return { identifier: target.lead.identifier, attachmentId: params.attachmentId, changed: TRUE }
})

export const deleteLeadAttachment = Effect.fn("LeadCollaboration.deleteAttachment")(function* (
  params: DeleteLeadAttachmentParams
) {
  const target = yield* resolveLeadTarget(params)
  const value = yield* findAttachmentForScope(target.client, params.attachmentId, attachmentScope(target.lead))
  yield* target.client.removeDoc<HulyAttachment>(attachment.class.Attachment, value.space, value._id)
  return { identifier: target.lead.identifier, attachmentId: params.attachmentId, changed: TRUE }
})

export const listLeadLabelDefinitions = Effect.fn("LeadCollaboration.listLabelDefinitions")(function* (
  params: ListLeadLabelDefinitionsParams
) {
  const labels = yield* listTags({ targetClass: LEAD_LABEL_TARGET_CLASS, ...params })
  return {
    labels: labels.map(
      (label): ModuleLabelDefinition => ({
        id: label.id,
        title: label.title,
        description: label.description,
        color: label.color,
        ...(label.refCount === undefined ? {} : { refCount: label.refCount })
      })
    )
  }
})

export const listLeadLabels = Effect.fn("LeadCollaboration.listLabels")(function* (params: ListLeadLabelsParams) {
  const target = yield* resolveLeadTarget(params)
  const refs = yield* listTagReferencesForObject(target.client, labelObject(target.lead))
  return {
    identifier: target.lead.identifier,
    labels: refs.map((ref) => {
      const label = toAttachedTagSummary(ref)
      return {
        id: label.id,
        label: label.tag,
        title: label.title,
        color: label.color,
        ...(label.weight === undefined ? {} : { weight: label.weight })
      }
    })
  }
})

export const addLeadLabel = Effect.fn("LeadCollaboration.addLabel")(function* (params: AddLeadLabelParams) {
  const target = yield* resolveLeadTarget(params)
  const label = yield* ensureTagElement({
    targetClass: LEAD_LABEL_TARGET_CLASS,
    titleOrId: params.label,
    color: params.color
  })
  const result = yield* attachTagReference({ ...labelObject(target.lead), tag: label, weight: params.weight })
  const identity = {
    identifier: target.lead.identifier,
    id: result.id,
    label: result.tag,
    title: NonEmptyString.make(result.title)
  }
  if (label.created) return { ...identity, attached: TRUE, labelCreated: TRUE }
  return result.attached
    ? { ...identity, attached: TRUE, labelCreated: FALSE }
    : { ...identity, attached: FALSE, labelCreated: FALSE }
})

export const updateLeadLabel = Effect.fn("LeadCollaboration.updateLabel")(function* (params: UpdateLeadLabelParams) {
  const target = yield* resolveLeadTarget(params)
  const label = yield* findTagElementOrFail(target.client, LEAD_LABEL_TARGET_CLASS, params.label)
  const refs = (yield* listTagReferencesForObject(target.client, labelObject(target.lead))).filter(
    (ref) => ref.tag === label._id
  )
  yield* Effect.forEach(refs, (ref) =>
    target.client.updateDoc<TagReference>(tags.class.TagReference, ref.space, ref._id, { weight: params.weight })
  )
  return refs.length === 0
    ? { identifier: target.lead.identifier, updated: FALSE, updatedCount: ZERO }
    : { identifier: target.lead.identifier, updated: TRUE, updatedCount: PositiveInteger.make(refs.length) }
})

export const removeLeadLabel = Effect.fn("LeadCollaboration.removeLabel")(function* (params: RemoveLeadLabelParams) {
  const target = yield* resolveLeadTarget(params)
  const label = toResolvedTagElement(
    yield* findTagElementOrFail(target.client, LEAD_LABEL_TARGET_CLASS, params.label),
    false
  )
  const result = yield* detachTagReference({ ...labelObject(target.lead), tag: label })
  const identity = {
    identifier: target.lead.identifier,
    label: TagElementId.make(label.id),
    title: NonEmptyString.make(label.title)
  }
  return result.detached
    ? { ...identity, detached: TRUE, detachedCount: PositiveInteger.make(result.detachedCount) }
    : { ...identity, detached: FALSE, detachedCount: ZERO }
})
