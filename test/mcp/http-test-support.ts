import * as http from "node:http"

import { NodeHttpServer } from "@effect/platform-node"
import { Effect } from "effect"

import {
  type HttpServerFactory,
  type HttpPort,
  HttpTransportError,
  httpServeError
} from "../../src/mcp/http-transport.js"

export const makeTestHttpServerFactory = (
  onListening: (server: http.Server) => void,
  writeError?: (message: string) => void,
  portOverride?: HttpPort
): HttpServerFactory => ({
  make: (port, host, gracefulShutdownTimeout) => {
    const rawServer = http.createServer()
    return NodeHttpServer.make(() => rawServer, {
      port: portOverride ?? port,
      host,
      ...(gracefulShutdownTimeout === undefined ? {} : { gracefulShutdownTimeout })
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          onListening(rawServer)
        })
      ),
      Effect.mapError((error) => httpServeError(host, port, error))
    )
  },
  ...(writeError === undefined ? {} : { writeError })
})

export const failingHttpServerFactory = (error: HttpTransportError): HttpServerFactory => ({
  make: () => Effect.fail(error)
})

export const inertHttpServerFactory = (errorMessage: string): HttpServerFactory => ({
  make: () => Effect.fail(new HttpTransportError({ message: errorMessage }))
})
