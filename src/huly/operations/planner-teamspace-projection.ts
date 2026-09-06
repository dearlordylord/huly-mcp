import type { Teamspace as HulyTeamspace } from "@hcengineering/document"
import { Result } from "effect"

import { HulyDataInvalidError } from "../errors.js"
import { decodeTeamspaceProjection, type TeamspaceProjection } from "./planner-document-projection-schemas.js"

export const parseTeamspaceProjection = (
  row: HulyTeamspace
): Result.Result<TeamspaceProjection, HulyDataInvalidError> => {
  const decoded = decodeTeamspaceProjection({
    _id: row._id,
    name: row.name,
    archived: row.archived,
    members: row.members
  })
  return decoded._tag === "Failure"
    ? Result.fail(
        new HulyDataInvalidError({ operation: "plannerDocument", entity: "teamspace", cause: decoded.failure })
      )
    : Result.succeed(decoded.success)
}
