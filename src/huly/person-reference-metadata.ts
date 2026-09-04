import type { AnyAttribute } from "@hcengineering/core"
import { Effect, Schema } from "effect"

import type { PersonMergeReferenceKind } from "../domain/schemas/person-merge.js"
import { DocId, NonEmptyString, ObjectClassName } from "../domain/schemas/shared.js"
import { HulyDataInvalidError } from "./errors.js"
import { core } from "./huly-plugins.js"

const ReferenceTypeMetadataSchema = Schema.Struct({
  _class: ObjectClassName,
  to: Schema.optionalKey(Schema.Unknown),
  of: Schema.optionalKey(Schema.Unknown)
})

const RefToMetadataSchema = Schema.Struct({ _class: Schema.Literal(String(core.class.RefTo)), to: ObjectClassName })

const ArrOfMetadataSchema = Schema.Struct({
  _class: Schema.Literal(String(core.class.ArrOf)),
  of: ReferenceTypeMetadataSchema
})

const ReferenceAttributeSchema = Schema.Struct({
  _id: DocId,
  attributeOf: ObjectClassName,
  name: NonEmptyString,
  type: ReferenceTypeMetadataSchema
})
export type ReferenceAttribute = Schema.Schema.Type<typeof ReferenceAttributeSchema>

export interface ParsedReferenceAttribute {
  // The raw SDK document is retained only for Huly's native updateAttribute API;
  // ReferenceAttribute is the schema-owned shape used for every decision.
  readonly raw: AnyAttribute
  readonly parsed: ReferenceAttribute
}

export type ReferenceOperation = "inspectPersonReferences" | "migratePersonReferences"

export interface ReferenceDescriptor {
  readonly kind: PersonMergeReferenceKind
  readonly target: ObjectClassName
}

export const invalidReferenceData = (
  operation: ReferenceOperation,
  entity: string,
  cause?: unknown
): HulyDataInvalidError => new HulyDataInvalidError({ operation, entity, ...(cause === undefined ? {} : { cause }) })

const decodeReferenceAttribute = Schema.decodeUnknownEffect(ReferenceAttributeSchema)
const decodeRefToMetadata = Schema.decodeUnknownEffect(RefToMetadataSchema)
const decodeArrOfMetadata = Schema.decodeUnknownEffect(ArrOfMetadataSchema)

export const parseReferenceAttribute = (
  input: unknown,
  operation: ReferenceOperation,
  entity: string
): Effect.Effect<ReferenceAttribute, HulyDataInvalidError> =>
  decodeReferenceAttribute(input).pipe(Effect.mapError((cause) => invalidReferenceData(operation, entity, cause)))

export const parseReferenceAttributes = (
  attributes: ReadonlyArray<AnyAttribute>
): Effect.Effect<ReadonlyArray<ParsedReferenceAttribute>, HulyDataInvalidError> =>
  Effect.forEach(attributes, (raw) =>
    parseReferenceAttribute(raw, "inspectPersonReferences", "model Attribute").pipe(
      Effect.map((parsed) => ({ raw, parsed }))
    )
  )

export const referenceDescriptor = Effect.fn("PersonReferenceMigration.referenceDescriptor")(function* (
  attribute: ReferenceAttribute,
  operation: ReferenceOperation
): Effect.fn.Return<ReferenceDescriptor | undefined, HulyDataInvalidError> {
  const entity = `Attribute '${attribute._id}' reference type`
  if (attribute.type._class === String(core.class.RefTo)) {
    const metadata = yield* decodeRefToMetadata(attribute.type).pipe(
      Effect.mapError((cause) => invalidReferenceData(operation, entity, cause))
    )
    return { kind: "single", target: metadata.to }
  }
  if (attribute.type._class === String(core.class.ArrOf)) {
    const metadata = yield* decodeArrOfMetadata(attribute.type).pipe(
      Effect.mapError((cause) => invalidReferenceData(operation, entity, cause))
    )
    if (metadata.of._class !== String(core.class.RefTo)) return undefined
    const element = yield* decodeRefToMetadata(metadata.of).pipe(
      Effect.mapError((cause) => invalidReferenceData(operation, entity, cause))
    )
    return { kind: "array", target: element.to }
  }
  return undefined
})
