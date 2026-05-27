import { Schema } from "effect"

import {
  AssociationName,
  CardinalitySchema,
  RelationEndpointFieldSchema
} from "../domain/schemas/generic-associations.js"
import { AssociationId, DocId, ObjectClassName, RelationId } from "../domain/schemas/shared.js"

const CandidateSchema = Schema.Struct({
  id: AssociationId,
  name: Schema.optional(AssociationName),
  sourceClass: Schema.optional(ObjectClassName),
  targetClass: Schema.optional(ObjectClassName)
})

type Candidate = Schema.Schema.Type<typeof CandidateSchema>

const formatCandidates = (candidates: ReadonlyArray<Candidate>): string =>
  candidates.map((candidate) => {
    const name = candidate.name === undefined ? "" : `${candidate.name} `
    const classes = candidate.sourceClass === undefined || candidate.targetClass === undefined
      ? ""
      : ` ${candidate.sourceClass} -> ${candidate.targetClass}`
    return `${name}(${candidate.id}${classes})`
  }).join("; ")

export class AssociationNotFoundError extends Schema.TaggedError<AssociationNotFoundError>()(
  "AssociationNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Association '${this.identifier}' not found. Call list_associations to discover valid association IDs.`
  }
}

export class AssociationIdentifierAmbiguousError extends Schema.TaggedError<AssociationIdentifierAmbiguousError>()(
  "AssociationIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    candidates: Schema.Array(CandidateSchema)
  }
) {
  override get message(): string {
    return `Association '${this.identifier}' matched multiple definitions: ${
      formatCandidates(this.candidates)
    }. Call list_associations with sourceClass and targetClass to choose one.`
  }
}

export class RelationNotFoundError extends Schema.TaggedError<RelationNotFoundError>()(
  "RelationNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Relation '${this.identifier}' not found.`
  }
}

export class RelationIdentifierAmbiguousError extends Schema.TaggedError<RelationIdentifierAmbiguousError>()(
  "RelationIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    relationIds: Schema.Array(RelationId)
  }
) {
  override get message(): string {
    return `Relation selector '${this.identifier}' matched multiple relations: ${
      this.relationIds.join(", ")
    }. Delete by relation ID instead.`
  }
}

export class RelationMutationUnsupportedError extends Schema.TaggedError<RelationMutationUnsupportedError>()(
  "RelationMutationUnsupportedError",
  {
    associationId: Schema.optional(AssociationId),
    reason: Schema.String
  }
) {
  override get message(): string {
    const id = this.associationId === undefined ? "" : ` for association '${this.associationId}'`
    return `Generic relation mutation${id} is not supported: ${this.reason}. Call list_associations with writableOnly=true to discover writable associations.`
  }
}

export class AssociationSystemClassUnsupportedError
  extends Schema.TaggedError<AssociationSystemClassUnsupportedError>()(
    "AssociationSystemClassUnsupportedError",
    {
      className: ObjectClassName,
      operation: Schema.Literal("create_association", "delete_association", "create_relation", "delete_relation")
    }
  )
{
  override get message(): string {
    return `${this.operation} does not support core system class '${this.className}' in generic association writes.`
  }
}

export class AssociationConflictError extends Schema.TaggedError<AssociationConflictError>()(
  "AssociationConflictError",
  {
    associationId: AssociationId,
    reason: Schema.String
  }
) {
  override get message(): string {
    return `Association '${this.associationId}' already exists but conflicts with the requested definition: ${this.reason}.`
  }
}

export class AssociationInUseError extends Schema.TaggedError<AssociationInUseError>()(
  "AssociationInUseError",
  {
    associationId: AssociationId,
    relationCount: Schema.Number,
    sampleRelationIds: Schema.Array(RelationId)
  }
) {
  override get message(): string {
    const sample = this.sampleRelationIds.length === 0
      ? ""
      : ` Sample relation IDs: ${this.sampleRelationIds.join(", ")}.`
    return `Association '${this.associationId}' cannot be deleted because ${this.relationCount} relation(s) still reference it. Delete those relations first.${sample}`
  }
}

export class RelationCardinalityViolationError extends Schema.TaggedError<RelationCardinalityViolationError>()(
  "RelationCardinalityViolationError",
  {
    associationId: AssociationId,
    cardinality: CardinalitySchema,
    reason: Schema.String
  }
) {
  override get message(): string {
    return `Relation violates ${this.cardinality} cardinality for association '${this.associationId}': ${this.reason}.`
  }
}

export class RelationDirectionAmbiguousError extends Schema.TaggedError<RelationDirectionAmbiguousError>()(
  "RelationDirectionAmbiguousError",
  {
    associationId: AssociationId,
    reason: Schema.String
  }
) {
  override get message(): string {
    return `Relation direction is ambiguous for association '${this.associationId}': ${this.reason}. Use source-to-target or target-to-source.`
  }
}

export class RelationEndpointClassMismatchError extends Schema.TaggedError<RelationEndpointClassMismatchError>()(
  "RelationEndpointClassMismatchError",
  {
    field: RelationEndpointFieldSchema,
    expectedClass: Schema.String,
    actualClass: Schema.String
  }
) {
  override get message(): string {
    return `Relation endpoint '${this.field}' has class '${this.actualClass}', expected '${this.expectedClass}'.`
  }
}

export class GenericObjectIdentifierAmbiguousError extends Schema.TaggedError<GenericObjectIdentifierAmbiguousError>()(
  "GenericObjectIdentifierAmbiguousError",
  {
    field: RelationEndpointFieldSchema,
    identifier: Schema.String,
    candidates: Schema.Array(Schema.Struct({
      id: DocId,
      class: ObjectClassName,
      display: Schema.String
    }))
  }
) {
  override get message(): string {
    const candidates = this.candidates.map((candidate) => `${candidate.display} (${candidate.id}, ${candidate.class})`)
      .join("; ")
    return `Object locator '${this.field}' for '${this.identifier}' is ambiguous. Use a raw locator with one of these IDs: ${candidates}`
  }
}

export class GenericObjectLocatorInvalidError extends Schema.TaggedError<GenericObjectLocatorInvalidError>()(
  "GenericObjectLocatorInvalidError",
  {
    field: RelationEndpointFieldSchema,
    reason: Schema.String
  }
) {
  override get message(): string {
    return `Object locator '${this.field}' is invalid: ${this.reason}`
  }
}

export class GenericObjectNotFoundError extends Schema.TaggedError<GenericObjectNotFoundError>()(
  "GenericObjectNotFoundError",
  {
    field: RelationEndpointFieldSchema,
    identifier: Schema.String,
    class: Schema.optional(Schema.String)
  }
) {
  override get message(): string {
    const classHint = this.class === undefined ? "" : ` with class '${this.class}'`
    return `Object locator '${this.field}' for '${this.identifier}'${classHint} not found.`
  }
}
