import { describe, expect, it } from "vitest"

import { OrganizationChannelProviderValues } from "../../../src/domain/schemas/contact-organizations.js"
import { contact } from "../../../src/huly/huly-plugins.js"
import { ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY } from "../../../src/huly/operations/organization-channel-providers.js"

const sorted = (values: Iterable<string>): Array<string> => Array.from(values).sort()

describe("organization channel provider contract", () => {
  it("keeps MCP provider literals in exact lockstep with Huly SDK providers", () => {
    const sdkProviderKeys = sorted(Object.keys(contact.channelProvider))
    const mappedProviderKeys = sorted(Object.keys(ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY))
    const mappedProviders = Object.values(ORGANIZATION_CHANNEL_PROVIDER_BY_SDK_KEY)

    expect(mappedProviderKeys).toEqual(sdkProviderKeys)
    expect(mappedProviders).toHaveLength(sdkProviderKeys.length)
    expect(new Set(mappedProviders).size).toBe(mappedProviders.length)
    expect(sorted(mappedProviders)).toEqual(sorted(OrganizationChannelProviderValues))
  })
})
