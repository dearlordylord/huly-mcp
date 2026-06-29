/**
 * Native reference support for issue description writes.
 *
 * @module
 */
import type { MarkupFormat } from "@hcengineering/api-client"
import { Effect } from "effect"

import { HulyClient } from "../client.js"
import { IssueReferenceError } from "../errors.js"
import { renderMarkdownWithNativeReferencesForWrite } from "./native-reference-markup.js"

interface RenderedIssueDescription {
  readonly markup: string
  readonly format: MarkupFormat
}

export const renderIssueDescriptionForWrite = (description: string): Effect.Effect<
  RenderedIssueDescription,
  IssueReferenceError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const rendered = renderMarkdownWithNativeReferencesForWrite(description, client.markupUrlConfig, "description")
    if (rendered._tag === "malformed") {
      return yield* new IssueReferenceError({ reason: rendered.reason })
    }

    return rendered.rendered
  })
