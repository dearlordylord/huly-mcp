/* eslint-disable @typescript-eslint/no-explicit-any, functional/no-mixed-types, functional/immutable-data, no-restricted-syntax -- test-only call probe for replacing Vitest spies */
export interface MockFn<Args extends Array<any>, Result> {
  (...args: Args): Result
  readonly mock: { readonly calls: Array<Args> }
  mockClear: () => MockFn<Args, Result>
  mockReset: () => MockFn<Args, Result>
  mockImplementation: (impl: (...args: Args) => Result) => MockFn<Args, Result>
  mockImplementationOnce: (impl: (...args: Args) => Result) => MockFn<Args, Result>
  mockResolvedValue: <A>(value: A) => MockFn<Args, Result>
  mockRejectedValue: (error: unknown) => MockFn<Args, Result>
  mockRejectedValueOnce: (error: unknown) => MockFn<Args, Result>
  mockReturnValue: (value: Result) => MockFn<Args, Result>
  mockReturnThis: () => MockFn<Args, Result>
}

const defaultImpl = <Args extends Array<unknown>, Result>(): (...args: Args) => Result => (() => undefined as Result)

export const mockFn = <Fn extends (...args: Array<any>) => any = (...args: Array<any>) => any>(
  initial?: Fn
): MockFn<Parameters<Fn>, ReturnType<Fn>> => {
  type Args = Parameters<Fn>
  type Result = ReturnType<Fn>
  let impl = initial ?? defaultImpl<Args, Result>()
  const once: Array<(...args: Args) => Result> = []
  const calls: Array<Args> = []
  const fn = ((...args: Args): Result => {
    calls.push(args)
    const next = once.shift()
    return (next ?? impl)(...args)
  }) as MockFn<Args, Result>

  Object.defineProperty(fn, "mock", {
    value: { calls },
    enumerable: true
  })
  fn.mockClear = () => {
    calls.length = 0
    return fn
  }
  fn.mockReset = () => {
    calls.length = 0
    once.length = 0
    impl = defaultImpl<Args, Result>()
    return fn
  }
  fn.mockImplementation = (next) => {
    impl = next
    return fn
  }
  fn.mockImplementationOnce = (next) => {
    once.push(next)
    return fn
  }
  fn.mockResolvedValue = (value) => {
    impl = () => Promise.resolve(value) as Result
    return fn
  }
  fn.mockRejectedValue = (error) => {
    impl = () => Promise.reject(error) as Result
    return fn
  }
  fn.mockRejectedValueOnce = (error) => {
    once.push(() => Promise.reject(error) as Result)
    return fn
  }
  fn.mockReturnValue = (value) => {
    impl = () => value
    return fn
  }
  fn.mockReturnThis = () => {
    impl = function(this: Result) {
      return this
    } as (...args: Args) => Result
    return fn
  }
  return fn
}

export const clearMockFns = (...fns: Array<MockFn<Array<any>, any>>) => {
  for (const fn of fns) {
    fn.mockClear()
  }
}
