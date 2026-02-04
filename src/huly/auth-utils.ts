/**
 * Shared authentication utilities for Huly clients.
 * @module
 */
import type { AuthOptions } from "@hcengineering/api-client"
import { Redacted } from "effect"
import { absurd } from "effect/Function"

import type { Auth } from "../config/config.js"

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
