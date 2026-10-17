import { ConfigProvider, Effect } from "effect"

import { getLazyEnvs } from "../config/startup.js"
import { ProfileEnvironmentSchema } from "../profiles/model.js"
import type { CliProfileStore } from "../profiles/file-store.js"
import type { ResidentStartupCapture } from "./managed-contract.js"
import { captureResidentSelection } from "./selection-config.js"

// Internal launch decision; the capture schema owns the private IPC payload.
type ManagedStartup =
  | { readonly kind: "local" }
  | { readonly kind: "resident"; readonly capture: ResidentStartupCapture }

export const resolveManagedStartup = Effect.fn("resolveManagedStartup")(function* (
  environment: NodeJS.ProcessEnv,
  store?: CliProfileStore
) {
  const snapshot = { ...environment }
  const lazy = yield* getLazyEnvs(snapshot).pipe(
    Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(snapshot)))
  )
  const selectsAuthority = Object.keys(ProfileEnvironmentSchema.fields).some((key) => snapshot[key] !== undefined)
  if (lazy && !selectsAuthority) return { kind: "local" } satisfies ManagedStartup
  return { kind: "resident", capture: yield* captureResidentSelection(snapshot, store) } satisfies ManagedStartup
})
