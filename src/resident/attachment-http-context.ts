import { Effect } from "effect"
import { McpSchema } from "effect/ai"

import { AttachmentTelemetry } from "../telemetry/attachment-context.js"
import { RequestWorkOwner } from "../runtime/request-work.js"
import type { makeAttachmentOwner } from "./attachment-owner.js"

export const attachmentRequestOwner = (attachment: Effect.Success<ReturnType<typeof makeAttachmentOwner>>) =>
  RequestWorkOwner.of({
    withWork: ({ cleanup, use }) =>
      attachment.withWork({
        use: (owner) => {
          const scoped = Effect.provideService(use, McpSchema.McpHttpSessionOwner, owner)
          return attachment.observation === undefined
            ? scoped
            : Effect.provideService(scoped, AttachmentTelemetry, attachment.observation.context)
        },
        cleanup: () => cleanup
      })
  })
