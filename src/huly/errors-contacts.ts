/**
 * Contact domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import { Count } from "../domain/schemas/shared.js"

const MIN_AMBIGUOUS_PERSON_MATCHES = 2
const AmbiguousMatchCount = Count.pipe(Schema.greaterThanOrEqualTo(MIN_AMBIGUOUS_PERSON_MATCHES))

/**
 * Person (assignee) not found.
 */
export class PersonNotFoundError extends Schema.TaggedError<PersonNotFoundError>()(
  "PersonNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Person '${this.identifier}' not found`
  }
}

/**
 * Person identifier matched multiple people.
 */
export class PersonIdentifierAmbiguousError extends Schema.TaggedError<PersonIdentifierAmbiguousError>()(
  "PersonIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    matches: AmbiguousMatchCount
  }
) {
  override get message(): string {
    return `Person identifier '${this.identifier}' matched ${this.matches} people; use an exact email address instead`
  }
}

/**
 * Organization not found.
 */
export class OrganizationNotFoundError extends Schema.TaggedError<OrganizationNotFoundError>()(
  "OrganizationNotFoundError",
  {
    identifier: Schema.String
  }
) {
  override get message(): string {
    return `Organization '${this.identifier}' not found`
  }
}

/**
 * Organization identifier matched multiple organizations.
 */
export class OrganizationIdentifierAmbiguousError extends Schema.TaggedError<OrganizationIdentifierAmbiguousError>()(
  "OrganizationIdentifierAmbiguousError",
  {
    identifier: Schema.String,
    matches: AmbiguousMatchCount
  }
) {
  override get message(): string {
    return `Organization identifier '${this.identifier}' matched ${this.matches} organizations; use the organization ID instead`
  }
}

/**
 * Contact provider is not supported.
 */
export class InvalidContactProviderError extends Schema.TaggedError<InvalidContactProviderError>()(
  "InvalidContactProviderError",
  {
    provider: Schema.String
  }
) {
  override get message(): string {
    return `Invalid contact provider: '${this.provider}'`
  }
}

/**
 * Invalid PersonUuid format.
 */
export class InvalidPersonUuidError extends Schema.TaggedError<InvalidPersonUuidError>()(
  "InvalidPersonUuidError",
  {
    uuid: Schema.String
  }
) {
  override get message(): string {
    return `Invalid PersonUuid format: '${this.uuid}'`
  }
}
