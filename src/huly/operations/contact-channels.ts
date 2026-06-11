import type { Channel } from "@hcengineering/contact"
import type { DocumentUpdate, Ref } from "@hcengineering/core"
import { Effect, Option, Schema } from "effect"

import type {
  AddOrganizationChannelParams,
  AddOrganizationChannelResult,
  AddPersonChannelParams,
  AddPersonChannelResult,
  ContactChannelProvider,
  ContactChannelSummary,
  ListOrganizationChannelsParams,
  ListOrganizationChannelsResult,
  ListPersonChannelsParams,
  ListPersonChannelsResult,
  RemoveOrganizationChannelParams,
  RemoveOrganizationChannelResult,
  RemovePersonChannelParams,
  RemovePersonChannelResult,
  UpdateOrganizationChannelParams,
  UpdateOrganizationChannelResult,
  UpdatePersonChannelParams,
  UpdatePersonChannelResult
} from "../../domain/schemas/contact-channels.js"
import { ChannelId, Count, Email, OrganizationId, PersonId } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import { NoUpdateFieldsError } from "../errors-base.js"
import type {
  OrganizationIdentifierAmbiguousError,
  OrganizationNotFoundError,
  PersonIdentifierAmbiguousError,
  PersonNotFoundError
} from "../errors.js"
import {
  ContactChannelConflictError,
  ContactChannelIdentifierAmbiguousError,
  ContactChannelNotFoundError,
  InvalidContactChannelLocatorError,
  InvalidContactChannelValueError,
  InvalidContactProviderError
} from "../errors.js"
import { contact } from "../huly-plugins.js"
import { channelSummary, channelSummaryWithValue } from "./contact-channel-mappers.js"
import {
  type ChannelOwner,
  type ResolvedOwner,
  resolveOrganizationOwner,
  resolvePersonOwner
} from "./contact-channel-owners.js"
import {
  fromContactChannelProviderRef,
  listContactChannelProviderLabels,
  toContactChannelProviderRef
} from "./contact-channel-providers.js"
import { hulyQuery } from "./query-helpers.js"
import { toRef } from "./sdk-boundary.js"

type ContactChannelError =
  | HulyClientError
  | ContactChannelConflictError
  | ContactChannelIdentifierAmbiguousError
  | ContactChannelNotFoundError
  | InvalidContactChannelLocatorError
  | InvalidContactChannelValueError
  | InvalidContactProviderError
  | NoUpdateFieldsError

type PersonChannelError =
  | ContactChannelError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError

type OrganizationChannelError =
  | ContactChannelError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError

type ListPersonChannelError =
  | HulyClientError
  | InvalidContactProviderError
  | PersonIdentifierAmbiguousError
  | PersonNotFoundError

type ListOrganizationChannelError =
  | HulyClientError
  | InvalidContactProviderError
  | OrganizationIdentifierAmbiguousError
  | OrganizationNotFoundError

interface ChannelLocator {
  readonly channelId?: string | undefined
  readonly provider?: ContactChannelProvider | undefined
  readonly value?: string | undefined
}

interface ChannelMutationParams extends ChannelLocator {
  readonly newProvider?: ContactChannelProvider | undefined
  readonly newValue?: string | undefined
}

type ResolvedChannelLocator =
  | {
    readonly _tag: "channelId"
    readonly channelId: ChannelId
  }
  | {
    readonly _tag: "providerValue"
    readonly provider: ContactChannelProvider
    readonly value: string
  }

type RemoveOwnerChannelResult =
  | { readonly removed: true; readonly channelId: ChannelId }
  | { readonly removed: false; readonly channelId: ChannelId }
  | { readonly removed: false }

export const listContactChannelProviders = (): Effect.Effect<ReadonlyArray<ContactChannelProvider>> =>
  Effect.succeed(listContactChannelProviderLabels())

const channelIdentifier = (locator: ResolvedChannelLocator): string =>
  locator._tag === "channelId" ? locator.channelId : `${locator.provider}:${locator.value}`

const INVALID_CHANNEL_LOCATOR_REASON = "provide exactly one channel locator: channelId, or provider plus value"

const validateProviderValue = (
  provider: ContactChannelProvider,
  value: string
): Effect.Effect<void, InvalidContactChannelValueError> =>
  value.length === 0 || (provider === "email" && !Schema.is(Email)(value))
    ? Effect.fail(new InvalidContactChannelValueError({ provider, value }))
    : Effect.void

const validateChannelLocator = (
  ownerIdentifier: string,
  locator: ChannelLocator
): Effect.Effect<ResolvedChannelLocator, InvalidContactChannelLocatorError | InvalidContactChannelValueError> =>
  Effect.gen(function*() {
    const hasChannelId = locator.channelId !== undefined
    const hasProvider = locator.provider !== undefined
    const hasValue = locator.value !== undefined

    if (hasChannelId && !hasProvider && !hasValue) {
      return { _tag: "channelId", channelId: ChannelId.make(locator.channelId) }
    }
    if (!hasChannelId && hasProvider && hasValue) {
      yield* validateProviderValue(locator.provider, locator.value)
      return { _tag: "providerValue", provider: locator.provider, value: locator.value }
    }
    return yield* new InvalidContactChannelLocatorError({
      ownerIdentifier,
      reason: INVALID_CHANNEL_LOCATOR_REASON
    })
  })

const requireChannelUpdateFields = (
  params: ChannelMutationParams
): Effect.Effect<void, NoUpdateFieldsError> =>
  params.newProvider === undefined && params.newValue === undefined
    ? Effect.fail(new NoUpdateFieldsError({ operation: "update_contact_channel", fields: ["newProvider", "newValue"] }))
    : Effect.void

const findChannelsForOwner = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>
): Effect.Effect<Array<Channel>, HulyClientError> =>
  client.findAll<Channel>(
    contact.class.Channel,
    hulyQuery<Channel>({
      attachedTo: owner.id,
      attachedToClass: owner.ownerClass
    })
  )

const findExactChannels = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  provider: ContactChannelProvider,
  value: string
): Effect.Effect<Array<Channel>, HulyClientError> =>
  client.findAll<Channel>(
    contact.class.Channel,
    hulyQuery<Channel>({
      attachedTo: owner.id,
      attachedToClass: owner.ownerClass,
      provider: toContactChannelProviderRef(provider),
      value
    })
  )

const findChannelByIdForOwner = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  channelId: ChannelId
): Effect.Effect<Option.Option<Channel>, HulyClientError> =>
  Effect.map(
    client.findOne<Channel>(
      contact.class.Channel,
      hulyQuery<Channel>({
        _id: toRef<Channel>(channelId),
        attachedTo: owner.id,
        attachedToClass: owner.ownerClass
      })
    ),
    Option.fromNullable
  )

const resolveChannelByLocator = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  locator: ResolvedChannelLocator
): Effect.Effect<Channel, ContactChannelError> =>
  Effect.gen(function*() {
    if (locator._tag === "channelId") {
      return yield* Effect.flatMap(findChannelByIdForOwner(client, owner, locator.channelId), (channel) =>
        Option.match(channel, {
          onNone: () =>
            Effect.fail(
              new ContactChannelNotFoundError({
                ownerIdentifier: owner.identifier,
                channelIdentifier: locator.channelId
              })
            ),
          onSome: Effect.succeed
        }))
    }

    const matches = yield* findExactChannels(client, owner, locator.provider, locator.value)
    if (matches.length === 0) {
      return yield* new ContactChannelNotFoundError({
        ownerIdentifier: owner.identifier,
        channelIdentifier: channelIdentifier(locator)
      })
    }
    if (matches.length > 1) {
      return yield* new ContactChannelIdentifierAmbiguousError({
        ownerIdentifier: owner.identifier,
        channelIdentifier: channelIdentifier(locator),
        matches: Count.make(matches.length)
      })
    }
    return matches[0]
  })

const findRemovableChannel = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  locator: ResolvedChannelLocator
): Effect.Effect<Option.Option<Channel>, ContactChannelError> =>
  Effect.gen(function*() {
    if (locator._tag === "channelId") {
      return yield* findChannelByIdForOwner(client, owner, locator.channelId)
    }

    const matches = yield* findExactChannels(client, owner, locator.provider, locator.value)
    if (matches.length > 1) {
      return yield* new ContactChannelIdentifierAmbiguousError({
        ownerIdentifier: owner.identifier,
        channelIdentifier: channelIdentifier(locator),
        matches: Count.make(matches.length)
      })
    }
    return Option.fromNullable(matches[0])
  })

const ensureNoTargetConflict = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  currentChannelId: Ref<Channel>,
  provider: ContactChannelProvider,
  value: string
): Effect.Effect<void, HulyClientError | ContactChannelConflictError> =>
  Effect.gen(function*() {
    const matches = yield* findExactChannels(client, owner, provider, value)
    const conflicting = matches.some((channel) => channel._id !== currentChannelId)
    if (conflicting) {
      return yield* new ContactChannelConflictError({
        ownerIdentifier: owner.identifier,
        provider,
        value
      })
    }
  })

const listOwnerChannels = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>
): Effect.Effect<ReadonlyArray<ContactChannelSummary>, HulyClientError | InvalidContactProviderError> =>
  Effect.gen(function*() {
    const channels = yield* findChannelsForOwner(client, owner)
    return yield* Effect.all(channels.map(channelSummary))
  })

const addOwnerChannel = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  params: { readonly provider: ContactChannelProvider; readonly value: string }
): Effect.Effect<{ readonly added: boolean; readonly channel: ContactChannelSummary }, ContactChannelError> =>
  Effect.gen(function*() {
    yield* validateProviderValue(params.provider, params.value)

    const existing = yield* findExactChannels(client, owner, params.provider, params.value)
    if (existing.length > 0) {
      return { added: false, channel: yield* channelSummary(existing[0]) }
    }

    const channelId = yield* client.addCollection(
      contact.class.Channel,
      contact.space.Contacts,
      owner.id,
      owner.ownerClass,
      "channels",
      { provider: toContactChannelProviderRef(params.provider), value: params.value }
    )

    return {
      added: true,
      channel: {
        channelId: ChannelId.make(channelId),
        provider: params.provider,
        value: params.value
      }
    }
  })

const updateOwnerChannel = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  params: ChannelMutationParams
): Effect.Effect<{ readonly updated: boolean; readonly channel: ContactChannelSummary }, ContactChannelError> =>
  Effect.gen(function*() {
    yield* requireChannelUpdateFields(params)
    const locator = yield* validateChannelLocator(owner.identifier, params)
    const channel = yield* resolveChannelByLocator(client, owner, locator)
    const currentProvider = fromContactChannelProviderRef(channel.provider)
    if (currentProvider instanceof InvalidContactProviderError) {
      return yield* currentProvider
    }

    const nextProvider = params.newProvider ?? currentProvider
    const nextValue = params.newValue ?? channel.value
    yield* validateProviderValue(nextProvider, nextValue)

    const nextProviderRef = toContactChannelProviderRef(nextProvider)
    if (channel.provider === nextProviderRef && channel.value === nextValue) {
      return { updated: false, channel: yield* channelSummary(channel) }
    }

    yield* ensureNoTargetConflict(client, owner, channel._id, nextProvider, nextValue)

    const operations: DocumentUpdate<Channel> = {
      provider: nextProviderRef,
      value: nextValue
    }

    yield* client.updateDoc(contact.class.Channel, contact.space.Contacts, channel._id, operations)

    return { updated: true, channel: channelSummaryWithValue(channel, nextProvider, nextValue) }
  })

const removeOwnerChannel = <Owner extends ChannelOwner>(
  client: HulyClient["Type"],
  owner: ResolvedOwner<Owner>,
  params: ChannelLocator
): Effect.Effect<RemoveOwnerChannelResult, ContactChannelError> =>
  Effect.gen(function*() {
    const locator = yield* validateChannelLocator(owner.identifier, params)
    const channel = yield* findRemovableChannel(client, owner, locator)
    if (Option.isNone(channel)) {
      return locator._tag === "channelId"
        ? { removed: false, channelId: locator.channelId }
        : { removed: false }
    }

    yield* client.removeDoc(contact.class.Channel, contact.space.Contacts, channel.value._id)
    return { removed: true, channelId: ChannelId.make(channel.value._id) }
  })

export const listPersonChannels = (
  params: ListPersonChannelsParams
): Effect.Effect<ListPersonChannelsResult, ListPersonChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolvePersonOwner(client, params.person)
    return {
      personId: PersonId.make(owner.id),
      channels: yield* listOwnerChannels(client, owner)
    }
  })

export const addPersonChannel = (
  params: AddPersonChannelParams
): Effect.Effect<AddPersonChannelResult, PersonChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolvePersonOwner(client, params.person)
    const result = yield* addOwnerChannel(client, owner, params)
    return { personId: PersonId.make(owner.id), ...result }
  })

export const updatePersonChannel = (
  params: UpdatePersonChannelParams
): Effect.Effect<UpdatePersonChannelResult, PersonChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolvePersonOwner(client, params.person)
    const result = yield* updateOwnerChannel(client, owner, params)
    return { personId: PersonId.make(owner.id), ...result }
  })

export const removePersonChannel = (
  params: RemovePersonChannelParams
): Effect.Effect<RemovePersonChannelResult, PersonChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolvePersonOwner(client, params.person)
    const result = yield* removeOwnerChannel(client, owner, params)
    const personId = PersonId.make(owner.id)
    return "channelId" in result
      ? { personId, removed: result.removed, channelId: result.channelId }
      : { personId, removed: result.removed }
  })

export const listOrganizationChannels = (
  params: ListOrganizationChannelsParams
): Effect.Effect<ListOrganizationChannelsResult, ListOrganizationChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolveOrganizationOwner(client, params.organizationId)
    return {
      organizationId: OrganizationId.make(owner.id),
      channels: yield* listOwnerChannels(client, owner)
    }
  })

export const addOrganizationChannel = (
  params: AddOrganizationChannelParams
): Effect.Effect<AddOrganizationChannelResult, OrganizationChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolveOrganizationOwner(client, params.organizationId)
    const result = yield* addOwnerChannel(client, owner, params)
    return { id: OrganizationId.make(owner.id), ...result }
  })

export const updateOrganizationChannel = (
  params: UpdateOrganizationChannelParams
): Effect.Effect<UpdateOrganizationChannelResult, OrganizationChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolveOrganizationOwner(client, params.organizationId)
    const result = yield* updateOwnerChannel(client, owner, params)
    return { organizationId: OrganizationId.make(owner.id), ...result }
  })

export const removeOrganizationChannel = (
  params: RemoveOrganizationChannelParams
): Effect.Effect<RemoveOrganizationChannelResult, OrganizationChannelError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const owner = yield* resolveOrganizationOwner(client, params.organizationId)
    const result = yield* removeOwnerChannel(client, owner, params)
    const organizationId = OrganizationId.make(owner.id)
    return "channelId" in result
      ? { organizationId, removed: result.removed, channelId: result.channelId }
      : { organizationId, removed: result.removed }
  })
