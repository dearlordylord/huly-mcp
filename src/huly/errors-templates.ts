/**
 * Message template discovery domain errors.
 *
 * @module
 */
import { Schema } from "effect"

import {
  MessageTemplateCategoryIdentifier,
  MessageTemplateIdentifier,
  TemplateFieldCategoryIdentifier
} from "../domain/schemas/message-templates.js"
import { Count } from "../domain/schemas/shared.js"

const MIN_AMBIGUOUS_TEMPLATE_MATCHES = 2
const AmbiguousTemplateMatchCount = Count.pipe(Schema.greaterThanOrEqualTo(MIN_AMBIGUOUS_TEMPLATE_MATCHES))

export class MessageTemplateCategoryNotFoundError extends Schema.TaggedError<
  MessageTemplateCategoryNotFoundError
>()(
  "MessageTemplateCategoryNotFoundError",
  {
    identifier: MessageTemplateCategoryIdentifier
  }
) {
  override get message(): string {
    return `Message template category '${this.identifier}' not found`
  }
}

export class MessageTemplateCategoryIdentifierAmbiguousError extends Schema.TaggedError<
  MessageTemplateCategoryIdentifierAmbiguousError
>()(
  "MessageTemplateCategoryIdentifierAmbiguousError",
  {
    identifier: MessageTemplateCategoryIdentifier,
    matches: AmbiguousTemplateMatchCount
  }
) {
  override get message(): string {
    return `Message template category '${this.identifier}' matched ${this.matches} categories; use the category ID`
  }
}

export class MessageTemplateNotFoundError extends Schema.TaggedError<MessageTemplateNotFoundError>()(
  "MessageTemplateNotFoundError",
  {
    identifier: MessageTemplateIdentifier,
    category: Schema.optional(MessageTemplateCategoryIdentifier)
  }
) {
  override get message(): string {
    return this.category === undefined
      ? `Message template '${this.identifier}' not found`
      : `Message template '${this.identifier}' not found in category '${this.category}'`
  }
}

export class MessageTemplateIdentifierAmbiguousError extends Schema.TaggedError<
  MessageTemplateIdentifierAmbiguousError
>()(
  "MessageTemplateIdentifierAmbiguousError",
  {
    identifier: MessageTemplateIdentifier,
    matches: AmbiguousTemplateMatchCount
  }
) {
  override get message(): string {
    return `Message template '${this.identifier}' matched ${this.matches} templates; provide category to disambiguate`
  }
}

export class TemplateFieldCategoryNotFoundError extends Schema.TaggedError<TemplateFieldCategoryNotFoundError>()(
  "TemplateFieldCategoryNotFoundError",
  {
    identifier: TemplateFieldCategoryIdentifier
  }
) {
  override get message(): string {
    return `Template field category '${this.identifier}' not found`
  }
}

export class TemplateFieldCategoryIdentifierAmbiguousError extends Schema.TaggedError<
  TemplateFieldCategoryIdentifierAmbiguousError
>()(
  "TemplateFieldCategoryIdentifierAmbiguousError",
  {
    identifier: TemplateFieldCategoryIdentifier,
    matches: AmbiguousTemplateMatchCount
  }
) {
  override get message(): string {
    return `Template field category '${this.identifier}' matched ${this.matches} categories; use the category ID`
  }
}
