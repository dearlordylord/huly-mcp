import type {
  CustomSequence as HulyCustomSequence,
  DomainIndexConfiguration as HulyDomainIndexConfiguration,
  PluginConfiguration as HulyPluginConfiguration,
  Sequence as HulySequence
} from "@hcengineering/core"
import { SortingOrder } from "@hcengineering/core"
import { Effect, Either, Schema } from "effect"

import type {
  DescribeHulySpaceTypeCapabilitiesParams,
  HulyDomainIndexMetadataEntry,
  HulySpaceTypeCapabilities,
  ListHulyDomainIndexConfigurationsResult,
  ListHulyPluginConfigurationsResult,
  ListHulySequencesResult
} from "../../domain/schemas/sdk-discovery-configurations.js"
import {
  HulyConfigurationMetadataKey,
  HulyDomainName,
  HulyMcpToolName,
  HulyPluginId,
  HulySequenceId,
  HulySequencePrefix,
  HulySequenceValue
} from "../../domain/schemas/sdk-discovery-configurations.js"
import { Count, NonEmptyString, ObjectClassName } from "../../domain/schemas/shared.js"
import { HulyClient, type HulyClientError } from "../client.js"
import type { SpaceTypeIdentifierAmbiguousError, SpaceTypeNotFoundError } from "../errors.js"
import { decodeHulyModelLabelTail } from "../huly-labels.js"
import { core } from "../huly-plugins.js"
import { hulyQuery } from "./query-helpers.js"
import { getSpaceType } from "./spaces-read.js"

type DescribeHulySpaceTypeCapabilitiesError =
  | HulyClientError
  | SpaceTypeNotFoundError
  | SpaceTypeIdentifierAmbiguousError

const decodeNonEmptyString = Schema.decodeUnknownEither(NonEmptyString)

const labelOrDefault = (value: unknown, fallback: NonEmptyString): NonEmptyString =>
  Either.getOrElse(decodeHulyModelLabelTail(value), () => Either.getOrElse(decodeNonEmptyString(value), () => fallback))

const optionalMetadataKey = (value: unknown): HulyConfigurationMetadataKey | undefined => {
  const decoded = decodeNonEmptyString(value)
  return Either.isRight(decoded) ? HulyConfigurationMetadataKey.make(decoded.right) : undefined
}

const metadataEntry = (value: unknown): HulyDomainIndexMetadataEntry => {
  const key = optionalMetadataKey(value)
  return key === undefined ? { kind: "sdk-open-metadata", metadata: value } : { kind: "field", key }
}

const metadataEntries = (values: ReadonlyArray<unknown> | undefined): ReadonlyArray<HulyDomainIndexMetadataEntry> =>
  (values ?? []).map(metadataEntry)

const metadataKeys = (values: ReadonlyArray<unknown> | undefined): ReadonlyArray<HulyConfigurationMetadataKey> =>
  (values ?? []).flatMap((value) => {
    const key = optionalMetadataKey(value)
    return key === undefined ? [] : [key]
  })

const toPluginConfigurationSummary = (config: HulyPluginConfiguration) => ({
  pluginId: HulyPluginId.make(String(config.pluginId)),
  label: labelOrDefault(config.label, NonEmptyString.make(String(config.pluginId))),
  enabled: config.enabled,
  beta: config.beta,
  transactionCount: Count.make(config.transactions.length)
})

const toDomainIndexConfigurationSummary = (config: HulyDomainIndexConfiguration) => ({
  domain: HulyDomainName.make(String(config.domain)),
  ...(config.disableCollection === undefined ? {} : { disableCollection: config.disableCollection }),
  disabled: metadataEntries(config.disabled),
  indexes: metadataEntries(config.indexes),
  skip: metadataKeys(config.skip)
})

const sequenceKey = (sequence: HulySequence): string => String(sequence._id)

const toSequenceSummary = (sequence: HulySequence | HulyCustomSequence) => ({
  sequenceId: HulySequenceId.make(String(sequence._id)),
  attachedClass: ObjectClassName.make(String(sequence.attachedTo)),
  currentValue: HulySequenceValue.make(sequence.sequence),
  ...("prefix" in sequence && sequence.prefix !== "" ? { prefix: HulySequencePrefix.make(sequence.prefix) } : {})
})

export const listHulyPluginConfigurations = (): Effect.Effect<
  ListHulyPluginConfigurationsResult,
  HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const configs = yield* client.findAll<HulyPluginConfiguration>(
      core.class.PluginConfiguration,
      hulyQuery<HulyPluginConfiguration>({}),
      { sort: { pluginId: SortingOrder.Ascending } }
    )
    const pluginConfigurations = configs.map(toPluginConfigurationSummary)
    return {
      pluginConfigurations,
      total: Count.make(pluginConfigurations.length)
    }
  })

export const listHulyDomainIndexConfigurations = (): Effect.Effect<
  ListHulyDomainIndexConfigurationsResult,
  HulyClientError,
  HulyClient
> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const configs = yield* client.findAll<HulyDomainIndexConfiguration>(
      core.class.DomainIndexConfiguration,
      hulyQuery<HulyDomainIndexConfiguration>({}),
      { sort: { domain: SortingOrder.Ascending } }
    )
    const domainIndexConfigurations = configs.map(toDomainIndexConfigurationSummary)
    return {
      domainIndexConfigurations,
      total: Count.make(domainIndexConfigurations.length)
    }
  })

export const listHulySequences = (): Effect.Effect<ListHulySequencesResult, HulyClientError, HulyClient> =>
  Effect.gen(function*() {
    const client = yield* HulyClient
    const sequences = yield* client.findAll<HulySequence>(
      core.class.Sequence,
      hulyQuery<HulySequence>({}),
      { sort: { _id: SortingOrder.Ascending } }
    )
    const customSequences = yield* client.findAll<HulyCustomSequence>(
      core.class.CustomSequence,
      hulyQuery<HulyCustomSequence>({}),
      { sort: { _id: SortingOrder.Ascending } }
    )
    const merged = new Map<string, HulySequence | HulyCustomSequence>([
      ...sequences.map((sequence) => [sequenceKey(sequence), sequence] as const),
      ...customSequences.map((sequence) => [sequenceKey(sequence), sequence] as const)
    ])
    const sequenceSummaries = [...merged.values()].map(toSequenceSummary)
    return {
      sequences: sequenceSummaries,
      total: Count.make(sequenceSummaries.length)
    }
  })

export const describeHulySpaceTypeCapabilities = (
  params: DescribeHulySpaceTypeCapabilitiesParams
): Effect.Effect<HulySpaceTypeCapabilities, DescribeHulySpaceTypeCapabilitiesError, HulyClient> =>
  Effect.gen(function*() {
    const detail = yield* getSpaceType({ spaceType: params.spaceType })
    return {
      id: detail.id,
      name: detail.name,
      shortDescription: detail.shortDescription,
      descriptor: detail.descriptor,
      descriptorName: detail.descriptorName,
      descriptorDescription: detail.descriptorDescription,
      baseClass: detail.baseClass,
      targetClass: detail.targetClass,
      defaultMembers: detail.defaultMembers,
      autoJoin: detail.autoJoin,
      roles: detail.roles,
      rolePermissions: detail.availablePermissions,
      assignmentShape: {
        storedOnSpaceField: HulyConfigurationMetadataKey.make("roles"),
        roleKeyField: HulyConfigurationMetadataKey.make("roleId"),
        memberValueShape: "accountUuidArrayOrUndefined",
        readProjectionTools: ["get_space"].map((tool) => HulyMcpToolName.make(tool))
      }
    }
  })
