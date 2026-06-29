import type { McpToolName } from "../../../src/mcp/tools/index.js"
import { businessReadOnlyCliCommandCatalogA } from "./catalog-read-only-business-a.js"
import { businessReadOnlyCliCommandCatalogB } from "./catalog-read-only-business-b.js"
import { collaborationReadOnlyCliCommandCatalog } from "./catalog-read-only-collaboration.js"
import { coreReadOnlyCliCommandCatalog } from "./catalog-read-only-core.js"
import { platformReadOnlyCliCommandCatalog } from "./catalog-read-only-platform.js"

export const readOnlyCliCommandCatalog = {
  ...coreReadOnlyCliCommandCatalog,
  ...collaborationReadOnlyCliCommandCatalog,
  ...businessReadOnlyCliCommandCatalogA,
  ...businessReadOnlyCliCommandCatalogB,
  ...platformReadOnlyCliCommandCatalog
} as const

export const deferredReadOnlyCliCommandTools = [
  "describe_huly_space_type_capabilities",
  "get_huly_class",
  "list_huly_attributes",
  "list_huly_classes",
  "list_huly_domain_index_configurations",
  "list_huly_enums",
  "list_huly_plugin_configurations",
  "list_huly_sequences"
] as const satisfies ReadonlyArray<McpToolName>
