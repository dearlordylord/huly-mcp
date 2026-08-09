import { Schema } from "effect"

import {
  FilteredViewIdentifierAmbiguousError,
  FilteredViewNotFoundError,
  ViewletIdentifierAmbiguousError,
  ViewletNotFoundError
} from "./errors-views.js"
import { WorkbenchApplicationAliasAmbiguousError } from "./errors-workbench.js"

export const HulyViewDomainError = Schema.Union(
  FilteredViewNotFoundError,
  FilteredViewIdentifierAmbiguousError,
  ViewletNotFoundError,
  ViewletIdentifierAmbiguousError,
  WorkbenchApplicationAliasAmbiguousError
)
