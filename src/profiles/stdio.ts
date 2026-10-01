import * as os from "node:os"
import { Effect } from "effect"
import { cliProfilePaths, makeCliProfileStore, type CliProfileStore } from "./file-store.js"
import { type CredentialStoreSelector, selectCredentialStore } from "./credential-store.js"
import { resolveCliConfiguration } from "./resolve.js"

// The bootstrap captures process configuration once; the resolver and store are injected for tests.
export const resolveStdioProfile = (
  environment: NodeJS.ProcessEnv,
  store: CliProfileStore,
  credentialStore: CredentialStoreSelector = selectCredentialStore
) => resolveCliConfiguration(store, environment, undefined, false, credentialStore)

export const defaultProfileStore = (environment: NodeJS.ProcessEnv) =>
  Effect.sync(() => makeCliProfileStore(cliProfilePaths(process.platform, environment, os.homedir())))
