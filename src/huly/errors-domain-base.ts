import { Schema } from "effect"

import {
  HulyAuthError,
  HulyConnectionError,
  HulyError,
  HulyUnavailableError,
  NoUpdateFieldsError
} from "./errors-base.js"

export const HulyDomainBaseError = Schema.Union(
  HulyError,
  NoUpdateFieldsError,
  HulyConnectionError,
  HulyUnavailableError,
  HulyAuthError
)
