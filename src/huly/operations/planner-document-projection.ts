import type { Document as HulyDocument } from "@hcengineering/document"
import { Result } from "effect"

import { HulyDataInvalidError } from "../errors.js"
import { decodeDocumentProjection, type DocumentProjection } from "./planner-document-projection-schemas.js"

export const parseDocumentProjection = (row: HulyDocument): Result.Result<DocumentProjection, HulyDataInvalidError> => {
  const decoded = decodeDocumentProjection({
    _id: row._id,
    space: row.space,
    title: row.title,
    ...(row.lockedBy === undefined ? {} : { lockedBy: row.lockedBy })
  })
  return decoded._tag === "Failure"
    ? Result.fail(
        new HulyDataInvalidError({ operation: "plannerDocument", entity: "document", cause: decoded.failure })
      )
    : Result.succeed(decoded.success)
}
