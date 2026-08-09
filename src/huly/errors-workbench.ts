import { Schema } from "effect"

import { Count } from "../domain/schemas/shared.js"
import { WorkbenchApplicationAlias } from "../domain/schemas/workbench.js"

const MINIMUM_AMBIGUOUS_APPLICATIONS = 2

export class WorkbenchApplicationAliasAmbiguousError extends Schema.TaggedError<WorkbenchApplicationAliasAmbiguousError>()(
  "WorkbenchApplicationAliasAmbiguousError",
  { alias: WorkbenchApplicationAlias, matches: Count.pipe(Schema.greaterThanOrEqualTo(MINIMUM_AMBIGUOUS_APPLICATIONS)) }
) {
  override get message(): string {
    return `Workbench application alias '${this.alias}' is ambiguous (${this.matches} declarations); inspect the workspace model`
  }
}
