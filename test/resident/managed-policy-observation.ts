import { Schema } from "effect"

import { HttpPort } from "../../src/mcp/http-transport.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"

export const ManagedPolicyObservation = Schema.Struct({
  projectPort: HttpPort.check(Schema.isGreaterThan(0)),
  issuePort: HttpPort.check(Schema.isGreaterThan(0)),
  crossPolicyCallsRefused: Schema.Literal(true),
  backendExits: Schema.Array(KernelOwnedExit),
  privateStateRemoved: Schema.Literal(true)
})
