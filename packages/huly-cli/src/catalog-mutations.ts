import { businessMutationCliCommandCatalogA } from "./catalog-mutations-business-a.js"
import { businessMutationCliCommandCatalogB } from "./catalog-mutations-business-b.js"
import { collaborationMutationCliCommandCatalogA } from "./catalog-mutations-collaboration-a.js"
import { collaborationMutationCliCommandCatalogB } from "./catalog-mutations-collaboration-b.js"
import { coreMutationCliCommandCatalog } from "./catalog-mutations-core.js"

export const mutationCliCommandCatalog = {
  ...coreMutationCliCommandCatalog,
  ...collaborationMutationCliCommandCatalogA,
  ...collaborationMutationCliCommandCatalogB,
  ...businessMutationCliCommandCatalogA,
  ...businessMutationCliCommandCatalogB
} as const
