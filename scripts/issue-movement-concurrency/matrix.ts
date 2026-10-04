import { Schema } from "effect"
import { GatewayAction, GatewayPoint } from "./protocol.js"

const CaseSchema = Schema.Struct({
  name: Schema.NonEmptyString,
  mutationKind: Schema.Literals(["none", "child", "comment", "time", "attribute", "ancestry"]),
  point: GatewayPoint,
  action: GatewayAction,
  persistent: Schema.Boolean,
  expectedLocation: Schema.Literals(["source", "destination"])
})
const cases = Schema.decodeUnknownSync(Schema.Array(CaseSchema))([
  ...["child", "comment", "time", "attribute", "ancestry"].flatMap((mutationKind) => [
    {
      name: `refuse-stale-${mutationKind}`,
      mutationKind,
      point: "commit-before",
      action: "pause",
      persistent: false,
      expectedLocation: "source"
    },
    {
      name: `preserve-later-${mutationKind}`,
      mutationKind,
      point: "commit-after",
      action: "pause",
      persistent: false,
      expectedLocation: "destination"
    }
  ]),
  {
    name: "before-allocation-send",
    mutationKind: "none",
    point: "allocation-before",
    action: "fail",
    persistent: true,
    expectedLocation: "source"
  },
  {
    name: "allocated-reply-lost",
    mutationKind: "none",
    point: "allocation-after",
    action: "drop",
    persistent: true,
    expectedLocation: "source"
  },
  {
    name: "successful-batch-reply-lost",
    mutationKind: "none",
    point: "commit-after",
    action: "drop",
    persistent: true,
    expectedLocation: "destination"
  },
  {
    name: "verification-outage",
    mutationKind: "none",
    point: "verification-read",
    action: "fail",
    persistent: true,
    expectedLocation: "destination"
  }
])
for (const entry of cases) process.stdout.write(`${JSON.stringify(entry)}\n`)
