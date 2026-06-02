import type { HulyClassToolHint } from "../../domain/schemas/sdk-discovery.js"
import { NonEmptyString } from "../../domain/schemas/shared.js"
import { cardPlugin, chunter, contact, documentPlugin, tracker } from "../huly-plugins.js"

const toolHint = (category: string, exampleTools: ReadonlyArray<string>): HulyClassToolHint => ({
  category: NonEmptyString.make(category),
  exampleTools: exampleTools.map((tool) => NonEmptyString.make(tool))
})

export const firstClassToolHints = new Map<string, ReadonlyArray<HulyClassToolHint>>([
  [String(tracker.class.Project), [toolHint("projects", ["list_projects", "get_project", "create_project"])]],
  [String(tracker.class.Issue), [toolHint("issues", ["list_issues", "get_issue", "create_issue"])]],
  [
    String(documentPlugin.class.Teamspace),
    [toolHint("documents", ["list_teamspaces", "create_teamspace"])]
  ],
  [
    String(documentPlugin.class.Document),
    [toolHint("documents", ["list_documents", "get_document", "create_document"])]
  ],
  [String(contact.class.Person), [toolHint("contacts", ["list_persons", "get_person", "create_person"])]],
  [
    String(contact.class.Organization),
    [toolHint("contacts", ["list_organizations", "get_organization", "create_organization"])]
  ],
  [String(cardPlugin.class.Card), [toolHint("cards", ["list_cards", "get_card", "create_card"])]],
  [String(cardPlugin.class.CardSpace), [toolHint("cards", ["list_card_spaces"])]],
  [String(chunter.class.ChatMessage), [toolHint("channels", ["list_channel_messages", "send_channel_message"])]]
])
