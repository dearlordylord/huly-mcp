/**
 * Notification domain errors.
 *
 * @module
 */
import { Schema } from "effect"

// Error constructors may be raised from resolver paths before domain schema
// decoding has succeeded, so payload identifiers stay raw strings here instead
// of branded domain refs.
const RawErrorIdentifier = Schema.String

/**
 * Notification not found.
 */
export class NotificationNotFoundError extends Schema.TaggedError<NotificationNotFoundError>()(
  "NotificationNotFoundError",
  {
    notificationId: RawErrorIdentifier
  }
) {
  override get message(): string {
    return `Notification '${this.notificationId}' not found`
  }
}

/**
 * Notification context not found.
 */
export class NotificationContextNotFoundError extends Schema.TaggedError<NotificationContextNotFoundError>()(
  "NotificationContextNotFoundError",
  {
    contextId: RawErrorIdentifier
  }
) {
  override get message(): string {
    return `Notification context '${this.contextId}' not found`
  }
}

export class NotificationTypeNotFoundError extends Schema.TaggedError<NotificationTypeNotFoundError>()(
  "NotificationTypeNotFoundError",
  {
    typeId: RawErrorIdentifier
  }
) {
  override get message(): string {
    return `Notification type '${this.typeId}' not found`
  }
}

export class NotificationProviderNotConfigurableError
  extends Schema.TaggedError<NotificationProviderNotConfigurableError>()(
    "NotificationProviderNotConfigurableError",
    {
      providerId: RawErrorIdentifier,
      typeId: RawErrorIdentifier
    }
  )
{
  override get message(): string {
    return `Notification type '${this.typeId}' is not configurable for provider '${this.providerId}' in this workspace`
  }
}
