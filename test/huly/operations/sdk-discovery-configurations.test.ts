import { describe, it } from "@effect/vitest"
import type {
  Class,
  CustomSequence,
  Doc,
  DocumentQuery,
  DomainIndexConfiguration,
  FindResult,
  Permission,
  PersonId,
  PluginConfiguration,
  Ref,
  Role,
  Sequence,
  Space,
  SpaceType,
  SpaceTypeDescriptor
} from "@hcengineering/core"
import { toFindResult } from "@hcengineering/core"
import type { Plugin } from "@hcengineering/platform"
import { Effect, Schema } from "effect"
import { expect } from "vitest"
import { assertAt } from "../../../src/utils/assertions.js"

import {
  HulySpaceTypeCapabilitiesSchema,
  ListHulyDomainIndexConfigurationsResultSchema,
  ListHulyPluginConfigurationsResultSchema,
  ListHulySequencesResultSchema
} from "../../../src/domain/schemas/sdk-discovery-configurations.js"
import { SpaceTypeIdentifier } from "../../../src/domain/schemas/shared.js"
import { HulyClient, type HulyClientOperations } from "../../../src/huly/client.js"
import { core, tracker } from "../../../src/huly/huly-plugins.js"
import { toRef } from "../../../src/huly/operations/sdk-boundary.js"
import {
  describeHulySpaceTypeCapabilities,
  listHulyDomainIndexConfigurations,
  listHulyPluginConfigurations,
  listHulySequences
} from "../../../src/huly/operations/sdk-discovery-configurations.js"

const person = "person-1" as PersonId
const space = "space-1" as Ref<Space>
const account = "00000000-0000-4000-8000-000000000001"

const baseDoc = {
  space,
  modifiedBy: person,
  modifiedOn: 0
} as const

const makePluginConfig = (overrides: Readonly<Record<string, unknown>>): PluginConfiguration => {
  const value: unknown = {
    ...baseDoc,
    _id: "plugin-config-1",
    _class: core.class.PluginConfiguration,
    pluginId: "tracker" as Plugin,
    label: "tracker:plugin:Tracker",
    transactions: ["tx-1", "tx-2"],
    enabled: true,
    beta: false,
    ...overrides
  }
  // SDK boundary fixture: plugin configuration docs are plain Huly documents at runtime.
  return value as PluginConfiguration
}

const makeDomainConfig = (overrides: Readonly<Record<string, unknown>>): DomainIndexConfiguration => {
  const value: unknown = {
    ...baseDoc,
    _id: "domain-config-1",
    _class: core.class.DomainIndexConfiguration,
    domain: "tracker",
    disabled: ["legacyIndex", { keys: { modifiedOn: -1 } }],
    indexes: [{ keys: "identifier", sparse: true }],
    skip: ["transient"],
    ...overrides
  }
  // SDK boundary fixture: domain index configs intentionally carry SDK-open index metadata.
  return value as DomainIndexConfiguration
}

const makeSequence = (overrides: Readonly<Partial<Sequence>>): Sequence => {
  const value: unknown = {
    ...baseDoc,
    _id: "sequence-issue",
    _class: core.class.Sequence,
    attachedTo: tracker.class.Issue,
    sequence: 12,
    ...overrides
  }
  // SDK boundary fixture: sequence docs are plain Huly documents at runtime.
  return value as Sequence
}

const makeCustomSequence = (overrides: Readonly<Partial<CustomSequence>>): CustomSequence => {
  const value: unknown = {
    ...baseDoc,
    _id: "sequence-custom",
    _class: core.class.CustomSequence,
    attachedTo: tracker.class.Issue,
    sequence: 7,
    prefix: "ISSUE",
    ...overrides
  }
  // SDK boundary fixture: custom sequence extends sequence with a prefix field.
  return value as CustomSequence
}

const makeSpaceType = (overrides: Readonly<Partial<SpaceType>>): SpaceType => {
  const value: unknown = {
    ...baseDoc,
    _id: "space-type-1",
    _class: core.class.SpaceType,
    name: "Project Type",
    descriptor: "descriptor-1",
    members: [account],
    autoJoin: true,
    targetClass: core.class.Space,
    roles: 1,
    ...overrides
  }
  // SDK boundary fixture: space type docs contain only fields read by getSpaceType.
  return value as SpaceType
}

const makeDescriptor = (overrides: Readonly<Partial<SpaceTypeDescriptor>>): SpaceTypeDescriptor => {
  const value: unknown = {
    ...baseDoc,
    _id: "descriptor-1",
    _class: core.class.SpaceTypeDescriptor,
    name: "Project descriptor",
    description: "Descriptor description",
    icon: "icon",
    baseClass: core.class.Space,
    availablePermissions: [toRef<Permission>("permission-update")],
    ...overrides
  }
  // SDK boundary fixture: descriptor docs contain only fields read by getSpaceType.
  return value as SpaceTypeDescriptor
}

const makeRole = (overrides: Readonly<Partial<Role>>): Role => {
  const value: unknown = {
    ...baseDoc,
    _id: "role-admin",
    _class: core.class.Role,
    attachedTo: "space-type-1",
    attachedToClass: core.class.SpaceType,
    collection: "roles",
    name: "Admins",
    permissions: [toRef<Permission>("permission-update")],
    ...overrides
  }
  // SDK boundary fixture: role docs contain only fields read by getSpaceType.
  return value as Role
}

const makePermission = (overrides: Readonly<Partial<Permission>>): Permission => {
  const value: unknown = {
    ...baseDoc,
    _id: "permission-update",
    _class: core.class.Permission,
    label: "Update space",
    scope: "space",
    objectClass: core.class.Space,
    ...overrides
  }
  // SDK boundary fixture: permission docs contain only fields read by getSpaceType.
  return value as Permission
}

interface ConfigLayerData {
  readonly pluginConfigs?: ReadonlyArray<PluginConfiguration>
  readonly domainConfigs?: ReadonlyArray<DomainIndexConfiguration>
  readonly sequences?: ReadonlyArray<Sequence>
  readonly customSequences?: ReadonlyArray<CustomSequence>
  readonly spaceTypes?: ReadonlyArray<SpaceType>
  readonly descriptors?: ReadonlyArray<SpaceTypeDescriptor>
  readonly roles?: ReadonlyArray<Role>
  readonly permissions?: ReadonlyArray<Permission>
}

type QueryRecord = Readonly<Record<string, unknown>>
type DocRecord = Readonly<Record<string, unknown>>

const queryRecord = <T extends Doc>(query: DocumentQuery<T>): QueryRecord => {
  // DocumentQuery<T> is a structurally keyed SDK object. The fake client only needs runtime key matching.
  // eslint-disable-next-line no-restricted-syntax -- test-only structural query adapter
  return query as unknown as QueryRecord
}

const docRecord = (doc: Doc): DocRecord => {
  // Huly SDK docs are plain objects at runtime, so keyed query matching is safe in this test adapter.
  // eslint-disable-next-line no-restricted-syntax -- test-only structural document adapter
  return doc as unknown as DocRecord
}

const matchesQuery = (doc: Doc, query: QueryRecord): boolean =>
  Object.entries(query).every(([key, value]) => {
    const actual = docRecord(doc)[key]
    if (typeof value === "object" && value !== null && "$in" in value && Array.isArray(value.$in)) {
      return value.$in.includes(actual)
    }
    return actual === value
  })

const result = <T extends Doc>(docs: ReadonlyArray<T>): FindResult<T> => toFindResult([...docs])

const createTestLayer = (data: ConfigLayerData) => {
  const pluginConfigs = [...(data.pluginConfigs ?? [])]
  const domainConfigs = [...(data.domainConfigs ?? [])]
  const sequences = [...(data.sequences ?? [])]
  const customSequences = [...(data.customSequences ?? [])]
  const spaceTypes = [...(data.spaceTypes ?? [])]
  const descriptors = [...(data.descriptors ?? [])]
  const roles = [...(data.roles ?? [])]
  const permissions = [...(data.permissions ?? [])]

  const findAll: HulyClientOperations["findAll"] = <T extends Doc>(
    _class: Ref<Class<T>>,
    query: DocumentQuery<T>
  ) => {
    const matches = (docs: ReadonlyArray<Doc>) => docs.filter((doc) => matchesQuery(doc, queryRecord(query)))
    const docs = (() => {
      if (_class === core.class.PluginConfiguration) return matches(pluginConfigs)
      if (_class === core.class.DomainIndexConfiguration) return matches(domainConfigs)
      if (_class === core.class.Sequence) return matches(sequences)
      if (_class === core.class.CustomSequence) return matches(customSequences)
      if (_class === core.class.SpaceType) return matches(spaceTypes)
      if (_class === core.class.SpaceTypeDescriptor) return matches(descriptors)
      if (_class === core.class.Role) return matches(roles)
      if (_class === core.class.Permission) return matches(permissions)
      return []
    })()
    // Brands erased at runtime; the class branch above selects fixtures matching T.
    // eslint-disable-next-line no-restricted-syntax -- test fake class branch narrows fixture type at runtime
    return Effect.succeed(result(docs as unknown as ReadonlyArray<T>))
  }

  const findOne: HulyClientOperations["findOne"] = <T extends Doc>(_class: Ref<Class<T>>, query: DocumentQuery<T>) =>
    findAll(_class, query).pipe(Effect.map((docs) => docs.at(0)))

  return HulyClient.testLayer({ findAll, findOne })
}

describe("sdk discovery configuration operations", () => {
  it.effect("lists plugin configurations with labels and transaction counts", () =>
    Effect.gen(function*() {
      const listed = yield* listHulyPluginConfigurations().pipe(
        Effect.provide(createTestLayer({ pluginConfigs: [makePluginConfig({})] }))
      )
      const encoded = yield* Schema.encodeUnknown(ListHulyPluginConfigurationsResultSchema)(listed)

      expect(encoded).toEqual({
        pluginConfigurations: [{
          pluginId: "tracker",
          label: "Tracker",
          enabled: true,
          beta: false,
          transactionCount: 2
        }],
        total: 1
      })
    }))

  it.effect("lists domain index configurations with open SDK metadata summaries", () =>
    Effect.gen(function*() {
      const listed = yield* listHulyDomainIndexConfigurations().pipe(
        Effect.provide(createTestLayer({ domainConfigs: [makeDomainConfig({ disableCollection: true })] }))
      )
      const encoded = yield* Schema.encodeUnknown(ListHulyDomainIndexConfigurationsResultSchema)(listed)

      expect(encoded).toEqual({
        domainIndexConfigurations: [{
          domain: "tracker",
          disableCollection: true,
          disabled: [
            { kind: "field", key: "legacyIndex" },
            { kind: "sdk-open-metadata", metadata: { keys: { modifiedOn: -1 } } }
          ],
          indexes: [{ kind: "sdk-open-metadata", metadata: { keys: "identifier", sparse: true } }],
          skip: ["transient"]
        }],
        total: 1
      })
    }))

  it.effect("normalizes sparse plugin and domain configuration documents", () =>
    Effect.gen(function*() {
      const pluginResult = yield* listHulyPluginConfigurations().pipe(
        Effect.provide(createTestLayer({
          pluginConfigs: [makePluginConfig({ pluginId: "bare-plugin" as Plugin, label: "" })]
        }))
      )
      const domainResult = yield* listHulyDomainIndexConfigurations().pipe(
        Effect.provide(createTestLayer({
          domainConfigs: [
            makeDomainConfig({
              disabled: undefined,
              indexes: undefined,
              skip: ["", "validSkip"],
              disableCollection: undefined
            })
          ]
        }))
      )
      const encodedPlugin = yield* Schema.encodeUnknown(ListHulyPluginConfigurationsResultSchema)(pluginResult)
      const encodedDomain = yield* Schema.encodeUnknown(ListHulyDomainIndexConfigurationsResultSchema)(domainResult)

      expect(assertAt(encodedPlugin.pluginConfigurations, 0)).toMatchObject({
        pluginId: "bare-plugin",
        label: "bare-plugin"
      })
      expect(assertAt(encodedDomain.domainIndexConfigurations, 0)).toEqual({
        domain: "tracker",
        disabled: [],
        indexes: [],
        skip: ["validSkip"]
      })

      const omittedSkipResult = yield* listHulyDomainIndexConfigurations().pipe(
        Effect.provide(createTestLayer({
          domainConfigs: [
            makeDomainConfig({
              skip: undefined
            })
          ]
        }))
      )
      const encodedOmittedSkip = yield* Schema.encodeUnknown(ListHulyDomainIndexConfigurationsResultSchema)(
        omittedSkipResult
      )
      expect(encodedOmittedSkip.domainIndexConfigurations[0]?.skip).toEqual([])
    }))

  it.effect("lists base and custom sequences, preferring custom prefixes for duplicate ids", () =>
    Effect.gen(function*() {
      const listed = yield* listHulySequences().pipe(
        Effect.provide(createTestLayer({
          sequences: [makeSequence({}), makeSequence({ _id: toRef<Sequence>("sequence-custom"), sequence: 6 })],
          customSequences: [makeCustomSequence({})]
        }))
      )
      const encoded = yield* Schema.encodeUnknown(ListHulySequencesResultSchema)(listed)

      expect(encoded).toEqual({
        sequences: [
          { sequenceId: "sequence-issue", attachedClass: tracker.class.Issue, currentValue: 12 },
          {
            sequenceId: "sequence-custom",
            attachedClass: tracker.class.Issue,
            currentValue: 7,
            prefix: "ISSUE"
          }
        ],
        total: 2
      })
    }))

  it.effect("describes space type capabilities with role assignment shape", () =>
    Effect.gen(function*() {
      const detail = yield* describeHulySpaceTypeCapabilities({
        spaceType: SpaceTypeIdentifier.make("space-type-1")
      }).pipe(
        Effect.provide(createTestLayer({
          spaceTypes: [makeSpaceType({})],
          descriptors: [makeDescriptor({})],
          roles: [makeRole({})],
          permissions: [makePermission({})]
        }))
      )
      const encoded = yield* Schema.encodeUnknown(HulySpaceTypeCapabilitiesSchema)(detail)

      expect(encoded).toMatchObject({
        id: "space-type-1",
        descriptor: "descriptor-1",
        baseClass: core.class.Space,
        targetClass: core.class.Space,
        defaultMembers: [account],
        roles: [{ id: "role-admin", permissions: ["permission-update"] }],
        rolePermissions: [{ id: "permission-update", label: "Update space" }],
        assignmentShape: {
          storedOnSpaceField: `mixin:${core.class.Space}`,
          roleKeyField: "role._id",
          memberValueShape: "accountUuidArrayOrUndefined",
          readProjectionTools: ["get_space"]
        }
      })
    }))
})
