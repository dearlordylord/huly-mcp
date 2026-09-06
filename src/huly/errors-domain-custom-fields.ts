import { Schema } from "effect"

import {
  CustomFieldMetadataMalformedError,
  CustomFieldNotFoundError,
  CustomFieldObjectNotFoundError,
  InvalidCustomFieldBooleanValueError,
  InvalidCustomFieldDateValueError,
  InvalidCustomFieldEnumValueError,
  InvalidCustomFieldNumberValueError,
  RecruitingCandidateCustomFieldOwnerError,
  RecruitingCandidateCustomFieldTypeUnsupportedError
} from "./errors-custom-fields.js"

/** Custom-field failures grouped as one domain-union branch to keep the aggregate error catalog bounded. */
export const CustomFieldDomainError = Schema.Union([
  CustomFieldMetadataMalformedError,
  CustomFieldNotFoundError,
  CustomFieldObjectNotFoundError,
  InvalidCustomFieldBooleanValueError,
  InvalidCustomFieldDateValueError,
  InvalidCustomFieldEnumValueError,
  InvalidCustomFieldNumberValueError,
  RecruitingCandidateCustomFieldOwnerError,
  RecruitingCandidateCustomFieldTypeUnsupportedError
])
