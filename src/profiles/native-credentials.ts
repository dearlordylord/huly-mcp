import type { NativeCredentialPort } from "./native-credential-port.js"
import { makeLinuxSecretService } from "./linux-secret-service.js"
import { makeMacosKeychain } from "./macos-keychain.js"

export const makeNativeCredentials = (
  platform: NodeJS.Platform,
  environment: NodeJS.ProcessEnv
): NativeCredentialPort | undefined => {
  if (platform === "darwin") return makeMacosKeychain()
  if (platform === "linux") return makeLinuxSecretService(environment["DBUS_SESSION_BUS_ADDRESS"])
  return undefined
}
