import { Schema } from "effect"

import { AssociationId, RelationId } from "../domain/schemas/shared.js"

const CandidateSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  sourceClass: Schema.optional(Schema.String),
  targetClass: Schema.optional(Schema.String)
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

export class RelationEndpointClassMismatchError extends Schema.TaggedError<RelationEndpointClassMismatchError>()(
  "RelationEndpointClassMismatchError",
  {
    field: Schema.String,
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
    field: Schema.String,
    identifier: Schema.String,
    candidates: Schema.Array(Schema.Struct({
      id: Schema.String,
      class: Schema.String,
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
    field: Schema.String,
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
    field: Schema.String,
    identifier: Schema.String,
    class: Schema.optional(Schema.String)
  }
) {
  override get message(): string {
    const classHint = this.class === undefined ? "" : ` with class '${this.class}'`
    return `Object locator '${this.field}' for '${this.identifier}'${classHint} not found.`
  }
}
