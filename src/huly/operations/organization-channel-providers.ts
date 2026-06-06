import type { OrganizationChannelProvider } from "../../domain/schemas/contact-organizations.js"
import { contact } from "../huly-plugins.js"

const CHANNEL_PROVIDER_REFS_BY_SDK_KEY = {
  Email: contact.channelProvider.Email,
  Phone: contact.channelProvider.Phone,
  LinkedIn: contact.channelProvider.LinkedIn,
  Twitter: contact.channelProvider.Twitter,
  Telegram: contact.channelProvider.Telegram,
  GitHub: contact.channelProvider.GitHub,
  Facebook: contact.channelProvider.Facebook,
  Homepage: contact.channelProvider.Homepage,
  Whatsapp: contact.channelProvider.Whatsapp,
  Skype: contact.channelProvider.Skype,
  Profile: contact.channelProvider.Profile,
  Viber: contact.channelProvider.Viber
} satisfies Record<
  keyof typeof contact.channelProvider,
  typeof contact.channelProvider[keyof typeof contact.channelProvider]
>

export const ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY = {
  Email: "email",
  Phone: "phone",
  LinkedIn: "linkedin",
  Twitter: "twitter",
  Telegram: "telegram",
  GitHub: "github",
  Facebook: "facebook",
  Homepage: "homepage",
  Whatsapp: "whatsapp",
  Skype: "skype",
  Profile: "profile",
  Viber: "viber"
} satisfies Record<keyof typeof contact.channelProvider, OrganizationChannelProvider>

const CHANNEL_PROVIDERS = {
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Email]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Email,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Phone]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Phone,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.LinkedIn]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.LinkedIn,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Twitter]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Twitter,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Telegram]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Telegram,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.GitHub]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.GitHub,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Facebook]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Facebook,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Homepage]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Homepage,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Whatsapp]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Whatsapp,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Skype]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Skype,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Profile]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Profile,
  [ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY.Viber]: CHANNEL_PROVIDER_REFS_BY_SDK_KEY.Viber
} satisfies Record<OrganizationChannelProvider, typeof contact.channelProvider[keyof typeof contact.channelProvider]>

type MappedChannelProvider =
  typeof ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY[keyof typeof ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY]
type ExactChannelProviderMapping = [OrganizationChannelProvider] extends [MappedChannelProvider]
  ? [MappedChannelProvider] extends [OrganizationChannelProvider] ? true : never
  : never

const exactChannelProviderMapping = <T extends true>(value: T): T => value
exactChannelProviderMapping<ExactChannelProviderMapping>(true)

export const toChannelProviderRef = (
  provider: OrganizationChannelProvider
): typeof CHANNEL_PROVIDERS[typeof provider] => CHANNEL_PROVIDERS[provider]
