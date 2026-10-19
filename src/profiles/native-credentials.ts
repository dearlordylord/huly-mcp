import type { NativeCredentialPort } from "./native-credential-port.js"
import { makeLinuxSecretService } from "./linux-secret-service.js"
import { makeMacosKeychain } from "./macos-keychain.js"
import { nativeBackendForPlatform } from "./credential-storage-policy.js"

export const makeNativeCredentials = (
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv
): NativeCredentialPort | undefined => {
  const backend = nativeBackendForPlatform(platform)
  if (backend === "macos-keychain") return makeMacosKeychain()
  if (backend === "linux-secret-service") return makeLinuxSecretService(environment["DBUS_SESSION_BUS_ADDRESS"])
  return undefined
}
