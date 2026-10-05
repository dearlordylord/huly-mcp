import type { TxOperations } from "@hcengineering/core"
import { Effect, Schema } from "effect"
import type { HulyClientError } from "./client.js"
import {
  HulyDataInvalidError,
  HulyConnectionError,
  type HulyConnectionOperation,
  makeOperationConnectionError
} from "./errors-base.js"
import {
  makeMovementTxOperations,
  MovementTransportConfigSchema,
  MovementTransportError,
  type MovementHttpPort,
  type MovementTransportConfig
} from "./movement-transaction-transport.js"

export type MovementWriteError = HulyClientError | MovementTransportError | HulyDataInvalidError

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
  write: (client: TxOperations, signal: AbortSignal) => Promise<A>
): Effect.Effect<A, MovementWriteError> =>
  Effect.tryPromise({
    try: (signal) => write(makeMovementTxOperations(ordinary, config, http, signal), signal),
    catch: (error) =>
      error instanceof MovementTransportError || error instanceof HulyDataInvalidError
        ? error
        : makeOperationConnectionError(operation, error)
  })
