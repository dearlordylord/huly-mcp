import { createServer, type RequestListener } from "node:http"
import { Schema } from "effect"
import { PositiveInteger, UrlString } from "../../src/domain/schemas/shared.js"

export const withHttpFixture = async <A>(handle: RequestListener, run: (url: UrlString) => Promise<A>): Promise<A> => {
  const server = createServer(handle)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const address = Schema.decodeUnknownSync(Schema.Struct({ port: PositiveInteger }))(server.address())
    return await run(UrlString.make(`http://127.0.0.1:${address.port}`))
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error === undefined ? resolve() : reject(error)))
    )
  }
}
