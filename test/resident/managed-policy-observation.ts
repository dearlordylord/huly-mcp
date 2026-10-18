import { Schema } from "effect"

import { LiveReadProtocol } from "../../scripts/resident-live-read-contract.js"

import { HttpPort } from "../../src/mcp/http-transport.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"

export const ManagedPolicyScenario = Schema.Literals(["native", "proxy-strict", "proxy-non-strict"])
const receiptFields = {
  protocol: LiveReadProtocol,
  projectPort: HttpPort.check(Schema.isGreaterThan(0)),
  issuePort: HttpPort.check(Schema.isGreaterThan(0)),
  backendExits: Schema.Array(KernelOwnedExit),
  privateStateRemoved: Schema.Literal(true)
}
export const ManagedPolicyObservation = Schema.Union([
  Schema.Struct({
    ...receiptFields,
    scenario: Schema.Literals(["native", "proxy-strict"]),
    crossPolicyEvidence: Schema.Literal("call-refused")
  }),
  Schema.Struct({
    ...receiptFields,
    scenario: Schema.Literal("proxy-non-strict"),
    crossPolicyEvidence: Schema.Literal("schema-visible")
  })
])
