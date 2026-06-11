import type { ContactChannelProvider } from "../../domain/schemas/contact-channels.js"
import { ContactChannelProviderSdkKeys, ContactChannelProviderValues } from "../../domain/schemas/contact-channels.js"
import { InvalidContactProviderError } from "../errors.js"
import { contact } from "../huly-plugins.js"

const CONTACT_CHANNEL_PROVIDER_SDK_KEYS = ContactChannelProviderSdkKeys satisfies Record<
  ContactChannelProvider,
  keyof typeof contact.channelProvider
>

type ConfiguredSdkKey = typeof CONTACT_CHANNEL_PROVIDER_SDK_KEYS[ContactChannelProvider]
type ExactChannelProviderSdkKeys = [keyof typeof contact.channelProvider] extends [ConfiguredSdkKey]
  ? [ConfiguredSdkKey] extends [keyof typeof contact.channelProvider] ? true : never
  : never

const exactChannelProviderSdkKeys = <T extends true>(value: T): T => value
exactChannelProviderSdkKeys<ExactChannelProviderSdkKeys>(true)

const sdkKeyEntryForProvider = (provider: ContactChannelProvider): readonly [string, ContactChannelProvider] => [
  CONTACT_CHANNEL_PROVIDER_SDK_KEYS[provider],
  provider
]

export const CONTACT_CHANNEL_PROVIDER_BY_SDK_KEY: Readonly<Record<string, ContactChannelProvider>> = Object.fromEntries(
  ContactChannelProviderValues.map(sdkKeyEntryForProvider)
)

export const listContactChannelProviderLabels = (): ReadonlyArray<ContactChannelProvider> =>
  ContactChannelProviderValues

export const toContactChannelProviderRef = (
  provider: ContactChannelProvider
): typeof contact.channelProvider[keyof typeof contact.channelProvider] =>
  contact.channelProvider[CONTACT_CHANNEL_PROVIDER_SDK_KEYS[provider]]

export const fromContactChannelProviderRef = (
  providerRef: string
): ContactChannelProvider | InvalidContactProviderError => {
  const provider = ContactChannelProviderValues.find((candidate) =>
    toContactChannelProviderRef(candidate) === providerRef
  )
  return provider ?? new InvalidContactProviderError({ provider: providerRef })
}
