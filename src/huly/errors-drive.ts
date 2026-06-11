/**
 * Drive domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { Count, NonEmptyString } from "../domain/schemas/shared.js"

const DriveAmbiguousMatchSchema = Schema.Struct({
  id: NonEmptyString,
  name: NonEmptyString
})

const MINIMUM_AMBIGUOUS_MATCHES = 2

const PathAmbiguousCandidateSchema = Schema.Struct({
  id: NonEmptyString,
  path: NonEmptyString,
  kind: Schema.Literal("folder", "file")
})

export class DriveNotFoundError extends Schema.TaggedError<DriveNotFoundError>()(
  "DriveNotFoundError",
  { drive: NonEmptyString }
) {
  override get message(): string {
    return `Drive '${this.drive}' not found`
  }
}

export class DriveIdentifierAmbiguousError extends Schema.TaggedError<DriveIdentifierAmbiguousError>()(
  "DriveIdentifierAmbiguousError",
  {
    drive: NonEmptyString,
    matches: Schema.Array(DriveAmbiguousMatchSchema).pipe(Schema.minItems(MINIMUM_AMBIGUOUS_MATCHES))
  }
) {
  override get message(): string {
    const matches = this.matches.map((match) => `${match.name} (${match.id})`).join(", ")
    return `Drive '${this.drive}' is ambiguous; use an exact drive id. Matches: ${matches}`
  }
}

export class DrivePathNotFoundError extends Schema.TaggedError<DrivePathNotFoundError>()(
  "DrivePathNotFoundError",
  {
    drive: NonEmptyString,
    path: NonEmptyString
  }
) {
  override get message(): string {
    return `Drive path '${this.path}' not found in drive '${this.drive}'`
  }
}

export class DrivePathAmbiguousError extends Schema.TaggedError<DrivePathAmbiguousError>()(
  "DrivePathAmbiguousError",
  {
    drive: NonEmptyString,
    path: NonEmptyString,
    candidates: Schema.Array(PathAmbiguousCandidateSchema).pipe(Schema.minItems(MINIMUM_AMBIGUOUS_MATCHES))
  }
) {
  override get message(): string {
    const matches = this.candidates.map((candidate) => `${candidate.path} (${candidate.kind} ${candidate.id})`).join(
      ", "
    )
    return `Drive path '${this.path}' in drive '${this.drive}' is ambiguous. Matches: ${matches}`
  }
}

export class DriveParentNotFolderError extends Schema.TaggedError<DriveParentNotFolderError>()(
  "DriveParentNotFolderError",
  {
    drive: NonEmptyString,
    path: NonEmptyString,
    parentPath: NonEmptyString
  }
) {
  override get message(): string {
    return `Drive parent '${this.parentPath}' for path '${this.path}' is not a folder in drive '${this.drive}'`
  }
}

export class DriveFileNotFoundError extends Schema.TaggedError<DriveFileNotFoundError>()(
  "DriveFileNotFoundError",
  {
    drive: NonEmptyString,
    file: NonEmptyString
  }
) {
  override get message(): string {
    return `Drive file '${this.file}' not found in drive '${this.drive}'`
  }
}

export class DriveFileVersionNotFoundError extends Schema.TaggedError<DriveFileVersionNotFoundError>()(
  "DriveFileVersionNotFoundError",
  {
    drive: NonEmptyString,
    file: NonEmptyString,
    version: NonEmptyString
  }
) {
  override get message(): string {
    return `Drive file version '${this.version}' for file '${this.file}' not found in drive '${this.drive}'`
  }
}

export class DriveFileCommentNotFoundError extends Schema.TaggedError<DriveFileCommentNotFoundError>()(
  "DriveFileCommentNotFoundError",
  {
    drive: NonEmptyString,
    file: NonEmptyString,
    commentId: NonEmptyString
  }
) {
  override get message(): string {
    return `Drive file comment '${this.commentId}' for file '${this.file}' not found in drive '${this.drive}'`
  }
}

export class DrivePathConflictError extends Schema.TaggedError<DrivePathConflictError>()(
  "DrivePathConflictError",
  {
    drive: NonEmptyString,
    path: NonEmptyString,
    existingKind: Schema.Literal("folder", "file")
  }
) {
  override get message(): string {
    return `Drive path '${this.path}' already exists as a ${this.existingKind} in drive '${this.drive}'`
  }
}

export class DriveInvalidMoveError extends Schema.TaggedError<DriveInvalidMoveError>()(
  "DriveInvalidMoveError",
  {
    drive: NonEmptyString,
    path: NonEmptyString,
    targetFolderPath: NonEmptyString,
    reason: NonEmptyString
  }
) {
  override get message(): string {
    return `Cannot move Drive item '${this.path}' to '${this.targetFolderPath}' in drive '${this.drive}': ${this.reason}`
  }
}

export class DriveInvalidItemOperationError extends Schema.TaggedError<DriveInvalidItemOperationError>()(
  "DriveInvalidItemOperationError",
  {
    drive: NonEmptyString,
    path: NonEmptyString,
    operation: Schema.Literal("move", "rename", "delete"),
    reason: NonEmptyString
  }
) {
  override get message(): string {
    return `Cannot ${this.operation} Drive item '${this.path}' in drive '${this.drive}': ${this.reason}`
  }
}

const DriveFolderChildSummarySchema = Schema.Struct({
  id: NonEmptyString,
  title: NonEmptyString,
  kind: Schema.Literal("folder", "file")
})

export class DriveFolderNotEmptyError extends Schema.TaggedError<DriveFolderNotEmptyError>()(
  "DriveFolderNotEmptyError",
  {
    drive: NonEmptyString,
    path: NonEmptyString,
    childCount: Count,
    children: Schema.Array(DriveFolderChildSummarySchema)
  }
) {
  override get message(): string {
    const shown = this.children.map((child) => `${child.title} (${child.kind} ${child.id})`).join(", ")
    const suffix = shown.length === 0 ? "" : ` Children: ${shown}`
    return `Drive folder '${this.path}' in drive '${this.drive}' is not empty (${this.childCount} child items).${suffix}`
  }
}

export class DriveNotEmptyError extends Schema.TaggedError<DriveNotEmptyError>()(
  "DriveNotEmptyError",
  {
    drive: NonEmptyString,
    childCount: Count,
    children: Schema.Array(DriveFolderChildSummarySchema)
  }
) {
  override get message(): string {
    const shown = this.children.map((child) => `${child.title} (${child.kind} ${child.id})`).join(", ")
    const suffix = shown.length === 0 ? "" : ` Children: ${shown}`
    return `Drive '${this.drive}' is not empty (${this.childCount} child items).${suffix}`
  }
}
