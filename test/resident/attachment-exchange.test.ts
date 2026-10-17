import { Cause, Effect, Exit, Option, Schema } from "effect"
import { expect, it } from "vitest"

import { readResidentAttachment } from "../../src/resident/attachment-file.js"
import { withResidentExchange } from "../../src/resident/attachment-exchange.js"
import { HostMessage } from "../../src/resident/request-headers.js"
import { startResidentFixture } from "../helpers/resident-fixture.js"

const HTTP_FORBIDDEN = 403

it("rejects unencodable input before dispatch and reports a lost connection without replay", async () => {
  let calls = 0
  const fixture = await startResidentFixture(() => {
    calls++
  }, "exchange-fixture")
  try {
    const attachment = await Effect.runPromise(readResidentAttachment(fixture.file))
    const message = Schema.decodeUnknownSync(HostMessage)({ jsonrpc: "2.0", id: 1, method: "ping" })
    const denied = await Effect.runPromise(
      withResidentExchange(attachment, message, Option.none(), (response) => Effect.succeed(response.status))
    )
    expect(denied).toBe(HTTP_FORBIDDEN)
    const unencodable = HostMessage.make({ ...message, params: 1n })
    const encoding = await Effect.runPromiseExit(
      withResidentExchange(attachment, unencodable, Option.none(), () => Effect.die("Must not dispatch"))
    )
    expect(Exit.isFailure(encoding) && Cause.pretty(encoding.cause)).toContain("could not be encoded")
    await new Promise<void>((resolve, reject) => fixture.backend.close((error) => (error ? reject(error) : resolve())))
    const disconnected = await Effect.runPromiseExit(
      withResidentExchange(attachment, message, Option.none(), () => Effect.die("Must not dispatch"))
    )
    expect(Exit.isFailure(disconnected) && Cause.pretty(disconnected.cause)).toContain(
      "operation outcome may be unknown"
    )
    expect(calls).toBe(0)
  } finally {
    await fixture.cleanup()
  }
})
