import { describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { expect } from "vitest"
import {
  assertAt,
  assertExists,
  assertExistsEffect,
  assertFirst,
  assertNonEmpty,
  assertNotNull,
  getFirstEffect,
  getOneOrNone,
  getOneOrNoneEffect,
  getOnlyOne,
  getOnlyOneEffect,
  isExistent,
  isNonEmpty,
  isPair,
  isSingle
} from "../../src/utils/assertions.js"

describe("assertions", () => {
  describe("assertExists", () => {
    it("returns the value when it is defined", () => {
      expect(assertExists(42)).toBe(42)
      expect(assertExists("hello")).toBe("hello")
      expect(assertExists(0)).toBe(0)
      expect(assertExists("")).toBe("")
      expect(assertExists(false)).toBe(false)
    })

    it("throws on null with default message", () => {
      expect(() => assertExists(null)).toThrow("Expected value to exist")
    })

    it("throws on undefined with default message", () => {
      expect(() => assertExists(undefined)).toThrow("Expected value to exist")
    })

    it("throws with custom message", () => {
      expect(() => assertExists(null, "missing user")).toThrow("missing user")
      expect(() => assertExists(undefined, "missing user")).toThrow("missing user")
    })

    it("thrown error has name AssertionError", () => {
      try {
        assertExists(null)
        expect.fail("should have thrown")
      } catch (e) {
        expect((e as Error).name).toBe("AssertionError")
      }
    })
  })

  describe("isExistent", () => {
    it("returns true for defined values", () => {
      expect(isExistent(42)).toBe(true)
      expect(isExistent("")).toBe(true)
      expect(isExistent(0)).toBe(true)
      expect(isExistent(false)).toBe(true)
    })

    it("returns false for null", () => {
      expect(isExistent(null)).toBe(false)
    })

    it("returns false for undefined", () => {
      expect(isExistent(undefined)).toBe(false)
    })
  })

  describe("assertNotNull", () => {
    it("returns the value when not null", () => {
      expect(assertNotNull(42)).toBe(42)
      expect(assertNotNull("hello")).toBe("hello")
      expect(assertNotNull(0)).toBe(0)
      expect(assertNotNull(false)).toBe(false)
    })

    it("throws on null with default message", () => {
      expect(() => assertNotNull(null)).toThrow("Expected value to not be null")
    })

    it("throws with custom message", () => {
      expect(() => assertNotNull(null, "value was null")).toThrow("value was null")
    })

    it("thrown error has name AssertionError", () => {
      try {
        assertNotNull(null)
        expect.fail("should have thrown")
      } catch (e) {
        expect((e as Error).name).toBe("AssertionError")
      }
    })
  })

  describe("getOnlyOne", () => {
    it("returns the element for single-element array", () => {
      expect(getOnlyOne([42])).toBe(42)
      expect(getOnlyOne(["only"])).toBe("only")
    })

    it("throws for empty array with default message", () => {
      expect(() => getOnlyOne([])).toThrow("Expected exactly 1 element, got 0")
    })

    it("throws for multi-element array with default message", () => {
      expect(() => getOnlyOne([1, 2])).toThrow("Expected exactly 1 element, got 2")
      expect(() => getOnlyOne([1, 2, 3])).toThrow("Expected exactly 1 element, got 3")
    })

    it("throws with custom string message", () => {
      expect(() => getOnlyOne([], "need exactly one")).toThrow("need exactly one")
      expect(() => getOnlyOne([1, 2], "need exactly one")).toThrow("need exactly one")
    })

    it("throws with custom function message receiving the array", () => {
      const msgFn = (arr: ReadonlyArray<number>) => `got ${arr.length} items: ${arr.join(",")}`
      expect(() => getOnlyOne([], msgFn)).toThrow("got 0 items: ")
      expect(() => getOnlyOne([1, 2, 3], msgFn)).toThrow("got 3 items: 1,2,3")
    })
  })

  describe("assertFirst", () => {
    it("returns first element of non-empty array", () => {
      expect(assertFirst([10, 20, 30])).toBe(10)
      expect(assertFirst(["a"])).toBe("a")
    })

    it("throws for empty array with default message", () => {
      expect(() => assertFirst([])).toThrow("Expected non-empty array")
    })

    it("throws with custom message", () => {
      expect(() => assertFirst([], "no items found")).toThrow("no items found")
    })
  })

  describe("assertAt", () => {
    it("returns the item at the requested index", () => {
      expect(assertAt([10, 20, 30], 1)).toBe(20)
    })

    it("throws for a missing item with the default message", () => {
      expect(() => assertAt(["a"], 3)).toThrow("Expected array item at index 3")
    })

    it("throws with a custom message", () => {
      expect(() => assertAt([], 0, "missing first call")).toThrow("missing first call")
    })
  })

  describe("assertNonEmpty", () => {
    it("returns the array for non-empty input", () => {
      const result = assertNonEmpty([1, 2, 3])
      expect(result).toEqual([1, 2, 3])
    })

    it("returns single-element array", () => {
      const result = assertNonEmpty(["x"])
      expect(result).toEqual(["x"])
    })

    it("throws for empty array with default message", () => {
      expect(() => assertNonEmpty([])).toThrow("Expected non-empty array")
    })

    it("throws with custom message", () => {
      expect(() => assertNonEmpty([], "list must not be empty")).toThrow("list must not be empty")
    })
  })

  describe("isNonEmpty", () => {
    it("returns true for non-empty array", () => {
      expect(isNonEmpty([1])).toBe(true)
      expect(isNonEmpty([1, 2, 3])).toBe(true)
    })

    it("returns false for empty array", () => {
      expect(isNonEmpty([])).toBe(false)
    })
  })

  describe("isSingle", () => {
    it("narrows exactly one element", () => {
      expect(isSingle([1])).toBe(true)
      expect(isSingle([])).toBe(false)
      expect(isSingle([1, 2])).toBe(false)
    })
  })

  describe("isPair", () => {
    it("narrows exactly two elements", () => {
      expect(isPair([1, 2])).toBe(true)
      expect(isPair([1])).toBe(false)
      expect(isPair([1, 2, 3])).toBe(false)
    })
  })

  describe("getOneOrNone", () => {
    it("returns Option.none() for empty array", () => {
      const result = getOneOrNone([])
      expect(Option.isNone(result)).toBe(true)
    })

    it("returns Option.some(element) for single-element array", () => {
      const result = getOneOrNone([42])
      expect(Option.isSome(result)).toBe(true)
      expect(Option.getOrThrow(result)).toBe(42)
    })

    it("throws for array with 2+ elements with default message", () => {
      expect(() => getOneOrNone([1, 2])).toThrow("Expected 0 or 1 elements, got 2")
      expect(() => getOneOrNone([1, 2, 3])).toThrow("Expected 0 or 1 elements, got 3")
    })

    it("throws with custom message for 2+ elements", () => {
      expect(() => getOneOrNone([1, 2], "too many")).toThrow("too many")
    })
  })

  describe("assertExistsEffect", () => {
    it.effect("succeeds with the value when defined", () =>
      Effect.gen(function*() {
        const result = yield* assertExistsEffect(42, () => "missing")
        expect(result).toBe(42)
      }))

    it.effect("succeeds with falsy defined values", () =>
      Effect.gen(function*() {
        expect(yield* assertExistsEffect(0, () => "missing")).toBe(0)
        expect(yield* assertExistsEffect("", () => "missing")).toBe("")
        expect(yield* assertExistsEffect(false, () => "missing")).toBe(false)
      }))

    it.effect("fails for null", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(assertExistsEffect(null, () => "was null"))
        expect(error).toBe("was null")
      }))

    it.effect("fails for undefined", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(assertExistsEffect(undefined, () => "was undefined"))
        expect(error).toBe("was undefined")
      }))
  })

  describe("getOnlyOneEffect", () => {
    it.effect("succeeds for single-element array", () =>
      Effect.gen(function*() {
        const result = yield* getOnlyOneEffect([99], (arr) => `bad: ${arr.length}`)
        expect(result).toBe(99)
      }))

    it.effect("fails for empty array with error receiving the array", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getOnlyOneEffect([], (arr) => `expected 1, got ${arr.length}`))
        expect(error).toBe("expected 1, got 0")
      }))

    it.effect("fails for multi-element array with error receiving the array", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getOnlyOneEffect([1, 2, 3], (arr) => `expected 1, got ${arr.length}`))
        expect(error).toBe("expected 1, got 3")
      }))
  })

  describe("getFirstEffect", () => {
    it.effect("succeeds with first element of non-empty array", () =>
      Effect.gen(function*() {
        const result = yield* getFirstEffect([10, 20], () => "empty")
        expect(result).toBe(10)
      }))

    it.effect("succeeds for single-element array", () =>
      Effect.gen(function*() {
        const result = yield* getFirstEffect(["only"], () => "empty")
        expect(result).toBe("only")
      }))

    it.effect("fails for empty array", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getFirstEffect([], () => "no elements"))
        expect(error).toBe("no elements")
      }))
  })

  describe("getOneOrNoneEffect", () => {
    it.effect("succeeds with Option.none() for empty array", () =>
      Effect.gen(function*() {
        const result = yield* getOneOrNoneEffect([], (arr) => `too many: ${arr.length}`)
        expect(Option.isNone(result)).toBe(true)
      }))

    it.effect("succeeds with Option.some(element) for single-element array", () =>
      Effect.gen(function*() {
        const result = yield* getOneOrNoneEffect([42], (arr) => `too many: ${arr.length}`)
        expect(Option.isSome(result)).toBe(true)
        expect(Option.getOrThrow(result)).toBe(42)
      }))

    it.effect("fails for array with 2+ elements with error receiving the array", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getOneOrNoneEffect([1, 2], (arr) => `too many: ${arr.length}`))
        expect(error).toBe("too many: 2")
      }))

    it.effect("fails for array with 3 elements", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getOneOrNoneEffect([1, 2, 3], (arr) => `too many: ${arr.length}`))
        expect(error).toBe("too many: 3")
      }))
  })
})
