import {
  describeHulySpaceTypeCapabilitiesParamsJsonSchema,
  HulySpaceTypeCapabilitiesSchema,
  listHulyDomainIndexConfigurationsParamsJsonSchema,
  ListHulyDomainIndexConfigurationsResultSchema,
  listHulyPluginConfigurationsParamsJsonSchema,
  ListHulyPluginConfigurationsResultSchema,
  listHulySequencesParamsJsonSchema,
  ListHulySequencesResultSchema,
  parseDescribeHulySpaceTypeCapabilitiesParams,
  parseListHulyDomainIndexConfigurationsParams,
  parseListHulyPluginConfigurationsParams,
  parseListHulySequencesParams
} from "../../domain/schemas/sdk-discovery-configurations.js"
import {
  getHulyClassParamsJsonSchema,
  GetHulyClassResultSchema,
  listHulyAttributesParamsJsonSchema,
  ListHulyAttributesResultSchema,
  listHulyClassesParamsJsonSchema,
  ListHulyClassesResultSchema,
  listHulyEnumsParamsJsonSchema,
  ListHulyEnumsResultSchema,
  parseGetHulyClassParams,
  parseListHulyAttributesParams,
  parseListHulyClassesParams,
  parseListHulyEnumsParams
} from "../../domain/schemas/sdk-discovery.js"
import {
  describeHulySpaceTypeCapabilities,
  listHulyDomainIndexConfigurations,
  listHulyPluginConfigurations,
  listHulySequences
} from "../../huly/operations/sdk-discovery-configurations.js"
import {
  getHulyClass,
  listHulyAttributes,
  listHulyClasses,
  listHulyEnums
} from "../../huly/operations/sdk-discovery.js"
import { createEncodedToolHandler, type RegisteredTool } from "./registry.js"

const CATEGORY = "sdk-discovery" as const

export const sdkDiscoveryTools: ReadonlyArray<RegisteredTool> = [
  {
    name: "list_huly_classes",
    description:
      "Discover Huly model class, interface, and mixin IDs visible in this workspace. Use this before raw-object, generic association, custom field, or model-backed work when you need exact class IDs instead of guessing.",
    category: CATEGORY,
    inputSchema: listHulyClassesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_huly_classes",
      parseListHulyClassesParams,
      listHulyClasses,
      ListHulyClassesResultSchema
    )
  },
  {
    name: "get_huly_class",
    description:
      "Read one Huly class/interface/mixin by exact ID and return its inheritance chain plus model attributes. Use this when you need fields, ref targets, enum IDs, or hints about purpose-built MCP tool categories for the class.",
    category: CATEGORY,
    inputSchema: getHulyClassParamsJsonSchema,
    handler: createEncodedToolHandler(
      "get_huly_class",
      parseGetHulyClassParams,
      getHulyClass,
      GetHulyClassResultSchema
    )
  },
  {
    name: "list_huly_attributes",
    description:
      "Discover Huly model attributes across the workspace or directly on one class/mixin. Returns attribute IDs, owner classes, labels, type families, ref targets, enum IDs, and custom-field markers.",
    category: CATEGORY,
    inputSchema: listHulyAttributesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_huly_attributes",
      parseListHulyAttributesParams,
      listHulyAttributes,
      ListHulyAttributesResultSchema
    )
  },
  {
    name: "list_huly_enums",
    description:
      "Discover Huly enum model documents and their valid values. Use enum IDs from get_huly_class or list_huly_attributes to inspect allowed enum values before writing or interpreting enum fields.",
    category: CATEGORY,
    inputSchema: listHulyEnumsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_huly_enums",
      parseListHulyEnumsParams,
      listHulyEnums,
      ListHulyEnumsResultSchema
    )
  },
  {
    name: "list_huly_plugin_configurations",
    description:
      "List read-only Huly plugin configuration records from core.class.PluginConfiguration. Returns plugin id, label, enabled/beta flags, and transaction count so an LLM can see installed model plugin gates without mutating configuration.",
    category: CATEGORY,
    inputSchema: listHulyPluginConfigurationsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_huly_plugin_configurations",
      parseListHulyPluginConfigurationsParams,
      listHulyPluginConfigurations,
      ListHulyPluginConfigurationsResultSchema
    )
  },
  {
    name: "list_huly_domain_index_configurations",
    description:
      "List read-only Huly domain index configuration records from core.class.DomainIndexConfiguration. Returns each domain plus disabled, skip, and enabled-index summaries while preserving SDK-open index/filter/config payloads as typed metadata.",
    category: CATEGORY,
    inputSchema: listHulyDomainIndexConfigurationsParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_huly_domain_index_configurations",
      parseListHulyDomainIndexConfigurationsParams,
      listHulyDomainIndexConfigurations,
      ListHulyDomainIndexConfigurationsResultSchema
    )
  },
  {
    name: "list_huly_sequences",
    description:
      "List read-only Huly sequence counters from core.class.Sequence and core.class.CustomSequence. Returns sequence id, attached class id, current non-negative integer value, and custom prefix when present.",
    category: CATEGORY,
    inputSchema: listHulySequencesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "list_huly_sequences",
      parseListHulySequencesParams,
      listHulySequences,
      ListHulySequencesResultSchema
    )
  },
  {
    name: "describe_huly_space_type_capabilities",
    description:
      "Describe one Huly SpaceType by id or exact name in a single read-only call. Returns descriptor metadata, base/target classes, roles, role permissions, default members, autoJoin, and the stored role-assignment shape.",
    category: CATEGORY,
    inputSchema: describeHulySpaceTypeCapabilitiesParamsJsonSchema,
    handler: createEncodedToolHandler(
      "describe_huly_space_type_capabilities",
      parseDescribeHulySpaceTypeCapabilitiesParams,
      describeHulySpaceTypeCapabilities,
      HulySpaceTypeCapabilitiesSchema
    )
  }
]
