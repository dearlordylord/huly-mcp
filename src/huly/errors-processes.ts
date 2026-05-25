import { Schema } from "effect"

import { ProcessCandidateSchema } from "../domain/schemas/processes.js"
import { CardId, MasterTagId, NonEmptyString } from "../domain/schemas/shared.js"

const candidateList = (
  candidates: ReadonlyArray<Schema.Schema.Type<typeof ProcessCandidateSchema>>
): string =>
  candidates.map((candidate) =>
    candidate.masterTagName === undefined
      ? `${candidate.name} (${candidate.id}, masterTag ${candidate.masterTagId})`
      : `${candidate.name} (${candidate.id}, ${candidate.masterTagName})`
  ).join("; ")

export class ProcessNotFoundError extends Schema.TaggedError<ProcessNotFoundError>()(
  "ProcessNotFoundError",
  {
    identifier: Schema.String,
    candidates: Schema.Array(ProcessCandidateSchema)
  }
) {
  override get message(): string {
    const suffix = this.candidates.length === 0 ? "" : ` Available processes: ${candidateList(this.candidates)}`
    return `Process '${this.identifier}' not found.${suffix}`
  }
}

export class ProcessIdentifierAmbiguousError extends Schema.TaggedError<ProcessIdentifierAmbiguousError>()(
  "ProcessIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    candidates: Schema.Array(ProcessCandidateSchema)
  }
) {
  override get message(): string {
    return `Process name '${this.identifier}' is ambiguous. Use one of these process IDs: ${
      candidateList(this.candidates)
    }`
  }
}

export class ProcessMasterTagNotFoundError extends Schema.TaggedError<ProcessMasterTagNotFoundError>()(
  "ProcessMasterTagNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Process master tag/card type '${this.identifier}' not found`
  }
}

export class ProcessMasterTagAmbiguousError extends Schema.TaggedError<ProcessMasterTagAmbiguousError>()(
  "ProcessMasterTagAmbiguousError",
  {
    identifier: Schema.String,
    candidates: Schema.Array(Schema.Struct({
      id: MasterTagId,
      name: NonEmptyString
    }))
  }
) {
  override get message(): string {
    const candidates = this.candidates.map((candidate) => `${candidate.name} (${candidate.id})`).join("; ")
    return `Process master tag/card type '${this.identifier}' is ambiguous. Use one of these IDs: ${candidates}`
  }
}

export class ProcessCardIdentifierAmbiguousError extends Schema.TaggedError<ProcessCardIdentifierAmbiguousError>()(
  "ProcessCardIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    candidates: Schema.Array(Schema.Struct({
      id: CardId,
      title: NonEmptyString
    }))
  }
) {
  override get message(): string {
    const candidates = this.candidates.map((candidate) => `${candidate.title} (${candidate.id})`).join("; ")
    return `Card/document title '${this.identifier}' is ambiguous. Use one of these card IDs: ${candidates}`
  }
}

export class ProcessCardNotFoundError extends Schema.TaggedError<ProcessCardNotFoundError>()(
  "ProcessCardNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Card/document '${this.identifier}' not found`
  }
}
