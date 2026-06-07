import { Effect } from "effect"

import { hasAtLeastOneDefined } from "../../domain/schemas/shared.js"
import { NoUpdateFieldsError } from "../errors.js"

type UpdateOperatorRecord = Readonly<Record<string, unknown>>

interface UpdateOperatorEntries {
  readonly $inc?: UpdateOperatorRecord
  readonly $pull?: UpdateOperatorRecord
  readonly $push?: UpdateOperatorRecord
  readonly $unset?: UpdateOperatorRecord
  readonly $update?: UpdateOperatorRecord
}

type EmptyUpdateEntry<Fields extends string> = {
  readonly [Field in Fields]?: never
}

export type DirectUpdateEntry<
  Fields extends string,
  Update extends object,
  Field extends Fields & keyof Update
> =
  | EmptyUpdateEntry<Fields>
  | {
    readonly [Key in Field]-?: Exclude<Update[Key], undefined>
  }

export type DirectUpdateSubsetEntry<Fields extends string, Update extends object> =
  | EmptyUpdateEntry<Fields>
  | {
    readonly [Field in Fields]?: Field extends keyof Update ? Exclude<Update[Field], undefined> : never
  }

type UnsetUpdateEntry<Field extends string> = {
  readonly $unset: {
    readonly [Key in Field]-?: ""
  }
}

export type DirectOrUnsetUpdateEntry<
  Fields extends string,
  Update extends object,
  Field extends Fields & keyof Update
> = DirectUpdateEntry<Fields, Update, Field> | UnsetUpdateEntry<Field>

export interface CoveredUpdateEntry<Field extends string, Update extends object> {
  readonly field: Field
  readonly operations: Update
}

export const requireUpdateFields = <K extends string>(
  operation: string,
  params: { readonly [P in K]?: unknown },
  fields: ReadonlyArray<K>
): Effect.Effect<void, NoUpdateFieldsError> =>
  hasAtLeastOneDefined(params, fields)
    ? Effect.void
    : Effect.fail(new NoUpdateFieldsError({ operation, fields: fields.map(String) }))

const mergeOperatorEntries = (
  entries: ReadonlyArray<UpdateOperatorRecord | undefined>
): UpdateOperatorRecord | undefined => {
  const present = entries.filter((entry): entry is UpdateOperatorRecord => entry !== undefined)
  return present.length === 0 ? undefined : Object.assign({}, ...present)
}

export const coveredUpdateEntry = <Field extends string, Update extends object>(
  field: Field,
  operations: Update
): CoveredUpdateEntry<Field, Update> => ({ field, operations })

export const mergeUpdateEntries = <T extends object & UpdateOperatorEntries>(
  entries: ReadonlyArray<T>
): object & UpdateOperatorEntries => {
  const merged = Object.assign({}, ...entries)
  const inc = mergeOperatorEntries(entries.map((entry) => entry.$inc))
  const pull = mergeOperatorEntries(entries.map((entry) => entry.$pull))
  const push = mergeOperatorEntries(entries.map((entry) => entry.$push))
  const unset = mergeOperatorEntries(entries.map((entry) => entry.$unset))
  const update = mergeOperatorEntries(entries.map((entry) => entry.$update))

  return Object.assign(
    {},
    merged,
    inc === undefined ? {} : { $inc: inc },
    pull === undefined ? {} : { $pull: pull },
    push === undefined ? {} : { $push: push },
    unset === undefined ? {} : { $unset: unset },
    update === undefined ? {} : { $update: update }
  )
}

export const mergeCoveredUpdateEntries = (
  entries: ReadonlyArray<CoveredUpdateEntry<string, object & UpdateOperatorEntries>>
): object & UpdateOperatorEntries => mergeUpdateEntries(entries.map((entry) => entry.operations))
