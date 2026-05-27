/* eslint-disable functional/immutable-data -- stdio safety requires replacing console methods at process startup */

type ConsoleWriter = (...data: ReadonlyArray<unknown>) => void

export interface ConsoleRedirectTarget {
  debug: ConsoleWriter
  error: ConsoleWriter
  info: ConsoleWriter
  log: ConsoleWriter
  warn: ConsoleWriter
}

export interface ConsoleRedirectHandle {
  readonly restore: () => void
}

const redirectedMethods: ReadonlyArray<keyof ConsoleRedirectTarget> = [
  "debug",
  "info",
  "log",
  "warn",
  "error"
]

export const redirectConsoleToStderr = (
  target: ConsoleRedirectTarget = console
): ConsoleRedirectHandle => {
  const original = {
    debug: target.debug,
    error: target.error,
    info: target.info,
    log: target.log,
    warn: target.warn
  }
  const writeToStderr = original.error.bind(target)

  for (const method of redirectedMethods) {
    target[method] = writeToStderr
  }

  return {
    restore: () => {
      target.debug = original.debug
      target.error = original.error
      target.info = original.info
      target.log = original.log
      target.warn = original.warn
    }
  }
}
