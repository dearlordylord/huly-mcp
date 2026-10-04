import type { Domain } from "@hcengineering/core"
import type { ObjectClassName } from "../domain/schemas/shared.js"

// Internal model port; callers retain the schema-parsed full class inventory.
export interface ClassCoverageModel {
  readonly isMixin: (cls: ObjectClassName) => boolean
  readonly findDomain: (cls: ObjectClassName) => Domain | undefined
  readonly isDerived: (cls: ObjectClassName, ancestor: ObjectClassName) => boolean
}

const coversClass = (model: ClassCoverageModel, candidate: ObjectClassName, cls: ObjectClassName) => {
  if (candidate === cls) return true
  if (model.isMixin(candidate) || model.isMixin(cls)) return false
  const domain = model.findDomain(candidate)
  return domain !== undefined && domain === model.findDomain(cls) && model.isDerived(cls, candidate)
}

export const groupTransferClassQueries = (
  classes: ReadonlyArray<ObjectClassName>,
  model: ClassCoverageModel
): ReadonlyArray<ObjectClassName> => {
  const representatives = new Set<ObjectClassName>()
  for (const cls of classes) {
    let representative = cls
    for (const candidate of classes) {
      if (coversClass(model, candidate, representative)) representative = candidate
    }
    representatives.add(representative)
  }
  return [...representatives]
}
