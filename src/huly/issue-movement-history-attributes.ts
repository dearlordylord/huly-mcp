import type { Hierarchy } from "@hcengineering/core"
import { Result, Schema } from "effect"
import { NonEmptyString, ObjectClassName } from "../domain/schemas/shared.js"
import { HulyDataInvalidError } from "./errors-base.js"
import { core, tracker } from "./huly-plugins.js"
import { MovementHistoryAttributeSchema, type MovementHistoryAttribute } from "./issue-movement-transactions.js"
import { toClassRef } from "./operations/sdk-boundary.js"

const AttributeTypeSchema = Schema.Struct({
  _class: ObjectClassName,
  to: Schema.optionalKey(ObjectClassName),
  of: Schema.optionalKey(
    Schema.Struct({ _class: Schema.optionalKey(ObjectClassName), to: Schema.optionalKey(ObjectClassName) })
  )
})
const AttributeSchema = Schema.Struct({ hidden: Schema.optionalKey(Schema.Boolean), type: AttributeTypeSchema })
const invalidMetadata = () =>
  new HulyDataInvalidError({ operation: "move_issue", entity: "movement history attribute metadata" })

export const parseMovementHistoryAttributes = (
  hierarchy: Hierarchy,
  operations: Schema.Schema.Type<typeof Schema.JsonObject>
): Result.Result<ReadonlyArray<MovementHistoryAttribute>, HulyDataInvalidError> => {
  try {
    const keys = Object.entries(operations)
      .flatMap(([key, value]) =>
        ["$push", "$pull", "$unset"].includes(key) && typeof value === "object" && value !== null
          ? Object.keys(value)
          : [key]
      )
      .filter((key) => !key.startsWith("$"))
    const attributes: MovementHistoryAttribute[] = []
    for (const key of new Set(keys)) {
      const raw: unknown = hierarchy.findAttribute(tracker.class.Issue, key)
      if (raw === undefined) continue
      const attribute = Schema.decodeUnknownResult(AttributeSchema)(raw)
      if (Result.isFailure(attribute)) return Result.fail(invalidMetadata())
      if (attribute.success.hidden === true) continue
      const parsed = parseHistoryAttribute(hierarchy, key, attribute.success.type)
      if (Result.isFailure(parsed)) return parsed
      attributes.push(parsed.success)
    }
    return Result.succeed(attributes)
  } catch {
    return Result.fail(invalidMetadata())
  }
}

const parseHistoryAttribute = (
  hierarchy: Hierarchy,
  key: string,
  type: Schema.Schema.Type<typeof AttributeTypeSchema>
): Result.Result<MovementHistoryAttribute, HulyDataInvalidError> => {
  const attrClass =
    type.to ??
    (hierarchy.isDerived(toClassRef(type._class), core.class.ArrOf) ? type.of?._class : (type.of?.to ?? type._class))
  const input: unknown = { attrKey: NonEmptyString.make(key), attrClass }
  return Schema.decodeUnknownResult(MovementHistoryAttributeSchema)(input).pipe(Result.mapError(invalidMetadata))
}
