import {
  getSupportStatusParamsJsonSchema,
  GetSupportStatusResultSchema,
  parseGetSupportStatusParams
} from "../../domain/schemas/support.js"
import { getSupportStatus } from "../../huly/operations/support.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "support" as const

export const supportTools = [
  defineTool(
    {
      name: "get_support_status",
      description:
        "Discover Huly support-widget model/setup and the authenticated account's private stored status rows in one read-only call. Returns supported=false when either required workspace classifier is unavailable; otherwise setup is missing when no SupportSystem exists, configured for exactly one, or ambiguous with every candidate instead of choosing nondeterministically. providerConversationId is opaque and storedHasUnreadMessages is only a persisted fallback with no provider-freshness guarantee. Malformed private rows are skipped with an agent warning that never includes provider IDs. Huly exposes no support message bodies, participants, attachments, transcripts, live unread count, delivery/read status, or safe send/reply/widget-control API; this tool never loads the executable widget factory or mutates data.",
      category: CATEGORY,
      inputSchema: getSupportStatusParamsJsonSchema,
      resultSchema: GetSupportStatusResultSchema
    },
    parseGetSupportStatusParams,
    getSupportStatus
  )
] as const satisfies ReadonlyArray<RegisteredTool>
