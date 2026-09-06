/**
 * Custom field domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { CustomFieldTypeNameSchema } from "../domain/schemas/custom-fields.js"
import { CustomFieldId, DocId, NonEmptyString, ObjectClassName } from "../domain/schemas/shared.js"
import { RECRUITING_CANDIDATE_CUSTOM_FIELD_OWNER_DESCRIPTION } from "./recruiting-candidate-custom-field-config.js"

export class CustomFieldMetadataMalformedError extends Schema.TaggedError<CustomFieldMetadataMalformedError>()(
  "CustomFieldMetadataMalformedError",
  { identifier: Schema.String, reason: Schema.String }
) {
  override get message(): string {
    return `Custom field metadata '${this.identifier}' is malformed: ${this.reason}`
  }
}

export class CustomFieldNotFoundError extends Schema.TaggedError<CustomFieldNotFoundError>()(
  "CustomFieldNotFoundError",
  { identifier: Schema.String }
) {
  override get message(): string {
    return `Custom field '${this.identifier}' not found`
  }
}

export class CustomFieldObjectNotFoundError extends Schema.TaggedError<CustomFieldObjectNotFoundError>()(
  "CustomFieldObjectNotFoundError",
  { objectId: DocId, objectClass: ObjectClassName }
) {
  override get message(): string {
    return `Object '${this.objectId}' of class '${this.objectClass}' not found`
  }
}

export class InvalidCustomFieldDateValueError extends Schema.TaggedError<InvalidCustomFieldDateValueError>()(
  "InvalidCustomFieldDateValueError",
  { value: Schema.String }
) {
  override get message(): string {
    return `Invalid date custom-field value '${this.value}'. Use a real calendar date in YYYY-MM-DD form or a canonical non-negative epoch-millisecond string between 0 and 8640000000000000. Time-zone suffixes, date-times, signs, decimals, exponents, whitespace, and non-finite values are not accepted.`
  }
}

export class InvalidCustomFieldNumberValueError extends Schema.TaggedError<InvalidCustomFieldNumberValueError>()(
  "InvalidCustomFieldNumberValueError",
  { value: Schema.String }
) {
  override get message(): string {
    return `Invalid number custom-field value '${this.value}'. Use a finite numeric string without surrounding whitespace.`
  }
}

export class InvalidCustomFieldBooleanValueError extends Schema.TaggedError<InvalidCustomFieldBooleanValueError>()(
  "InvalidCustomFieldBooleanValueError",
  { value: Schema.String }
) {
  override get message(): string {
    return `Invalid boolean custom-field value '${this.value}'. Use 'true' or 'false'.`
  }
}

export class InvalidCustomFieldEnumValueError extends Schema.TaggedError<InvalidCustomFieldEnumValueError>()(
  "InvalidCustomFieldEnumValueError",
  { fieldId: CustomFieldId, enumRef: NonEmptyString, value: Schema.String, allowedValues: Schema.Array(Schema.String) }
) {
  override get message(): string {
    const allowed = this.allowedValues.length === 0 ? "no values" : this.allowedValues.join(", ")
    return `Invalid enum custom-field value '${this.value}' for '${this.fieldId}'. Expected one of: ${allowed}.`
  }
}

export class RecruitingCandidateCustomFieldOwnerError extends Schema.TaggedError<RecruitingCandidateCustomFieldOwnerError>()(
  "RecruitingCandidateCustomFieldOwnerError",
  { fieldId: CustomFieldId, ownerClassId: ObjectClassName }
) {
  override get message(): string {
    return `Custom field '${this.fieldId}' is owned by '${this.ownerClassId}', but Recruiting Candidate fields must be owned by ${RECRUITING_CANDIDATE_CUSTOM_FIELD_OWNER_DESCRIPTION}`
  }
}

export class RecruitingCandidateCustomFieldTypeUnsupportedError extends Schema.TaggedError<RecruitingCandidateCustomFieldTypeUnsupportedError>()(
  "RecruitingCandidateCustomFieldTypeUnsupportedError",
  { fieldId: CustomFieldId, type: CustomFieldTypeNameSchema }
) {
  override get message(): string {
    return `Recruiting Candidate custom field '${this.fieldId}' has unsupported type '${this.type}'; array, ref, and unknown fields cannot be written`
  }
}
