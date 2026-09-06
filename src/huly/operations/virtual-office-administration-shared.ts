import type { Floor } from "@hcengineering/love"
import { Effect } from "effect"

import { Count } from "../../domain/schemas/shared.js"
import type { FloorIdentifier } from "../../domain/schemas/virtual-office-administration.js"
import type { HulyClient, HulyClientError } from "../client.js"
import { OfficeFloorIdentifierAmbiguousError, OfficeFloorNotFoundError } from "../errors-love.js"
import { love } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"

export type OfficeFloorResolutionError =
  | HulyClientError
  | OfficeFloorIdentifierAmbiguousError
  | OfficeFloorNotFoundError

export const resolveOfficeFloor = Effect.fn("VirtualOffice.resolveFloor")(function* (
  client: HulyClient["Service"],
  identifier: FloorIdentifier
): Effect.fn.Return<Floor, OfficeFloorResolutionError> {
  const floors = yield* client.findAll<Floor>(love.class.Floor, hulyQuery<Floor>({}))
  const idMatch = floors.find((floor) => String(floor._id) === String(identifier))
  if (idMatch !== undefined) return idMatch

  const nameMatches = floors.filter((floor) => floor.name === identifier)
  if (nameMatches.length === 0) return yield* new OfficeFloorNotFoundError({ identifier })
  if (nameMatches.length > 1) {
    return yield* new OfficeFloorIdentifierAmbiguousError({ identifier, matches: Count.make(nameMatches.length) })
  }

  const [nameMatch] = nameMatches
  if (nameMatch === undefined) return yield* new OfficeFloorNotFoundError({ identifier })
  return nameMatch
})
