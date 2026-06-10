import { Schema } from "effect"

import { Integer, NonEmptyString, NonNegativeInteger } from "./shared.js"

export const LocalFilePath = Schema.String.pipe(Schema.brand("LocalFilePath")).annotations({
  identifier: "LocalFilePath",
  title: "LocalFilePath",
  description:
    "Host-local file path used only as an upload transport input. It is not a Huly domain identifier and may be OS-specific."
})
export type LocalFilePath = Schema.Schema.Type<typeof LocalFilePath>

export const Base64FileData = Schema.String.pipe(Schema.brand("Base64FileData")).annotations({
  identifier: "Base64FileData",
  title: "Base64FileData",
  description:
    "Base64-encoded upload payload. It is transport data rather than a Huly domain value, but is branded to avoid arbitrary text confusion."
})
export type Base64FileData = Schema.Schema.Type<typeof Base64FileData>

export const AttachmentFileName = NonEmptyString.pipe(Schema.brand("AttachmentFileName")).annotations({
  identifier: "AttachmentFileName",
  title: "AttachmentFileName",
  description: "Non-empty attachment filename as stored by Huly."
})
export type AttachmentFileName = Schema.Schema.Type<typeof AttachmentFileName>

export const AttachmentDescription = Schema.String.pipe(Schema.brand("AttachmentDescription")).annotations({
  identifier: "AttachmentDescription",
  title: "AttachmentDescription",
  description: "Free-form attachment description. Empty string is valid because Huly uses it to clear descriptions."
})
export type AttachmentDescription = Schema.Schema.Type<typeof AttachmentDescription>

export const AttachmentByteSize = NonNegativeInteger.pipe(Schema.brand("AttachmentByteSize")).annotations({
  identifier: "AttachmentByteSize",
  title: "AttachmentByteSize",
  description: "Attachment size in bytes. Must be a non-negative integer, never a fraction or negative value."
})
export type AttachmentByteSize = Schema.Schema.Type<typeof AttachmentByteSize>

export const AttachmentMetadataKey = Schema.String.pipe(Schema.brand("AttachmentMetadataKey")).annotations({
  identifier: "AttachmentMetadataKey",
  title: "AttachmentMetadataKey",
  description: "Open attachment metadata record key supplied by the Huly SDK. It is not a closed MCP domain enum."
})
export type AttachmentMetadataKey = Schema.Schema.Type<typeof AttachmentMetadataKey>

export const DisplayText = NonEmptyString.pipe(Schema.brand("DisplayText")).annotations({
  identifier: "DisplayText",
  title: "DisplayText",
  description: "Human-readable display text from Huly model metadata or user-authored content."
})
export type DisplayText = Schema.Schema.Type<typeof DisplayText>

export const ActivityMarkup = Schema.String.pipe(Schema.brand("ActivityMarkup")).annotations({
  identifier: "ActivityMarkup",
  title: "ActivityMarkup",
  description: "Huly activity markup payload. Empty string is valid when the SDK stores cleared content."
})
export type ActivityMarkup = Schema.Schema.Type<typeof ActivityMarkup>

export const ActivityMarkdown = Schema.String.pipe(Schema.brand("ActivityMarkdown")).annotations({
  identifier: "ActivityMarkdown",
  title: "ActivityMarkdown",
  description: "Markdown projection of a Huly activity markup payload for MCP responses."
})
export type ActivityMarkdown = Schema.Schema.Type<typeof ActivityMarkdown>

export const MentionContent = Schema.String.pipe(Schema.brand("MentionContent")).annotations({
  identifier: "MentionContent",
  title: "MentionContent",
  description: "User-authored activity mention snippet returned by Huly."
})
export type MentionContent = Schema.Schema.Type<typeof MentionContent>

export const DrawingContent = Schema.String.pipe(Schema.brand("DrawingContent")).annotations({
  identifier: "DrawingContent",
  title: "DrawingContent",
  description: "Opaque drawing content payload stored by Huly."
})
export type DrawingContent = Schema.Schema.Type<typeof DrawingContent>

export const ActivityFilterPosition = Integer.pipe(Schema.brand("ActivityFilterPosition")).annotations({
  identifier: "ActivityFilterPosition",
  title: "ActivityFilterPosition",
  description: "Integer display order for an activity filter."
})
export type ActivityFilterPosition = Schema.Schema.Type<typeof ActivityFilterPosition>

export const NotificationProviderOrder = Integer.pipe(Schema.brand("NotificationProviderOrder")).annotations({
  identifier: "NotificationProviderOrder",
  title: "NotificationProviderOrder",
  description: "Integer display order for a notification provider."
})
export type NotificationProviderOrder = Schema.Schema.Type<typeof NotificationProviderOrder>

export const NotificationFieldName = NonEmptyString.pipe(Schema.brand("NotificationFieldName")).annotations({
  identifier: "NotificationFieldName",
  title: "NotificationFieldName",
  description: "Huly document field name associated with a notification type."
})
export type NotificationFieldName = Schema.Schema.Type<typeof NotificationFieldName>
