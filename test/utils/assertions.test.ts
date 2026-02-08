import { describe, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { expect } from "vitest"
import {
  assertExists,
  assertExistsEffect,
  assertNonEmpty,
  assertNotNull,
  getFirst,
  getFirstEffect,
  getOneOrNone,
  getOneOrNoneEffect,
  getOnlyOne,
  getOnlyOneEffect,
  isExistent,
  isNonEmpty
} from "../../src/utils/assertions.js"

describe("assertions", () => {
  describe("assertExists", () => {
    // test-revizorro: approved
    it("returns the value when it is defined", () => {
      expect(assertExists(42)).toBe(42)
      expect(assertExists("hello")).toBe("hello")
      expect(assertExists(0)).toBe(0)
      expect(assertExists("")).toBe("")
      expect(assertExists(false)).toBe(false)
    })

    // test-revizorro: approved
    it("throws on null with default message", () => {
      expect(() => assertExists(null)).toThrow("Expected value to exist")
    })

    // test-revizorro: approved
    it("throws on undefined with default message", () => {
      expect(() => assertExists(undefined)).toThrow("Expected value to exist")
    })

    // test-revizorro: approved
    it("throws with custom message", () => {
      expect(() => assertExists(null, "missing user")).toThrow("missing user")
      expect(() => assertExists(undefined, "missing user")).toThrow("missing user")
    })

    // test-revizorro: approved
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
    // test-revizorro: approved
    it("returns true for defined values", () => {
      expect(isExistent(42)).toBe(true)
      expect(isExistent("")).toBe(true)
      expect(isExistent(0)).toBe(true)
      expect(isExistent(false)).toBe(true)
    })

    // test-revizorro: approved
    it("returns false for null", () => {
      expect(isExistent(null)).toBe(false)
    })

    // test-revizorro: approved
    it("returns false for undefined", () => {
      expect(isExistent(undefined)).toBe(false)
    })
  })

  describe("assertNotNull", () => {
    // test-revizorro: approved
    it("returns the value when not null", () => {
      expect(assertNotNull(42)).toBe(42)
      expect(assertNotNull("hello")).toBe("hello")
      expect(assertNotNull(0)).toBe(0)
      expect(assertNotNull(false)).toBe(false)
    })

    // test-revizorro: approved
    it("throws on null with default message", () => {
      expect(() => assertNotNull(null)).toThrow("Expected value to not be null")
    })

    // test-revizorro: approved
    it("throws with custom message", () => {
      expect(() => assertNotNull(null, "value was null")).toThrow("value was null")
    })

    // test-revizorro: approved
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
    // test-revizorro: approved
    it("returns the element for single-element array", () => {
      expect(getOnlyOne([42])).toBe(42)
      expect(getOnlyOne(["only"])).toBe("only")
    })

    // test-revizorro: approved
    it("throws for empty array with default message", () => {
      expect(() => getOnlyOne([])).toThrow("Expected exactly 1 element, got 0")
    })

    // test-revizorro: approved
    it("throws for multi-element array with default message", () => {
      expect(() => getOnlyOne([1, 2])).toThrow("Expected exactly 1 element, got 2")
      expect(() => getOnlyOne([1, 2, 3])).toThrow("Expected exactly 1 element, got 3")
    })

    // test-revizorro: approved
    it("throws with custom string message", () => {
      expect(() => getOnlyOne([], "need exactly one")).toThrow("need exactly one")
      expect(() => getOnlyOne([1, 2], "need exactly one")).toThrow("need exactly one")
    })

    // test-revizorro: approved
    it("throws with custom function message receiving the array", () => {
      const msgFn = (arr: ReadonlyArray<number>) => `got ${arr.length} items: ${arr.join(",")}`
      expect(() => getOnlyOne([], msgFn)).toThrow("got 0 items: ")
      expect(() => getOnlyOne([1, 2, 3], msgFn)).toThrow("got 3 items: 1,2,3")
    })
  })

  describe("getFirst", () => {
    // test-revizorro: approved
    it("returns first element of non-empty array", () => {
      expect(getFirst([10, 20, 30])).toBe(10)
      expect(getFirst(["a"])).toBe("a")
    })

    // test-revizorro: approved
    it("throws for empty array with default message", () => {
      expect(() => getFirst([])).toThrow("Expected non-empty array")
    })

    // test-revizorro: approved
    it("throws with custom message", () => {
      expect(() => getFirst([], "no items found")).toThrow("no items found")
    })
  })

  describe("assertNonEmpty", () => {
    // test-revizorro: approved
    it("returns the array for non-empty input", () => {
      const result = assertNonEmpty([1, 2, 3])
      expect(result).toEqual([1, 2, 3])
    })

    // test-revizorro: approved
    it("returns single-element array", () => {
      const result = assertNonEmpty(["x"])
      expect(result).toEqual(["x"])
    })

    // test-revizorro: approved
    it("throws for empty array with default message", () => {
      expect(() => assertNonEmpty([])).toThrow("Expected non-empty array")
    })

    // test-revizorro: approved
    it("throws with custom message", () => {
      expect(() => assertNonEmpty([], "list must not be empty")).toThrow("list must not be empty")
    })
  })

  describe("isNonEmpty", () => {
    // test-revizorro: approved
    it("returns true for non-empty array", () => {
      expect(isNonEmpty([1])).toBe(true)
      expect(isNonEmpty([1, 2, 3])).toBe(true)
    })

    // test-revizorro: approved
    it("returns false for empty array", () => {
      expect(isNonEmpty([])).toBe(false)
    })
  })

  describe("getOneOrNone", () => {
    // test-revizorro: approved
    it("returns Option.none() for empty array", () => {
      const result = getOneOrNone([])
      expect(Option.isNone(result)).toBe(true)
    })

    // test-revizorro: approved
    it("returns Option.some(element) for single-element array", () => {
      const result = getOneOrNone([42])
      expect(Option.isSome(result)).toBe(true)
      expect(Option.getOrThrow(result)).toBe(42)
    })

    // test-revizorro: approved
    it("throws for array with 2+ elements with default message", () => {
      expect(() => getOneOrNone([1, 2])).toThrow("Expected 0 or 1 elements, got 2")
      expect(() => getOneOrNone([1, 2, 3])).toThrow("Expected 0 or 1 elements, got 3")
    })

    // test-revizorro: approved
    it("throws with custom message for 2+ elements", () => {
      expect(() => getOneOrNone([1, 2], "too many")).toThrow("too many")
    })
  })

  describe("assertExistsEffect", () => {
    // test-revizorro: approved
    it.effect("succeeds with the value when defined", () =>
      Effect.gen(function*() {
        const result = yield* assertExistsEffect(42, () => "missing")
        expect(result).toBe(42)
      }))

    // test-revizorro: approved
    it.effect("succeeds with falsy defined values", () =>
      Effect.gen(function*() {
        expect(yield* assertExistsEffect(0, () => "missing")).toBe(0)
        expect(yield* assertExistsEffect("", () => "missing")).toBe("")
        expect(yield* assertExistsEffect(false, () => "missing")).toBe(false)
      }))

    // test-revizorro: approved
    it.effect("fails for null", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(assertExistsEffect(null, () => "was null"))
        expect(error).toBe("was null")
      }))

    // test-revizorro: approved
    it.effect("fails for undefined", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(assertExistsEffect(undefined, () => "was undefined"))
        expect(error).toBe("was undefined")
      }))
  })

  describe("getOnlyOneEffect", () => {
    // test-revizorro: approved
    it.effect("succeeds for single-element array", () =>
      Effect.gen(function*() {
        const result = yield* getOnlyOneEffect([99], (arr) => `bad: ${arr.length}`)
        expect(result).toBe(99)
      }))

    // test-revizorro: approved
    it.effect("fails for empty array with error receiving the array", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getOnlyOneEffect([], (arr) => `expected 1, got ${arr.length}`))
        expect(error).toBe("expected 1, got 0")
      }))

    // test-revizorro: approved
    it.effect("fails for multi-element array with error receiving the array", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getOnlyOneEffect([1, 2, 3], (arr) => `expected 1, got ${arr.length}`))
        expect(error).toBe("expected 1, got 3")
      }))
  })

  describe("getFirstEffect", () => {
    // test-revizorro: approved
    it.effect("succeeds with first element of non-empty array", () =>
      Effect.gen(function*() {
        const result = yield* getFirstEffect([10, 20], () => "empty")
        expect(result).toBe(10)
      }))

    // test-revizorro: approved
    it.effect("succeeds for single-element array", () =>
      Effect.gen(function*() {
        const result = yield* getFirstEffect(["only"], () => "empty")
        expect(result).toBe("only")
      }))

    // test-revizorro: approved
    it.effect("fails for empty array", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getFirstEffect([], () => "no elements"))
        expect(error).toBe("no elements")
      }))
  })

  describe("getOneOrNoneEffect", () => {
    // test-revizorro: approved
    it.effect("succeeds with Option.none() for empty array", () =>
      Effect.gen(function*() {
        const result = yield* getOneOrNoneEffect([], (arr) => `too many: ${arr.length}`)
        expect(Option.isNone(result)).toBe(true)
      }))

    // test-revizorro: approved
    it.effect("succeeds with Option.some(element) for single-element array", () =>
      Effect.gen(function*() {
        const result = yield* getOneOrNoneEffect([42], (arr) => `too many: ${arr.length}`)
        expect(Option.isSome(result)).toBe(true)
        expect(Option.getOrThrow(result)).toBe(42)
      }))

    // test-revizorro: approved
    it.effect("fails for array with 2+ elements with error receiving the array", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getOneOrNoneEffect([1, 2], (arr) => `too many: ${arr.length}`))
        expect(error).toBe("too many: 2")
      }))

    // test-revizorro: approved
    it.effect("fails for array with 3 elements", () =>
      Effect.gen(function*() {
        const error = yield* Effect.flip(getOneOrNoneEffect([1, 2, 3], (arr) => `too many: ${arr.length}`))
        expect(error).toBe("too many: 3")
      }))
  })
})
