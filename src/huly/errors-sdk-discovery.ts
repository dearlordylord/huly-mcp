import { Schema } from "effect"

import { ObjectClassName } from "../domain/schemas/shared.js"

export class HulyClassNotFoundError extends Schema.TaggedError<HulyClassNotFoundError>()(
  "HulyClassNotFoundError",
  {
    classId: ObjectClassName
  }
) {
  override get message(): string {
    return `Huly class '${this.classId}' was not found in the workspace model. Call list_huly_classes to discover valid class IDs.`
  }
}
