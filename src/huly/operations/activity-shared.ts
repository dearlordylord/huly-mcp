import type { ActivityMessage as HulyActivityMessage } from "@hcengineering/activity"

import { ActivityCount, type ActivityMessage } from "../../domain/schemas/activity.js"
import { ActivityMarkdown, ActivityMarkup } from "../../domain/schemas/domain-values.js"
import { ActivityMessageId, DocId, ObjectClassName, PersonId, Timestamp } from "../../domain/schemas/shared.js"
import type { HulyClient } from "../client.js"
import { ActivityMessageNotFoundError } from "../errors.js"
import { activity } from "../huly-plugins.js"
import { markupToMarkdownString } from "./markup.js"
import { findOneOrFail, hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

const optionalNullableTimestamp = (value: number | null | undefined): Timestamp | null | undefined =>
  value === undefined || value === null ? value : Timestamp.make(value)

const optionalActivityCount = (value: number | undefined): ActivityCount | undefined =>
  value === undefined ? undefined : ActivityCount.make(value)

const optionalStringProperty = (value: object, key: string): string | undefined => {
  const raw = Reflect.get(value, key)
  return typeof raw === "string" && raw.length > 0 ? raw : undefined
}

const messageMarkup = (message: HulyActivityMessage): string | undefined => optionalStringProperty(message, "message")

export const toActivityMessage = (
  msg: HulyActivityMessage,
  markupUrlConfig: HulyClient["Type"]["markupUrlConfig"]
): ActivityMessage => {
  const body = messageMarkup(msg)
  const markdownBody = body === undefined ? undefined : markupToMarkdownString(body, markupUrlConfig)
  const isReference = msg._class === activity.class.ActivityReference
  const srcDocId = isReference ? optionalStringProperty(msg, "srcDocId") : undefined
  const srcDocClass = isReference ? optionalStringProperty(msg, "srcDocClass") : undefined
  const attachedDocId = isReference ? optionalStringProperty(msg, "attachedDocId") : undefined
  const attachedDocClass = isReference ? optionalStringProperty(msg, "attachedDocClass") : undefined
  const rawAction = msg._class === activity.class.DocUpdateMessage ? optionalStringProperty(msg, "action") : undefined
  const action = rawAction === "create" || rawAction === "update" || rawAction === "remove" ? rawAction : undefined
  const replies = optionalActivityCount(msg.replies)
  const reactions = optionalActivityCount(msg.reactions)
  const editedOn = optionalNullableTimestamp(msg.editedOn)
  const srcDocIdValue = srcDocId === undefined ? undefined : DocId.make(srcDocId)
  const srcDocClassValue = srcDocClass === undefined ? undefined : ObjectClassName.make(srcDocClass)
  const attachedDocIdValue = attachedDocId === undefined ? undefined : DocId.make(attachedDocId)
  const attachedDocClassValue = attachedDocClass === undefined ? undefined : ObjectClassName.make(attachedDocClass)

  return {
    id: ActivityMessageId.make(msg._id),
    messageClass: ObjectClassName.make(msg._class),
    objectId: DocId.make(msg.attachedTo),
    objectClass: ObjectClassName.make(msg.attachedToClass),
    modifiedBy: PersonId.make(msg.modifiedBy),
    modifiedOn: Timestamp.make(msg.modifiedOn),
    ...(msg.isPinned === undefined ? {} : { isPinned: msg.isPinned }),
    ...(replies === undefined ? {} : { replies }),
    ...(reactions === undefined ? {} : { reactions }),
    ...(editedOn === undefined ? {} : { editedOn }),
    ...(action === undefined ? {} : { action }),
    ...(body === undefined ? {} : { message: ActivityMarkup.make(body) }),
    ...(markdownBody === undefined ? {} : { body: ActivityMarkdown.make(markdownBody) }),
    ...(srcDocIdValue === undefined ? {} : { srcDocId: srcDocIdValue }),
    ...(srcDocClassValue === undefined ? {} : { srcDocClass: srcDocClassValue }),
    ...(attachedDocIdValue === undefined ? {} : { attachedDocId: attachedDocIdValue }),
    ...(attachedDocClassValue === undefined ? {} : { attachedDocClass: attachedDocClassValue })
  }
}

export const findActivityMessage = (
  client: HulyClient["Type"],
  messageId: ActivityMessageId
) =>
  findOneOrFail(
    client,
    activity.class.ActivityMessage,
    hulyQuery<HulyActivityMessage>({ _id: toRef<HulyActivityMessage>(messageId) }),
    () => new ActivityMessageNotFoundError({ messageId })
  )
