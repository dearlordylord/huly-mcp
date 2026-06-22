/**
 * Error hierarchy for Huly MCP server — barrel re-export.
 *
 * Split into domain modules:
 * - errors-base: HulyError, HulyConnectionError, HulyAuthError
 * - errors-tracker: issue, project, status, milestone, component, template errors
 * - errors-contacts: person, organization, and contact validation errors
 * - errors-files: file upload/fetch/size errors, BYTES_PER_MB
 * - errors-documents: teamspace, document errors
 * - errors-messaging: channel, message, thread, reaction errors
 * - errors-calendar: event and calendar errors
 * - errors-love: virtual office, room, and meeting minutes errors
 * - errors-cards: card space, card, master tag errors
 * - errors-labels: tag, tag category errors
 * - errors-test-management: test project/suite/case/plan/run/result errors
 * - errors-notifications: notification errors
 *
 * @module
 */
import {
  HulyDomainError as HulyDomainErrorSchema,
  type HulyDomainError as HulyDomainErrorUnion
} from "./errors-domain.js"

export const HulyDomainError = HulyDomainErrorSchema
export type HulyDomainError = HulyDomainErrorUnion

export * from "./errors-approval-requests.js"
export * from "./errors-base.js"
export * from "./errors-boards.js"
export * from "./errors-calendar.js"
export * from "./errors-cards.js"
export * from "./errors-contacts.js"
export * from "./errors-custom-fields.js"
export * from "./errors-documents.js"
export * from "./errors-drive.js"
export * from "./errors-files.js"
export * from "./errors-generic-associations.js"
export * from "./errors-inventory.js"
export * from "./errors-labels.js"
export * from "./errors-leads.js"
export * from "./errors-love.js"
export * from "./errors-messaging.js"
export * from "./errors-notifications.js"
export * from "./errors-planner.js"
export * from "./errors-processes.js"
export * from "./errors-recruiting.js"
export * from "./errors-sdk-discovery.js"
export * from "./errors-spaces.js"
export * from "./errors-templates.js"
export * from "./errors-test-management.js"
export * from "./errors-tracker.js"
export * from "./errors-views.js"
