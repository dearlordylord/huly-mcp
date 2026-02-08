/**
 * Shared authentication utilities for Huly clients.
 * @module
 */
import type { AuthOptions } from "@hcengineering/api-client"
import { PlatformError } from "@hcengineering/platform"
import { Effect, Redacted, Schedule } from "effect"
import { absurd } from "effect/Function"

import type { Auth } from "../config/config.js"
import { HulyAuthError, type HulyConnectionError } from "./errors.js"

/**
 * Status codes that indicate authentication failures (should not be retried).
 *
 * These are StatusCode values from @hcengineering/platform (see platform.ts).
 * The default export `platform.status.*` can't be imported due to TypeScript's
 * verbatimModuleSyntax + NodeNext moduleResolution not resolving the re-exported
 * default correctly. The format is `${pluginId}:status:${statusName}` where
 * pluginId is "platform".
 */
const AUTH_STATUS_CODES = new Set([
  "platform:status:Unauthorized",
  "platform:status:TokenExpired",
  "platform:status:TokenNotActive",
  "platform:status:PasswordExpired",
  "platform:status:Forbidden",
  "platform:status:InvalidPassword",
  "platform:status:AccountNotFound",
  "platform:status:AccountNotConfirmed"
])

/**
 * Connection configuration shared by both HulyClient and WorkspaceClient.
 */
export interface ConnectionConfig {
  url: string
  auth: Auth
  workspace: string
}

export type ConnectionError = HulyConnectionError | HulyAuthError

/**
 * Convert Auth union type to AuthOptions for API client.
 */
export const authToOptions = (auth: Auth, workspace: string): AuthOptions => {
  switch (auth._tag) {
    case "token":
      return { token: Redacted.value(auth.token), workspace }
    case "password":
      return { email: auth.email, password: Redacted.value(auth.password), workspace }
    default:
      return absurd(auth)
  }
}

/**
 * Check if an error is an authentication error (should not be retried).
 */
export const isAuthError = (error: unknown): boolean =>
  error instanceof PlatformError && AUTH_STATUS_CODES.has(error.status.code)

/**
 * Retry schedule for connection attempts: exponential backoff, max 3 attempts.
 */
const MAX_RETRIES = 2
export const connectionRetrySchedule = Schedule.exponential("100 millis").pipe(
  Schedule.compose(Schedule.recurs(MAX_RETRIES))
)

/**
 * Wrap a connection attempt with retry logic.
 * Auth errors are not retried; connection errors retry up to 3 times.
 */
export const withConnectionRetry = <A>(
  attempt: Effect.Effect<A, ConnectionError>
): Effect.Effect<A, ConnectionError> =>
  attempt.pipe(
    Effect.retry({
      schedule: connectionRetrySchedule,
      while: (e) => !(e instanceof HulyAuthError)
    })
  )
