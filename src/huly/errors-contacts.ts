/**
 * Contact domain errors.
 *
 * @module
 */
import { Schema } from "effect"

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
