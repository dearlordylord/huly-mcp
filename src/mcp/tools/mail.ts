import {
  listMailThreadsParamsJsonSchema,
  ListMailThreadsResultSchema,
  parseListMailThreadsParams
} from "../../domain/schemas/mail.js"
import { listMailThreads } from "../../huly/operations/mail.js"
import { defineTool, type RegisteredTool } from "./registry.js"

const CATEGORY = "mail" as const

export const mailTools = [
  defineTool(
    {
      name: "list_mail_threads",
      description:
        "Discover read-only Huly Mail thread metadata in one call: outer channel titles, human-resolved spaces, timestamps, and up to 10 newest child subject summaries per channel. This does not return message bodies or attachments and never sends, replies, mutates, or reports mailbox/delivery capability. A channelTitle may resemble a replication-recipient email but does not prove a correspondent or configured mailbox. Omit filters to list recent channels; filter by exact space name/ID or case-insensitive channel-title substring. Empty threads is a supported result.",
      category: CATEGORY,
      inputSchema: listMailThreadsParamsJsonSchema,
      resultSchema: ListMailThreadsResultSchema
    },
    parseListMailThreadsParams,
    listMailThreads
  )
] as const satisfies ReadonlyArray<RegisteredTool>
