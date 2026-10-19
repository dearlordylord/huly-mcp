import { Schema } from "effect"

import { HostMessage } from "../../src/resident/request-headers.js"

export const ProfileDiagnosticProcess = Schema.Struct({
  stdout: Schema.fromJsonString(
    Schema.Struct({
      jsonrpc: Schema.Literal("2.0"),
      id: Schema.Literal(1),
      result: Schema.Struct({
        tools: Schema.Tuple([
          Schema.Struct({ name: Schema.Literal("get_huly_startup_diagnostic"), description: Schema.NonEmptyString })
        ])
      })
    })
  ),
  stderr: Schema.String
})

export const PROFILE_DIAGNOSTIC_CATALOG_REQUEST = `${Schema.encodeSync(Schema.fromJsonString(HostMessage))({
  jsonrpc: "2.0",
  id: 1,
  method: "tools/list"
})}\n`
