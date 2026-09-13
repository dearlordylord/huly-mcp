/**
 * The ITF JSON dialect the oracle daemon parses, and the bridge from
 * JavaScript values onto it.
 *
 * Values are serialized to canonical JSON text by hand: `JSON.stringify`
 * cannot render a bigint at all, and the dialect needs full-precision bare
 * integers up to i64 (beyond `Number.MAX_SAFE_INTEGER`).
 *
 * The automatic bridge is capped at exactly what the Rust reference client
 * converts: booleans and strings bare; integers bare within i64, else
 * `{"#bigint": "…"}`; arrays to lists; `Set` to `{"#set": […]}` and `Map` to
 * `{"#map": [[k, v], …]}`, both in insertion order. Everything else — plain
 * objects, floats, `null`, `undefined` — is rejected with an error naming the
 * kind: records, tuples and the rest of the ITF forms are hand-built through
 * the {@link value} constructors, or supplied by a domain type's own
 * {@link ToLogged.toLogged} method.
 */

/** What the automatic bridge accepts in a logged value. */
export type Loggable =
  | boolean
  | string
  | number
  | bigint
  | Loggable[]
  | Set<Loggable>
  | Map<Loggable, Loggable>
  | Value
  | ToLogged;

/**
 * The extension hook for domain types: implement `toLogged()` returning a
 * hand-built {@link Value} and instances become loggable directly. Checked
 * before every built-in conversion, so it also overrides the automatic
 * bridge for subclasses of `Set`/`Map`/`Array`.
 */
export interface ToLogged {
  toLogged(): Value;
}

/**
 * A loggable value, or a zero-argument thunk producing one. Thunks are legal
 * only at value position (an argument's value, an assertion's expected value,
 * the value inside {@link Tagged}) and are invoked there only when the oracle
 * is live — the escape hatch for values that are expensive to build.
 */
export type LazyLoggable = Loggable | (() => Loggable);

/**
 * One hand-built ITF value, mirroring the Rust client's `itf::Value`: the
 * {@link value} constructors cover every ITF form, including the ones the
 * automatic bridge deliberately refuses (records, tuples). A payload-free
 * variant is logged as its name — a plain string; there is no variant helper.
 */
export class Value {
  /**
   * The canonical ITF JSON text of this value — internal; produced only by
   * the {@link value} constructors and consumed by the serializer.
   */
  readonly json: string;

  /** @internal Use the {@link value} constructors. */
  constructor(json: string) {
    this.json = json;
  }
}

const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;

function encodeInt(n: number | bigint): string {
  if (typeof n === "number") {
    if (!Number.isSafeInteger(n)) {
      throw integerError(n);
    }
    return String(n);
  }
  return n >= I64_MIN && n <= I64_MAX ? n.toString() : `{"#bigint":"${n}"}`;
}

function integerError(n: number): TypeError {
  return new TypeError(
    Number.isInteger(n)
      ? `cannot log the number ${n}: beyond Number.isSafeInteger, its value is ` +
          `imprecise — pass a bigint instead`
      : `cannot log the float ${n}: the oracle's ITF dialect has no floats`,
  );
}

/**
 * Constructors for every ITF form, one per form — the hand-built layer for
 * values the automatic bridge cannot infer (records, tuples) or that need an
 * exact form regardless of the input's runtime type.
 */
export const value = {
  /** A bare boolean. */
  bool(b: boolean): Value {
    return new Value(b ? "true" : "false");
  },

  /** A bare string. */
  str(s: string): Value {
    return new Value(JSON.stringify(s));
  },

  /** An integer: bare within i64, `{"#bigint": "…"}` beyond. */
  int(n: number | bigint): Value {
    return new Value(encodeInt(n));
  },

  /** A list: a plain JSON array. */
  list(...items: Loggable[]): Value {
    return new Value(`[${items.map(encode).join(",")}]`);
  },

  /** A set: `{"#set": […]}`, in the order given. */
  set(...items: Loggable[]): Value {
    return new Value(`{"#set":[${items.map(encode).join(",")}]}`);
  },

  /** A tuple: `{"#tup": […]}`. */
  tuple(...items: Loggable[]): Value {
    return new Value(`{"#tup":[${items.map(encode).join(",")}]}`);
  },

  /** A map: `{"#map": [[k, v], …]}`, in the order given. */
  map(entries: Iterable<[Loggable, Loggable]>): Value {
    const rendered = [...entries].map(
      ([k, v]) => `[${encode(k)},${encode(v)}]`,
    );
    return new Value(`{"#map":[${rendered.join(",")}]}`);
  },

  /** A record: a plain JSON object of named fields, in the order given. */
  record(fields: Record<string, Loggable>): Value {
    const rendered = Object.entries(fields).map(
      ([name, v]) => `${JSON.stringify(name)}:${encode(v)}`,
    );
    return new Value(`{${rendered.join(",")}}`);
  },
};

function hasToLogged(v: object): v is ToLogged {
  return typeof (v as Partial<ToLogged>).toLogged === "function";
}

/** Serialize one loggable value to its canonical ITF JSON text. */
export function encode(v: unknown): string {
  if (v instanceof Value) {
    return v.json;
  }
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "string":
      return JSON.stringify(v);
    case "number":
    case "bigint":
      return encodeInt(v);
    case "function":
      throw new TypeError(
        "cannot log a function: a zero-argument thunk is lazy only at value " +
          "position (an argument's value, an assertion's expected value), " +
          "never inside a collection",
      );
  }
  if (v !== null && typeof v === "object") {
    if (hasToLogged(v)) {
      const out = v.toLogged();
      if (!(out instanceof Value)) {
        throw new TypeError("toLogged() must return a quint-oracle Value");
      }
      return out.json;
    }
    if (Array.isArray(v)) {
      return `[${v.map(encode).join(",")}]`;
    }
    if (v instanceof Set) {
      return `{"#set":[${[...v].map(encode).join(",")}]}`;
    }
    if (v instanceof Map) {
      const rendered = [...v].map(
        ([k, val]) => `[${encode(k)},${encode(val)}]`,
      );
      return `{"#map":[${rendered.join(",")}]}`;
    }
  }
  throw new TypeError(
    `cannot log a ${kindOf(v)}: the automatic bridge is capped at booleans, ` +
      `strings, integers, bigints, arrays, Sets and Maps — hand-build other ` +
      `shapes with the value.* constructors or a toLogged() method`,
  );
}

/**
 * {@link encode}, with thunks honoured: this is value position, so a
 * zero-argument function is invoked and its result encoded.
 */
export function encodeLazy(v: unknown): string {
  if (typeof v === "function" && v.length === 0) {
    return encode((v as () => unknown)());
  }
  return encode(v);
}

function kindOf(v: unknown): string {
  if (v === null) {
    return "null";
  }
  if (v === undefined) {
    return "undefined";
  }
  if (typeof v !== "object") {
    return typeof v;
  }
  const name = (v as object).constructor?.name;
  return name && name !== "Object" ? `${name} instance` : "plain object";
}

/** A value tagged with the spec constant (its *domain*) it is appended to. */
export class Tagged {
  constructor(
    readonly value: LazyLoggable,
    readonly domain: string,
  ) {}
}

/**
 * One segment of an assertion path: a variable name or record field
 * (string), or a dynamic map key (an integer within i64 — the daemon
 * resolves no other key shape).
 */
export type PathSegment = string | number | bigint;

/**
 * One post-state assertion: after the observed action, the spec value at
 * `path` must equal `expected`. Validation happens at log time, so building
 * one is free (and inert) when the oracle is disabled.
 */
export class PostState {
  constructor(
    readonly path: PathSegment[],
    readonly expected: LazyLoggable,
  ) {}
}

/**
 * The wire form of one assertion path segment: strings render raw, integers
 * as decimal strings. Anything else is rejected — the daemon resolves no
 * other key shape.
 */
export function renderPathSegment(seg: unknown): string {
  if (typeof seg === "string") {
    return seg;
  }
  if (typeof seg === "number" && Number.isSafeInteger(seg)) {
    return String(seg);
  }
  if (typeof seg === "bigint" && seg >= I64_MIN && seg <= I64_MAX) {
    return seg.toString();
  }
  throw new TypeError(
    `an assertion path segment must be a string or an integer within i64 — ` +
      `the daemon resolves no other key shape; got ${kindOf(seg)}`,
  );
}
