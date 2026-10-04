import { Schema } from "effect"
import { UrlString } from "../../src/domain/schemas/shared.js"
import { runPublic } from "../../scripts/issue-movement-concurrency/public-process.js"
const ResultSchema = Schema.Struct({ priorPresent: Schema.Boolean, url: UrlString })
const main = async () => {
  const results = []
  for (const freshMcpDiscovery of [true, false]) {
    const output = await runPublic(
      [
        "-e",
        "process.stdout.write(JSON.stringify({priorPresent:process.env.HULY_INTEGRATION_MCP_PRIOR!==undefined,url:process.env.HULY_URL}))"
      ],
      UrlString.make("http://gateway.local"),
      new AbortController().signal,
      { freshMcpDiscovery }
    )
    results.push(Schema.decodeUnknownSync(Schema.fromJsonString(ResultSchema))(output))
  }
  process.stdout.write(JSON.stringify(results))
}
void main()
