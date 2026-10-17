import { Effect } from "effect"
import { McpSchema } from "effect/ai"

import { RequestWorkOwner } from "../runtime/request-work.js"
import type { makeAttachmentOwner } from "./attachment-owner.js"

export const attachmentRequestOwner = (attachment: Effect.Success<ReturnType<typeof makeAttachmentOwner>>) =>
  RequestWorkOwner.of({
    withWork: ({ cleanup, use }) =>
      attachment.withWork({
        use: (owner) => Effect.provideService(use, McpSchema.McpHttpSessionOwner, owner),
        cleanup: () => cleanup
      })
  })
