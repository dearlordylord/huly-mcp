import { reportTelemetry } from "./events.js"
import { Context, Effect, Option } from "effect"

// Internal request capability: IDs are independent analytics UUIDs, never credentials.
export class AttachmentTelemetry extends Context.Service<
  AttachmentTelemetry,
  { readonly id: string; readonly observeActivity: () => void }
>()("@hulymcp/AttachmentTelemetry") {}

export const currentAttachmentTelemetry = Effect.serviceOption(AttachmentTelemetry)
export const observeAttachmentActivity = Effect.map(currentAttachmentTelemetry, (attachment) => {
  if (Option.isSome(attachment)) reportTelemetry(attachment.value.observeActivity)
  return Option.isSome(attachment) ? attachment.value.id : undefined
})
