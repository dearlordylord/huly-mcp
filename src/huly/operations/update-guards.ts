import { Effect } from "effect"

import { hasAtLeastOneDefined } from "../../domain/schemas/shared.js"
import { NoUpdateFieldsError } from "../errors.js"

export const requireUpdateFields = <K extends string>(
  operation: string,
  params: { readonly [P in K]?: unknown },
  fields: ReadonlyArray<K>
): Effect.Effect<void, NoUpdateFieldsError> =>
  hasAtLeastOneDefined(params, fields)
    ? Effect.void
    : Effect.fail(new NoUpdateFieldsError({ operation, fields: fields.map(String) }))

export const mergeUpdateEntries = <T extends object>(entries: ReadonlyArray<T>): T => Object.assign({}, ...entries)
