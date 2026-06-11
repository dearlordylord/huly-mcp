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
 * Contact channel could not be found for the requested owner.
 */
export class ContactChannelNotFoundError extends Schema.TaggedError<ContactChannelNotFoundError>()(
  "ContactChannelNotFoundError",
  {
    ownerIdentifier: Schema.String,
    channelIdentifier: Schema.String
  }
) {
  override get message(): string {
    return `Contact channel '${this.channelIdentifier}' not found for '${this.ownerIdentifier}'`
  }
}

/**
 * Contact channel provider+value locator matched multiple channel docs.
 */
export class ContactChannelIdentifierAmbiguousError
  extends Schema.TaggedError<ContactChannelIdentifierAmbiguousError>()(
    "ContactChannelIdentifierAmbiguousError",
    {
      ownerIdentifier: Schema.String,
      channelIdentifier: Schema.String,
      matches: AmbiguousMatchCount
    }
  )
{
  override get message(): string {
    return `Contact channel '${this.channelIdentifier}' matched ${this.matches} channels for '${this.ownerIdentifier}'; use channelId instead`
  }
}

/**
 * Contact channel locator did not satisfy the required locator shape.
 */
export class InvalidContactChannelLocatorError extends Schema.TaggedError<InvalidContactChannelLocatorError>()(
  "InvalidContactChannelLocatorError",
  {
    ownerIdentifier: Schema.String,
    reason: Schema.String
  }
) {
  override get message(): string {
    return `Invalid contact channel locator for '${this.ownerIdentifier}': ${this.reason}`
  }
}

/**
 * Contact channel update would duplicate an existing provider+value on the same owner.
 */
export class ContactChannelConflictError extends Schema.TaggedError<ContactChannelConflictError>()(
  "ContactChannelConflictError",
  {
    ownerIdentifier: Schema.String,
    provider: Schema.String,
    value: Schema.String
  }
) {
  override get message(): string {
    return `Contact channel '${this.provider}:${this.value}' already exists for '${this.ownerIdentifier}'`
  }
}

/**
 * Contact channel value is invalid for its provider.
 */
export class InvalidContactChannelValueError extends Schema.TaggedError<InvalidContactChannelValueError>()(
  "InvalidContactChannelValueError",
  {
    provider: Schema.String,
    value: Schema.String
  }
) {
  override get message(): string {
    return `Invalid value '${this.value}' for contact channel provider '${this.provider}'`
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
