/**
 * Shared authentication utilities for Huly clients.
 * @module
 */
import type { AuthOptions } from "@hcengineering/api-client"
import { Effect, Redacted, Schedule } from "effect"
import { absurd } from "effect/Function"

import type { Auth } from "../config/config.js"
import { HulyAuthError, HulyConnectionError } from "./errors.js"

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
export const isAuthError = (error: unknown): boolean => {
  const msg = String(error).toLowerCase()
  return (
    msg.includes("unauthorized")
    || msg.includes("authentication")
    || msg.includes("auth")
    || msg.includes("credentials")
    || msg.includes("401")
    || msg.includes("invalid password")
    || msg.includes("invalid email")
    || msg.includes("login failed")
  )
}

/**
 * Retry schedule for connection attempts: exponential backoff, max 3 attempts.
 */
export const connectionRetrySchedule = Schedule.exponential("100 millis").pipe(
  Schedule.compose(Schedule.recurs(2))
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
