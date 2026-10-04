import type { TxOperations } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import type { HulyClientError } from "./client.js"
import { HulyConnectionError, type HulyConnectionOperation, makeOperationConnectionError } from "./errors-base.js"
import {
  makeMovementTxOperations,
  MovementTransportConfigSchema,
  MovementTransportError,
  type MovementHttpPort,
  type MovementTransportConfig
} from "./movement-transaction-transport.js"

export type MovementWriteError = HulyClientError | MovementTransportError

export const parseMovementTransportConfig = (
  input: unknown
): Effect.Effect<MovementTransportConfig, HulyConnectionError> =>
  Schema.decodeUnknownEffect(MovementTransportConfigSchema)(input).pipe(
    Effect.mapError(
      () => new HulyConnectionError({ message: "Workspace movement transport configuration is invalid." })
    )
  )

export const withMovementWriteClient = <A>(
  ordinary: TxOperations,
  config: MovementTransportConfig,
  http: MovementHttpPort | undefined,
  operation: HulyConnectionOperation,
  write: (client: TxOperations) => Promise<A>
): Effect.Effect<A, MovementWriteError> =>
  Effect.tryPromise({
    try: (signal) => write(makeMovementTxOperations(ordinary, config, http, signal)),
    catch: (error) => (error instanceof MovementTransportError ? error : makeOperationConnectionError(operation, error))
  })
