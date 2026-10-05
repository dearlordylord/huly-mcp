import { Schema } from "effect"

import { ComponentId, ComponentLabel } from "./shared.js"

export const IssueComponentRefSchema = Schema.Struct({ id: ComponentId, label: ComponentLabel }).annotate({
  title: "IssueComponentRef",
  description: "Stable ID and human-readable label for the issue's assigned component."
})

export type IssueComponentRef = Schema.Schema.Type<typeof IssueComponentRefSchema>
