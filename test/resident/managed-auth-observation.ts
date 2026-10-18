import { Schema } from "effect"

import { HttpPort } from "../../src/mcp/http-transport.js"
import { KernelOwnedExit } from "../helpers/kernel-reaped-events.js"

const ListeningPort = HttpPort.check(Schema.isGreaterThan(0))
export const ManagedAuthObservation = Schema.Struct({
  profilePort: ListeningPort,
  environmentTokenPort: ListeningPort,
  passwordPort: ListeningPort,
  rotatedProfilePort: ListeningPort,
  logoutRefused: Schema.Literal(true),
  deletedProfileRefused: Schema.Literal(true),
  backendExits: Schema.Array(KernelOwnedExit),
  privateStateRemoved: Schema.Literal(true)
})
