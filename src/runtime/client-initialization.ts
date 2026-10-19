import { Schema } from "effect"

export const HulyInitializationStatus = Schema.Literals([
  "inactive",
  "initializing",
  "ready",
  "failed",
  "closed"
]).annotate({
  description:
    "Current client acquisition status. Closed fences new acquisitions; it does not confirm resource cleanup."
})
export type HulyInitializationStatus = Schema.Schema.Type<typeof HulyInitializationStatus>
