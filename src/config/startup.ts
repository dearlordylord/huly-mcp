import { Config, Effect, Option } from "effect"

export const getLazyEnvs = (environment: NodeJS.ProcessEnv) =>
  Config.String("LAZY_ENVS").pipe(
    Config.option,
    Effect.map((value) =>
      Option.match(value, {
        onNone: () => environment["GLAMA_VERSION"] !== undefined,
        onSome: (flag) => flag.toLowerCase() === "true"
      })
    )
  )
