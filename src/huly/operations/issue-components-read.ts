import type { Component, Issue as HulyIssue, Project } from "@hcengineering/tracker"
import { Effect, Option, Schema } from "effect"

import { IssueComponentRefSchema, type IssueComponentRef } from "../../domain/schemas/issue-component-ref.js"
import { ComponentId } from "../../domain/schemas/shared.js"
import { IssueComponentMetadataDegradedWarningCode } from "../../domain/schemas/tool-warnings.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { Diagnostics } from "../diagnostics.js"
import { tracker } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"

type ComponentIndex = ReadonlyMap<ComponentId, IssueComponentRef>

export const componentForIssue = (index: ComponentIndex, issue: HulyIssue): IssueComponentRef | undefined =>
  issue.component == null ? undefined : index.get(ComponentId.make(issue.component))

export const loadIssueComponentIndex = Effect.fn("loadIssueComponentIndex")(function* (
  client: HulyClient["Service"],
  project: Project,
  issues: ReadonlyArray<HulyIssue>
): Effect.fn.Return<ComponentIndex, HulyClientError, Diagnostics> {
  const refs = [...new Set(issues.flatMap((issue) => (issue.component == null ? [] : [issue.component])))]
  const index = new Map<ComponentId, IssueComponentRef>()
  if (refs.length === 0) return index
  const rows = yield* client.findAll<Component>(
    tracker.class.Component,
    hulyQuery<Component>({ space: project._id, _id: { $in: refs } })
  )
  const decode = Schema.decodeUnknownOption(IssueComponentRefSchema)
  for (const row of rows) {
    const component = decode({ id: row._id, label: row.label })
    if (Option.isSome(component)) index.set(component.value.id, component.value)
  }
  const missing = refs.filter((ref) => !index.has(ComponentId.make(ref))).length
  if (missing > 0) {
    const diagnostics = yield* Diagnostics
    yield* diagnostics.warnAgent({
      code: IssueComponentMetadataDegradedWarningCode,
      message: `${missing} unresolved component reference(s) were omitted from issue results.`
    })
  }
  return index
})
